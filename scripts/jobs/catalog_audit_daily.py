#!/usr/bin/env python3
"""
Catalog Audit Daily -- day-over-day change detector for floropolis_inventory.
v1 | 2026-05-17 | Job_PM [V8 SHADOW]

DIFFERENT from Subagent A (inventory_data_validator.py):
  - Subagent A validates a SINGLE day's snapshot against rules (formula, gaps).
  - This script compares TODAY vs YESTERDAY to surface CHANGES that humans miss.

Computed deltas:
  - Catalog visibility change: rows with (price > 0 AND has_open_price_alert = false)
    today vs yesterday. % delta.
  - New vendors: any vendor present today that was not present yesterday.
  - Price changes: for SKUs present both days, count changed, mean/max delta,
    count with > 15% movement.
  - SKU churn: new IDs today, disappeared IDs since yesterday.

Storage:
  - public.inventory_validation_snapshots in supabase-backup (PK = snapshot_date).
  - Today's row holds the audit JSON in `catalog_audit_json`. The validator_json
    column is populated either by this script (best-effort, by reading /tmp file
    Subagent A writes) or left as an empty stub if not available.
  - Yesterday's snapshot is read from the same table by date = today - 1.

Critical alerts (email Facu via Brevo) when ANY of:
  - Catalog visibility dropped > 20% vs yesterday
  - > 0 new vendors (even one is worth knowing)
  - > 5% of overlapping SKUs have price change > 15%

If yesterday's snapshot does not exist (first run): skip delta, store today's
baseline, print "no baseline yet", exit 0.

Env vars:
  SUPABASE_URL          required -- supabase-backup URL
  SUPABASE_SERVICE_KEY  required -- supabase-backup service key
  INVENTORY_TABLE       optional (default: floropolis_inventory_mirror)
  BREVO_API_KEY         optional (skip email if missing)
  REPORT_TO             optional (default: faculavino@gmail.com)
"""

from __future__ import annotations

import datetime as dt
import json
import os
import statistics
import sys
import urllib.error
import urllib.request


SNAPSHOTS_TABLE = "inventory_validation_snapshots"

# Alert thresholds
VISIBILITY_DROP_PCT_THRESHOLD = 20.0   # alert if today visible drops > 20% vs yesterday
PRICE_CHANGE_BIG_PCT = 15.0             # a "big" price move per SKU
BIG_MOVE_SHARE_PCT_THRESHOLD = 5.0      # alert if > 5% of overlapping SKUs moved > 15%


# ============================================================================
# HTTP helpers (stdlib only)
# ============================================================================


def _supabase_url() -> str:
    return os.environ["SUPABASE_URL"].rstrip("/")


def _headers(extra: dict | None = None) -> dict:
    key = os.environ["SUPABASE_SERVICE_KEY"]
    h = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    if extra:
        h.update(extra)
    return h


def _request(url: str, headers: dict, data: bytes | None = None, method: str = "GET") -> bytes:
    req = urllib.request.Request(url, headers=headers, data=data, method=method)
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read()


def execute_sql(query: str) -> list[dict]:
    """Run raw SQL via execute_sql RPC (same idiom as Subagent A)."""
    url = _supabase_url() + "/rest/v1/rpc/execute_sql"
    raw = _request(url, _headers(), json.dumps({"query": query}).encode("utf-8"), "POST")
    payload = json.loads(raw) if raw else None
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        if isinstance(payload.get("data"), list):
            return payload["data"]
        if isinstance(payload.get("rows"), list):
            return payload["rows"]
    return []


# ============================================================================
# Snapshot table I/O
# ============================================================================


def fetch_yesterday_audit(yesterday: dt.date) -> dict | None:
    """Pull yesterday's catalog_audit_json (the per-SKU price/vendor index)."""
    url = (
        _supabase_url()
        + f"/rest/v1/{SNAPSHOTS_TABLE}"
        + f"?snapshot_date=eq.{yesterday.isoformat()}"
        + "&select=snapshot_date,catalog_audit_json"
    )
    raw = _request(url, _headers(), None, "GET")
    rows = json.loads(raw) if raw else []
    if not rows:
        return None
    return rows[0].get("catalog_audit_json")


