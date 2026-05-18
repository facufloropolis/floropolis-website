#!/usr/bin/env python3
"""
W5-S16 — One-time migration: floropolis-bi (Rose) -> supabase-backup.

Phase 4 SEGURISIMA isolation: the new transactional system lives entirely on
supabase-backup. Existing wholesale florists signed up against floropolis-bi
between 2026-03-23 and today. We copy them across preserving their UUIDs so any
historical ties (in-flight orders, identities) still link without forcing a
re-signup.

What this script does
---------------------
1. Lists every user in floropolis-bi.auth.users via the Admin API.
2. For each user, checks if the same UUID already exists in supabase-backup.
   - If yes -> SKIP (idempotent).
   - If no  -> CREATE via POST /auth/v1/admin/users with the same `id`,
              `email`, `phone`, `email_confirm`, `user_metadata`,
              `app_metadata`, and the original `created_at`.
3. Upserts a stub row into supabase-backup.public.client_profiles with
   status='approved' (or the mapped source status if a source profile row
   exists), preserving business_name + phone + koronet_id + notes when
   present.

What this script does NOT do
----------------------------
- Migrate passwords. Supabase Admin API does not expose `encrypted_password`.
  Email/password users will need to do a Forgot Password flow on backup.
  Google OAuth users can sign in immediately (same email -> Supabase links the
  Google identity on first login; `email_confirmed_at` is preserved so no
  email verify is required).
- Project-scoped auth metadata (refresh tokens, sessions, JWT-iss, mfa
  factors). Not relevant for fresh project.

Source profile data note
------------------------
floropolis-bi.public.client_profiles is NOT the auth-linked profile table.
It is Rose's komet_buyer_ltv aggregate (buyer_id text-keyed). The auth-linked
client_profiles table only exists in supabase-backup. So for each user we
synthesize a stub backup profile, sourcing business_name from the auth
user_metadata when available.

Flags
-----
  --dry-run         No writes. Print plan only. Safe to repeat.
  --limit N         Only consider the first N source users (post-sort).
  --email <e>       Only migrate the user whose source email == <e>.

Env vars
--------
  SOURCE_SUPABASE_URL          https://swhglnjyuorkycpgkmec.supabase.co
  SOURCE_SUPABASE_SERVICE_KEY  floropolis-bi service role key
  BACKUP_SUPABASE_URL          https://ibckhcjvyxzrhvdiazbx.supabase.co
  BACKUP_SUPABASE_SERVICE_KEY  supabase-backup service role key

Output
------
- Per-user log line on stdout.
- Summary {migrated, skipped, failed, total}.
- JSON state file at /tmp/user_migration_<YYYY-MM-DD>.json for audit.

Exit codes
----------
0 = success (or no users to migrate)
1 = at least one user failed
2 = missing required env vars / config error
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from typing import Any


# ----------------------------------------------------------------------------
# HTTP helpers (stdlib only — matches W3-S10 pattern)
# ----------------------------------------------------------------------------

def _request(
    url: str,
    headers: dict,
    data: bytes | None = None,
    method: str = "GET",
    timeout: int = 60,
) -> tuple[int, bytes]:
    req = urllib.request.Request(url, headers=headers, data=data, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as e:
        body = b""
        try:
            body = e.read()
        except Exception:
            pass
        return e.code, body


def _service_headers(key: str, prefer: str | None = None) -> dict:
    h = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    if prefer:
        h["Prefer"] = prefer
    return h


# ----------------------------------------------------------------------------
# Source / destination accessors
# ----------------------------------------------------------------------------

def src_admin_list_users(src_url: str, src_key: str) -> list[dict]:
    """GET /auth/v1/admin/users — paginated."""
    out: list[dict] = []
    page = 1
    per_page = 200
    while True:
        url = f"{src_url.rstrip('/')}/auth/v1/admin/users?page={page}&per_page={per_page}"
        status, body = _request(url, _service_headers(src_key))
        if status != 200:
            raise RuntimeError(f"src list_users page={page} HTTP {status}: {body[:300]!r}")
        payload = json.loads(body)
        users = payload.get("users") if isinstance(payload, dict) else payload
        if not users:
            break
        out.extend(users)
        if len(users) < per_page:
            break
        page += 1
    return out


def backup_user_exists(bak_url: str, bak_key: str, user_id: str) -> bool:
    """GET /auth/v1/admin/users/{id} — 200 = exists, 404 = not."""
    url = f"{bak_url.rstrip('/')}/auth/v1/admin/users/{user_id}"
    status, _ = _request(url, _service_headers(bak_key))
    return status == 200


def backup_create_user(bak_url: str, bak_key: str, src_user: dict) -> tuple[bool, str]:
    """POST /auth/v1/admin/users preserving id + created_at + metadata."""
    body = {
        "id": src_user["id"],
        "email": src_user.get("email"),
        "phone": src_user.get("phone"),
        "email_confirm": bool(src_user.get("email_confirmed_at")),
        "phone_confirm": bool(src_user.get("phone_confirmed_at")),
        "user_metadata": src_user.get("user_metadata") or src_user.get("raw_user_meta_data") or {},
        "app_metadata": src_user.get("app_metadata") or src_user.get("raw_app_meta_data") or {},
    }
    # Supabase Admin API accepts created_at on user creation; preserves it.
    if src_user.get("created_at"):
        body["created_at"] = src_user["created_at"]
    payload = json.dumps({k: v for k, v in body.items() if v is not None}).encode("utf-8")
    url = f"{bak_url.rstrip('/')}/auth/v1/admin/users"
    status, resp = _request(url, _service_headers(bak_key), payload, "POST")
    if status in (200, 201):
        return True, ""
    return False, f"HTTP {status}: {resp[:300].decode('utf-8', 'replace')}"


def backup_profile_exists(bak_url: str, bak_key: str, user_id: str) -> bool:
    url = (
        f"{bak_url.rstrip('/')}/rest/v1/client_profiles"
        f"?user_id=eq.{user_id}&select=user_id"
    )
    status, body = _request(url, _service_headers(bak_key))
    if status != 200:
        return False
    try:
        rows = json.loads(body)
        return isinstance(rows, list) and len(rows) > 0
    except Exception:
        return False


def backup_create_profile(
    bak_url: str,
    bak_key: str,
    user_id: str,
    business_name: str | None,
    phone: str | None,
    status_val: str,
    koronet_id: str | None,
    notes: str | None,
    created_at: str | None,
    approved_at: str | None,
) -> tuple[bool, str]:
    row = {
        "user_id": user_id,
        "business_name": business_name,
        "phone": phone,
        "status": status_val,
        "koronet_id": koronet_id,
        "notes": notes,
    }
    if created_at:
        row["created_at"] = created_at
    if approved_at:
        row["approved_at"] = approved_at
    payload = json.dumps([{k: v for k, v in row.items() if v is not None}]).encode("utf-8")
    url = f"{bak_url.rstrip('/')}/rest/v1/client_profiles"
    headers = _service_headers(bak_key, prefer="resolution=merge-duplicates,return=minimal")
    status, resp = _request(url, headers, payload, "POST")
    if status in (200, 201, 204):
        return True, ""
    return False, f"HTTP {status}: {resp[:300].decode('utf-8', 'replace')}"


# ----------------------------------------------------------------------------
# Mapping
# ----------------------------------------------------------------------------

ALLOWED_STATUSES = {"pending", "approved", "rejected"}


def map_status(raw: str | None) -> str:
    if raw and raw.lower() in ALLOWED_STATUSES:
        return raw.lower()
    return "approved"  # default per W5-S16 spec


def extract_business_name(src_user: dict) -> str | None:
    """Pull business_name from user_metadata if present; else fall back to full_name."""
    md = src_user.get("user_metadata") or src_user.get("raw_user_meta_data") or {}
    if not isinstance(md, dict):
        return None
    for key in ("business_name", "company", "company_name"):
        v = md.get(key)
        if isinstance(v, str) and v.strip():
            return v.strip()
    # Soft fallback so the row isn't completely blank — flag with [needs review].
    name = md.get("full_name") or md.get("name")
    if isinstance(name, str) and name.strip():
        return f"{name.strip()} [needs review]"
    return None


def is_oauth_only(src_user: dict) -> bool:
    app_md = src_user.get("app_metadata") or src_user.get("raw_app_meta_data") or {}
    if isinstance(app_md, dict):
        provs = app_md.get("providers") or []
        if isinstance(provs, list) and provs and "email" not in provs:
            return True
        prov = app_md.get("provider")
        if isinstance(prov, str) and prov != "email":
            return True
    return False


# ----------------------------------------------------------------------------
# Main
# ----------------------------------------------------------------------------

def main(argv: list[str]) -> int:
    p = argparse.ArgumentParser(description="Migrate users from floropolis-bi to supabase-backup.")
    p.add_argument("--dry-run", action="store_true", help="Print plan only; no writes.")
    p.add_argument("--limit", type=int, default=0, help="Only process first N source users.")
    p.add_argument("--email", type=str, default="", help="Only migrate the user with this email.")
    args = p.parse_args(argv)

    required = (
        "SOURCE_SUPABASE_URL",
        "SOURCE_SUPABASE_SERVICE_KEY",
        "BACKUP_SUPABASE_URL",
        "BACKUP_SUPABASE_SERVICE_KEY",
    )
    missing = [k for k in required if not os.environ.get(k)]
    if missing:
        print(f"ERROR: missing env vars: {missing}", file=sys.stderr)
        print("Hint: source service key is in Rose_BI/config/supabase_config.json.", file=sys.stderr)
        return 2

    src_url = os.environ["SOURCE_SUPABASE_URL"]
    src_key = os.environ["SOURCE_SUPABASE_SERVICE_KEY"]
    bak_url = os.environ["BACKUP_SUPABASE_URL"]
    bak_key = os.environ["BACKUP_SUPABASE_SERVICE_KEY"]

    mode = "DRY-RUN" if args.dry_run else "LIVE"
    print(f"=== migrate_users_prod_to_backup.py [{mode}] ===")
    print(f"source : {src_url}")
    print(f"backup : {bak_url}")

    # 1. Fetch source
    try:
        src_users = src_admin_list_users(src_url, src_key)
    except Exception as e:
        print(f"ERROR pulling source users: {e}", file=sys.stderr)
        return 2

    print(f"source users found: {len(src_users)}")
    if not src_users:
        print("Nothing to migrate. Exiting cleanly.")
        _write_state({"mode": mode, "total": 0, "migrated": 0, "skipped": 0, "failed": 0,
                      "users": []})
        return 0

    # Sort for stable output
    src_users.sort(key=lambda u: u.get("created_at") or "")

    # Filter
    if args.email:
        src_users = [u for u in src_users if (u.get("email") or "").lower() == args.email.lower()]
        print(f"--email filter: {len(src_users)} match(es)")
    if args.limit and args.limit > 0:
        src_users = src_users[: args.limit]
        print(f"--limit {args.limit}: capped to {len(src_users)} user(s)")

    # 2. Per-user plan
    counters = {"migrated": 0, "skipped": 0, "failed": 0}
    audit: list[dict] = []

    for u in src_users:
        uid = u.get("id") or ""
        email = u.get("email") or "(no-email)"
        business = extract_business_name(u)
        status_val = map_status(None)  # source has no status column; default approved
        oauth = is_oauth_only(u)
        created_at = u.get("created_at")
        approved_at = u.get("email_confirmed_at")

        record: dict[str, Any] = {
            "user_id": uid,
            "email": email,
            "business_name": business,
            "status": status_val,
            "oauth_only": oauth,
            "created_at": created_at,
        }

        try:
            already = backup_user_exists(bak_url, bak_key, uid)
        except Exception as e:
            print(f"FAILED user_id={uid} email={email}: probe error: {e}", file=sys.stderr)
            record.update({"action": "FAILED", "error": f"probe: {e}"})
            audit.append(record)
            counters["failed"] += 1
            continue

        if already:
            print(f"SKIPPED user_id={uid} email={email} (already exists in backup)")
            record["action"] = "SKIPPED"
            audit.append(record)
            counters["skipped"] += 1
            continue

        action_label = (
            f"MIGRATING user_id={uid} email={email} business_name={business} "
            f"-> status={status_val} oauth_only={oauth}"
        )
        print(action_label)

        if args.dry_run:
            record["action"] = "WOULD_MIGRATE"
            audit.append(record)
            counters["migrated"] += 1
            continue

        ok, err = backup_create_user(bak_url, bak_key, u)
        if not ok:
            print(f"  FAIL create auth user: {err}", file=sys.stderr)
            record.update({"action": "FAILED", "error": f"auth: {err}"})
            audit.append(record)
            counters["failed"] += 1
            continue

        ok, err = backup_create_profile(
            bak_url, bak_key,
            user_id=uid,
            business_name=business,
            phone=u.get("phone"),
            status_val=status_val,
            koronet_id=None,    # not present on source auth
            notes=("auto-migrated from floropolis-bi 2026-05-17 (W5-S16)"),
            created_at=created_at,
            approved_at=approved_at,
        )
        if not ok:
            print(f"  WARN profile insert: {err}", file=sys.stderr)
            record.update({"action": "PARTIAL", "error": f"profile: {err}"})
            audit.append(record)
            counters["failed"] += 1
            continue

        record["action"] = "MIGRATED"
        audit.append(record)
        counters["migrated"] += 1

    total = len(src_users)
    print()
    print(f"SUMMARY [{mode}]: total={total} migrated={counters['migrated']} "
          f"skipped={counters['skipped']} failed={counters['failed']}")

    state_path = _write_state({
        "mode": mode,
        "ran_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "total": total,
        "migrated": counters["migrated"],
        "skipped": counters["skipped"],
        "failed": counters["failed"],
        "users": audit,
    })
    print(f"audit json: {state_path}")

    return 0 if counters["failed"] == 0 else 1


def _write_state(state: dict) -> str:
    today = dt.date.today().isoformat()
    path = f"/tmp/user_migration_{today}.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2, default=str)
    return path


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