def upsert_today_snapshot(today: dt.date, validator_json: dict, catalog_audit_json: dict) -> None:
    """Insert or update today's row. Uses Prefer: resolution=merge-duplicates for upsert on PK."""
    url = _supabase_url() + f"/rest/v1/{SNAPSHOTS_TABLE}"
    payload = json.dumps([{
        "snapshot_date": today.isoformat(),
        "validator_json": validator_json,
        "catalog_audit_json": catalog_audit_json,
    }]).encode("utf-8")
    headers = _headers({
        "Prefer": "resolution=merge-duplicates,return=minimal",
    })
    _request(url, headers, payload, "POST")


def load_local_validator_summary(today: dt.date) -> dict:
    """Best-effort load of Subagent A's /tmp state file if it ran earlier today.

    Not fatal if missing -- we store a small stub so the NOT NULL constraint passes.
    """
    path = f"/tmp/inventory_validation_{today.isoformat()}.json"
    try:
        with open(path) as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return {
            "stub": True,
            "note": "validator_json populated by catalog_audit_daily.py stub; "
                    "Subagent A /tmp file not present in this worker.",
            "date": today.isoformat(),
        }


# ============================================================================
# Today's mirror -> compact per-SKU index
# ============================================================================


def fetch_today_index() -> list[dict]:
    """Pull today's inventory state as a slim per-SKU list.

    Only the fields needed for delta detection (id, vendor, price,
    has_open_price_alert). This is what we store in catalog_audit_json so
    tomorrow's run can diff against today.
    """
    table = os.environ.get("INVENTORY_TABLE", "floropolis_inventory_mirror")
    if table not in ("floropolis_inventory", "floropolis_inventory_mirror"):
        raise ValueError(
            f"INVENTORY_TABLE must be floropolis_inventory or floropolis_inventory_mirror, got {table!r}"
        )
    return execute_sql(
        "SELECT id, vendor, price, has_open_price_alert "
        f"FROM {table} ORDER BY id"
    )


def to_index(rows: list[dict]) -> dict:
    """Build the compact dict stored in catalog_audit_json.skus.

    Keyed by id (as str for JSON portability), value = {vendor, price, opa}.
    """
    out: dict[str, dict] = {}
    for r in rows:
        rid = r.get("id")
        if rid is None:
            continue
        # Normalize price to float (Postgres numeric arrives as str via PostgREST)
        price = r.get("price")
        try:
            price_f = float(price) if price is not None else 0.0
        except (TypeError, ValueError):
            price_f = 0.0
        out[str(rid)] = {
            "v": r.get("vendor") or "",
            "p": round(price_f, 4),
            "a": bool(r.get("has_open_price_alert")),
        }
    return out


# ============================================================================
# Delta computation
# ============================================================================


def _visible_count(index: dict) -> int:
    return sum(1 for v in index.values() if v["p"] > 0 and not v["a"])


def _vendors(index: dict) -> set[str]:
    return {v["v"] for v in index.values() if v["v"]}


def compute_deltas(today_index: dict, yesterday_index: dict) -> dict:
    """Compare today vs yesterday and return the delta block."""
    today_ids = set(today_index.keys())
    yesterday_ids = set(yesterday_index.keys())

    new_skus = sorted(today_ids - yesterday_ids, key=lambda s: int(s) if s.isdigit() else s)
    gone_skus = sorted(yesterday_ids - today_ids, key=lambda s: int(s) if s.isdigit() else s)
    overlap_ids = today_ids & yesterday_ids

    # Visibility
    visible_today = _visible_count(today_index)
    visible_yesterday = _visible_count(yesterday_index)
    if visible_yesterday > 0:
        visibility_delta_pct = round((visible_today - visible_yesterday) / visible_yesterday * 100, 2)
    else:
        visibility_delta_pct = None

    # Vendors
    today_vendors = _vendors(today_index)
    yesterday_vendors = _vendors(yesterday_index)
    new_vendors = sorted(today_vendors - yesterday_vendors)
    gone_vendors = sorted(yesterday_vendors - today_vendors)

    # Price changes on overlap
    deltas = []  # signed % deltas
    big_movers = []  # (id, old, new, pct)
    for rid in overlap_ids:
        old = yesterday_index[rid]["p"]
        new = today_index[rid]["p"]
        if old <= 0 or new <= 0:
            continue
        if abs(new - old) < 1e-6:
            continue
        pct = (new - old) / old * 100
        deltas.append(pct)
        if abs(pct) > PRICE_CHANGE_BIG_PCT:
            big_movers.append({
                "id": int(rid) if rid.isdigit() else rid,
                "old": round(old, 4),
                "new": round(new, 4),
                "pct": round(pct, 2),
            })

    changed_count = len(deltas)
    overlap_count = len(overlap_ids)
    if deltas:
        abs_deltas = [abs(d) for d in deltas]
        mean_abs = round(statistics.fmean(abs_deltas), 3)
        max_abs = round(max(abs_deltas), 3)
    else:
        mean_abs = 0.0
        max_abs = 0.0

    big_share_pct = round(len(big_movers) / overlap_count * 100, 3) if overlap_count else 0.0
    # Trim big_movers list to keep JSON small (top 25 by abs pct)
    big_movers_top = sorted(big_movers, key=lambda x: abs(x["pct"]), reverse=True)[:25]

    return {
        "visibility": {
            "today_visible": visible_today,
            "yesterday_visible": visible_yesterday,
            "delta_pct": visibility_delta_pct,
        },
        "vendors": {
            "today_count": len(today_vendors),
            "yesterday_count": len(yesterday_vendors),
            "new": new_vendors,
            "gone": gone_vendors,
        },
        "prices": {
            "overlap_skus": overlap_count,
            "changed_count": changed_count,
            "changed_pct": round(changed_count / overlap_count * 100, 3) if overlap_count else 0.0,
            "mean_abs_delta_pct": mean_abs,
            "max_abs_delta_pct": max_abs,
            "big_move_count": len(big_movers),
            "big_move_share_pct": big_share_pct,
            "big_move_threshold_pct": PRICE_CHANGE_BIG_PCT,
            "big_movers_top25": big_movers_top,
        },
        "skus": {
            "today_count": len(today_ids),
            "yesterday_count": len(yesterday_ids),
            "new_count": len(new_skus),
            "gone_count": len(gone_skus),
            # Cap stored ID lists to keep JSON <10KB even on big churn days
            "new_ids_first200": [int(x) if x.isdigit() else x for x in new_skus[:200]],
            "gone_ids_first200": [int(x) if x.isdigit() else x for x in gone_skus[:200]],
        },
    }


def determine_alerts(deltas: dict) -> list[dict]:
    """Apply alert rules. Return list of breach dicts."""
    breaches = []

    vis = deltas["visibility"]
    if vis["delta_pct"] is not None and vis["delta_pct"] < -VISIBILITY_DROP_PCT_THRESHOLD:
        breaches.append({
            "kind": "visibility_drop",
            "detail": f"Catalog visibility dropped {vis['delta_pct']}% vs yesterday "
                      f"({vis['yesterday_visible']} -> {vis['today_visible']} visible)",
            "severity": "critical",
        })

    vendors = deltas["vendors"]
    if vendors["new"]:
        breaches.append({
            "kind": "new_vendor",
            "detail": f"New vendor(s) appeared today: {', '.join(vendors['new'])}",
            "severity": "info",
        })

    prices = deltas["prices"]
    if prices["big_move_share_pct"] > BIG_MOVE_SHARE_PCT_THRESHOLD:
        breaches.append({
            "kind": "price_volatility",
            "detail": (
                f"{prices['big_move_count']}/{prices['overlap_skus']} overlapping SKUs "
                f"({prices['big_move_share_pct']}%) moved >{PRICE_CHANGE_BIG_PCT}% in price -- "
                f"threshold {BIG_MOVE_SHARE_PCT_THRESHOLD}%"
            ),
            "severity": "critical",
        })

    return breaches


# ============================================================================
# Email (via Brevo)
# ============================================================================


def maybe_send_email(today: dt.date, deltas: dict, breaches: list[dict]) -> bool:
    if not breaches:
        return False
    api_key = os.environ.get("BREVO_API_KEY", "").strip()
    if not api_key:
        print("EMAIL SKIPPED: BREVO_API_KEY not set", file=sys.stderr)
        return False

    to = os.environ.get("REPORT_TO") or "faculavino@gmail.com"
    subj = f"[V8 SHADOW] [CATALOG AUDIT] {today.isoformat()} -- {len(breaches)} change alert(s)"

    breach_rows = "".join(
        f'<tr><td style="padding:6px 8px"><b>{b["kind"]}</b></td>'
        f'<td style="padding:6px 8px;color:{"#dc2626" if b["severity"]=="critical" else "#0369a1"}">{b["severity"]}</td>'
        f'<td style="padding:6px 8px">{b["detail"]}</td></tr>'
        for b in breaches
    )

    vis = deltas["visibility"]
    prc = deltas["prices"]
    skus = deltas["skus"]
    vendors = deltas["vendors"]

    big_movers_html = ""
    if prc.get("big_movers_top25"):
        rows = "".join(
            f'<tr><td style="padding:4px 8px">{m["id"]}</td>'
            f'<td style="padding:4px 8px;text-align:right">${m["old"]}</td>'
            f'<td style="padding:4px 8px;text-align:right">${m["new"]}</td>'
            f'<td style="padding:4px 8px;text-align:right;color:{"#dc2626" if m["pct"]>0 else "#16a34a"}"><b>{m["pct"]:+.1f}%</b></td></tr>'
            for m in prc["big_movers_top25"][:10]
        )
        big_movers_html = (
            '<h4 style="margin:16px 0 4px 0">Top price movers (max 10 shown)</h4>'
            '<table style="width:100%;border-collapse:collapse;font-size:12px">'
            '<thead><tr style="background:#fef2f2">'
            '<th style="padding:6px;text-align:left">ID</th>'
            '<th style="padding:6px;text-align:right">Yesterday</th>'
            '<th style="padding:6px;text-align:right">Today</th>'
            '<th style="padding:6px;text-align:right">Delta</th>'
            '</tr></thead><tbody>' + rows + '</tbody></table>'
        )

    html = f"""<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:680px;margin:0 auto;padding:24px">
<h2 style="color:#dc2626;margin:0">Catalog Audit -- {len(breaches)} change alert(s)</h2>
<p style="font-size:13px;color:#475569">{today.isoformat()} . day-over-day delta vs yesterday's snapshot.</p>

<h4 style="margin:14px 0 4px 0">Alerts</h4>
<table style="width:100%;border-collapse:collapse;font-size:13px;margin:6px 0">
<thead><tr style="background:#fef2f2">
<th style="padding:8px;text-align:left">Kind</th>
<th style="padding:8px;text-align:left">Severity</th>
<th style="padding:8px;text-align:left">Detail</th>
</tr></thead>
<tbody>{breach_rows}</tbody>
</table>

<h4 style="margin:16px 0 4px 0">Snapshot summary</h4>
<ul style="margin:0;padding-left:18px;font-size:13px;color:#334155">
  <li>Visible rows: <b>{vis['yesterday_visible']} -> {vis['today_visible']}</b> ({vis['delta_pct']}% delta)</li>
  <li>SKUs: today={skus['today_count']}, yesterday={skus['yesterday_count']}, new={skus['new_count']}, gone={skus['gone_count']}</li>
  <li>Vendors: today={vendors['today_count']}, yesterday={vendors['yesterday_count']}, new={vendors['new'] or '-'}, gone={vendors['gone'] or '-'}</li>
  <li>Price changes: {prc['changed_count']}/{prc['overlap_skus']} overlapping SKUs ({prc['changed_pct']}%) -- mean |delta| {prc['mean_abs_delta_pct']}%, max |delta| {prc['max_abs_delta_pct']}%</li>
  <li>Big movers (&gt;{PRICE_CHANGE_BIG_PCT}%): {prc['big_move_count']} ({prc['big_move_share_pct']}%)</li>
</ul>

{big_movers_html}

<hr style="margin:20px 0;border:none;border-top:1px solid #e2e8f0">
<p style="font-size:11px;color:#94a3b8">Generated by catalog_audit_daily.py (Job_PM Task #66). Cron daily 15:00 UTC.</p>
</body></html>"""

    payload = {
        "sender": {"name": "Floropolis BI", "email": "facu@floropolis.com"},
        "to": [{"email": to}],
        "subject": subj,
        "htmlContent": html,
        "textContent": f"Catalog audit alert. {len(breaches)} change(s) detected. View HTML for detail.",
    }
    req = urllib.request.Request(
        "https://api.brevo.com/v3/smtp/email",
        headers={"api-key": api_key, "content-type": "application/json", "accept": "application/json"},
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            resp.read()
        print(f"EMAIL SENT to {to}")
        return True
    except urllib.error.HTTPError as e:
        print(f"BREVO error {e.code}: {e.read().decode()[:200]}", file=sys.stderr)
        return False


# ============================================================================
# Main
# ============================================================================


def main() -> int:
    if not os.environ.get("SUPABASE_URL") or not os.environ.get("SUPABASE_SERVICE_KEY"):
        print("ERROR: SUPABASE_URL + SUPABASE_SERVICE_KEY required", file=sys.stderr)
        return 2

    today = dt.date.today()
    yesterday = today - dt.timedelta(days=1)

    # 1. Build today's compact per-SKU index
    today_rows = fetch_today_index()
    today_index = to_index(today_rows)
    print(f"Today ({today}): {len(today_index)} SKUs in mirror")

    # 2. Pull yesterday's index out of the snapshots table
    yesterday_audit = fetch_yesterday_audit(yesterday)

    if not yesterday_audit or not isinstance(yesterday_audit.get("skus_index"), dict):
        # First run -- no baseline available
        print(f"No baseline yet: yesterday ({yesterday}) row missing or has no skus_index. "
              f"Storing today's row for tomorrow's diff.")
        catalog_audit_json = {
            "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
            "date": today.isoformat(),
            "baseline_only": True,
            "today_sku_count": len(today_index),
            "today_vendor_count": len(_vendors(today_index)),
            "today_visible_count": _visible_count(today_index),
            "skus_index": today_index,
        }
        validator_json = load_local_validator_summary(today)
        upsert_today_snapshot(today, validator_json, catalog_audit_json)

        stdout = {
            "date": today.isoformat(),
            "baseline_only": True,
            "today_sku_count": len(today_index),
            "today_vendor_count": len(_vendors(today_index)),
            "today_visible_count": _visible_count(today_index),
            "alerts": [],
            "message": "no baseline yet -- snapshot stored for tomorrow's diff",
        }
        print(json.dumps(stdout, indent=2))
        return 0

    # 3. Compute deltas
    yesterday_index = yesterday_audit["skus_index"]
    deltas = compute_deltas(today_index, yesterday_index)
    breaches = determine_alerts(deltas)

    catalog_audit_json = {
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "date": today.isoformat(),
        "baseline_only": False,
        "yesterday_date": yesterday.isoformat(),
        "today_sku_count": len(today_index),
        "today_vendor_count": len(_vendors(today_index)),
        "today_visible_count": _visible_count(today_index),
        "deltas": deltas,
        "alerts": breaches,
        "thresholds": {
            "visibility_drop_pct": VISIBILITY_DROP_PCT_THRESHOLD,
            "price_change_big_pct": PRICE_CHANGE_BIG_PCT,
            "big_move_share_pct": BIG_MOVE_SHARE_PCT_THRESHOLD,
        },
        # NOTE: skus_index is what tomorrow needs to diff against today.
        # Stored last so older versions of this file remain readable if we trim.
        "skus_index": today_index,
    }
    validator_json = load_local_validator_summary(today)

    # 4. Persist today's row (upsert on PK)
    upsert_today_snapshot(today, validator_json, catalog_audit_json)

    # 5. stdout summary (without the skus_index payload -- humans don't want it)
    stdout = {
        "date": today.isoformat(),
        "yesterday_date": yesterday.isoformat(),
        "today_sku_count": len(today_index),
        "today_vendor_count": len(_vendors(today_index)),
        "today_visible_count": _visible_count(today_index),
        "deltas": {
            "visibility": deltas["visibility"],
            "vendors": deltas["vendors"],
            "prices": {k: v for k, v in deltas["prices"].items() if k != "big_movers_top25"},
            "skus": {k: v for k, v in deltas["skus"].items() if not k.endswith("_first200")},
        },
        "alerts": breaches,
    }
    print(json.dumps(stdout, indent=2, default=str))

    # 6. Email if breach
    sent = maybe_send_email(today, deltas, breaches)
    if sent:
        print(f"\n[ALERT] {len(breaches)} change(s) emailed to Facu.")
    elif breaches:
        print(f"\n[ALERT] {len(breaches)} change(s) detected but email not sent (no BREVO_API_KEY).")
    else:
        print("\nNo change thresholds breached. No email sent.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
