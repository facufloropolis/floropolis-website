#!/usr/bin/env python3
"""
Lead-time scheduled charges cron (D3 wave 3 — W3-S10).

Implements section 6 of /Users/facu/Claude_MA_v8/Job_PM/kb/projects/d3_stripe_webhook_design.md.

Runs hourly on GitHub Actions. For each order whose time has come, fires either:
  - $1 preauth (status='card_saved' AND scheduled_preauth_at <= now())
  - full charge (status='preauth_held' AND scheduled_charge_at <= now())

Pipeline per candidate:
  1. Re-check amount cap ($5000); abort + Telegram alert if exceeded.
  2. Compute idempotency_key: 'preauth:{order_id}:{YYYY-MM-DD}' or 'charge:{order_id}:{YYYY-MM-DD}'.
  3. INSERT payments row kind=... status='pending' (UNIQUE on idempotency_key blocks dupes).
     On unique violation: log "already processed" and skip (covers cron retries + Mode B/C collisions).
  4. Call Stripe PaymentIntent.create via HTTPS with same Idempotency-Key header,
     off_session=true, confirm=true, customer=stripe_customer_id, payment_method=stripe_payment_method_id.
  5. UPDATE payments row with stripe_payment_intent_id, stripe_charge_id, status.
  6. UPDATE orders.status (card_saved -> preauth_held, preauth_held -> paid + paid_at).
  7. On exception: payments status='failed', orders.status='failed', Telegram alert.

Stdlib only — no `stripe` python SDK. Uses urllib + Supabase REST + Stripe REST.

Targets supabase-backup (BACKUP_SUPABASE_URL / BACKUP_SUPABASE_SERVICE_KEY) per standing rule #10:
new pipelines validate against backup before touching prod.

Env vars:
  BACKUP_SUPABASE_URL          supabase-backup project URL (ibckhcjvyxzrhvdiazbx)
  BACKUP_SUPABASE_SERVICE_KEY  supabase-backup service role key
  STRIPE_SECRET_KEY            sk_test_... (Basic auth user, blank password)
  TELEGRAM_BOT_TOKEN           optional, alerts on hard failures
  TELEGRAM_CHAT_ID             optional, paired with bot token

Flags:
  --dry-run  Print candidates + computed idempotency keys, but do NOT call Stripe or write to DB.
"""

from __future__ import annotations

import argparse
import base64
import datetime as dt
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from decimal import Decimal


AMOUNT_CAP_USD = Decimal("5000")
CANDIDATE_LIMIT = 50
HTTP_TIMEOUT = 30


# ---------------- generic HTTP ----------------

def _request(
    url: str,
    headers: dict,
    data: bytes | None = None,
    method: str = "GET",
    timeout: int = HTTP_TIMEOUT,
) -> tuple[int, bytes]:
    """Returns (status_code, body_bytes). Does NOT raise on 4xx/5xx — caller decides."""
    req = urllib.request.Request(url, headers=headers, data=data, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.getcode(), resp.read()
    except urllib.error.HTTPError as e:
        body = e.read() if hasattr(e, "read") else b""
        return e.code, body


# ---------------- Supabase REST ----------------

def _bak_headers(extra: dict | None = None) -> dict:
    key = os.environ["BACKUP_SUPABASE_SERVICE_KEY"]
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    if extra:
        headers.update(extra)
    return headers


def _bak_url(path: str) -> str:
    return os.environ["BACKUP_SUPABASE_URL"].rstrip("/") + path


def fetch_candidates() -> list[dict]:
    """Pull orders eligible for a scheduled preauth or full charge."""
    payload = json.dumps({
        "query": (
            "SELECT o.id, o.payment_mode, o.grand_total, o.stripe_customer_id, "
            "o.stripe_payment_method_id, o.scheduled_preauth_at, o.scheduled_charge_at, "
            "o.status, o.order_number, o.currency "
            "FROM orders o "
            "WHERE (o.status = 'card_saved'   AND o.scheduled_preauth_at <= now()) "
            "   OR (o.status = 'preauth_held' AND o.scheduled_charge_at  <= now()) "
            f"ORDER BY o.id LIMIT {CANDIDATE_LIMIT}"
        )
    }).encode("utf-8")
    status, raw = _request(_bak_url("/rest/v1/rpc/execute_sql"), _bak_headers(), payload, "POST")
    if status >= 400:
        raise RuntimeError(f"fetch_candidates {status}: {raw[:300].decode('utf-8', 'replace')}")
    data = json.loads(raw) if raw else []
    if isinstance(data, list):
        return data
    if isinstance(data, dict) and isinstance(data.get("data"), list):
        return data["data"]
    raise RuntimeError(f"Unexpected candidates payload: {type(data)}")


def insert_payment_pending(
    order_id: int,
    kind: str,
    amount: Decimal,
    currency: str,
    idempotency_key: str,
    stripe_payment_method_id: str | None,
) -> tuple[bool, int | None, str]:
    """
    INSERT payments row status='pending'. Returns (inserted, payment_id, message).

    inserted=False if UNIQUE on idempotency_key blocked the insert (already processed).
    """
    body = [{
        "order_id": order_id,
        "kind": kind,
        "status": "pending",
        "amount": str(amount),
        "currency": currency,
        "idempotency_key": idempotency_key,
        "stripe_payment_method_id": stripe_payment_method_id,
    }]
    payload = json.dumps(body).encode("utf-8")
    headers = _bak_headers({"Prefer": "return=representation"})
    status, raw = _request(_bak_url("/rest/v1/payments"), headers, payload, "POST")
    if status in (200, 201):
        rows = json.loads(raw)
        return True, int(rows[0]["id"]), "inserted"
    if status == 409:
        # UNIQUE violation on idempotency_key — already processed by prior run / Mode B/C inline.
        return False, None, "duplicate_idempotency_key"
    raise RuntimeError(f"insert_payment_pending {status}: {raw[:300].decode('utf-8', 'replace')}")


def update_payment(payment_id: int, fields: dict) -> None:
    payload = json.dumps(fields).encode("utf-8")
    status, raw = _request(
        _bak_url(f"/rest/v1/payments?id=eq.{payment_id}"),
        _bak_headers({"Prefer": "return=minimal"}),
        payload,
        "PATCH",
    )
    if status >= 400:
        raise RuntimeError(f"update_payment {status}: {raw[:300].decode('utf-8', 'replace')}")


def update_order_status(order_id: int, new_status: str, paid: bool = False) -> None:
    fields: dict = {"status": new_status, "updated_at": _now_iso()}
    if paid:
        fields["paid_at"] = _now_iso()
    payload = json.dumps(fields).encode("utf-8")
    status, raw = _request(
        _bak_url(f"/rest/v1/orders?id=eq.{order_id}"),
        _bak_headers({"Prefer": "return=minimal"}),
        payload,
        "PATCH",
    )
    if status >= 400:
        raise RuntimeError(f"update_order_status {status}: {raw[:300].decode('utf-8', 'replace')}")


# ---------------- Stripe REST ----------------

def _stripe_headers(idempotency_key: str) -> dict:
    sk = os.environ["STRIPE_SECRET_KEY"]
    basic = base64.b64encode(f"{sk}:".encode()).decode()
    return {
        "Authorization": f"Basic {basic}",
        "Content-Type": "application/x-www-form-urlencoded",
        "Idempotency-Key": idempotency_key,
        "Stripe-Version": "2025-09-30.acacia",
    }


def stripe_create_payment_intent(
    amount_cents: int,
    currency: str,
    customer_id: str,
    payment_method_id: str,
    idempotency_key: str,
    metadata: dict,
) -> dict:
    """
    POST https://api.stripe.com/v1/payment_intents with off_session + confirm.

    Returns the PaymentIntent JSON on success, raises on HTTP >= 400.
    """
    form_fields = [
        ("amount", str(amount_cents)),
        ("currency", currency.lower()),
        ("customer", customer_id),
        ("payment_method", payment_method_id),
        ("off_session", "true"),
        ("confirm", "true"),
        # Restrict to card to avoid Stripe auto-attaching wallets that need redirects.
        ("payment_method_types[]", "card"),
    ]
    for k, v in metadata.items():
        form_fields.append((f"metadata[{k}]", str(v)))
    body = urllib.parse.urlencode(form_fields).encode("utf-8")
    status, raw = _request(
        "https://api.stripe.com/v1/payment_intents",
        _stripe_headers(idempotency_key),
        body,
        "POST",
        timeout=60,
    )
    if status >= 400:
        raise RuntimeError(f"stripe_create_payment_intent {status}: {raw[:500].decode('utf-8', 'replace')}")
    return json.loads(raw)


# ---------------- Telegram ----------------

def telegram_alert(message: str) -> None:
    token = os.environ.get("TELEGRAM_BOT_TOKEN")
    chat_id = os.environ.get("TELEGRAM_CHAT_ID")
    if not token or not chat_id:
        print(f"[telegram skipped] {message}", file=sys.stderr)
        return
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = urllib.parse.urlencode({
        "chat_id": chat_id,
        "text": message[:4000],
        "parse_mode": "Markdown",
    }).encode("utf-8")
    headers = {"Content-Type": "application/x-www-form-urlencoded"}
    try:
        status, raw = _request(url, headers, payload, "POST", timeout=10)
        if status >= 400:
            print(f"[telegram FAIL {status}] {raw[:200].decode('utf-8', 'replace')}", file=sys.stderr)
    except Exception as e:  # noqa: BLE001
        print(f"[telegram exception] {e}", file=sys.stderr)


# ---------------- core ----------------

def _now_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")


def _today_yyyy_mm_dd() -> str:
    return dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d")


def classify(order: dict) -> tuple[str, Decimal, str] | None:
    """
    Returns (kind, amount_usd, idempotency_key) or None if the row is not actually due.

    kind in {'preauth', 'full_charge'}.
    """
    today = _today_yyyy_mm_dd()
    status = order["status"]
    if status == "card_saved":
        return ("preauth", Decimal("1.00"), f"preauth:{order['id']}:{today}")
    if status == "preauth_held":
        return ("full_charge", Decimal(str(order["grand_total"])), f"charge:{order['id']}:{today}")
    return None


def process_candidate(order: dict, dry_run: bool) -> dict:
    """Run the pipeline for a single candidate. Returns a structured result dict."""
    cls = classify(order)
    if cls is None:
        return {"order_id": order["id"], "result": "skip_unexpected_status", "status": order["status"]}
    kind, amount_usd, idem_key = cls
    grand_total = Decimal(str(order["grand_total"]))
    currency = order.get("currency") or "USD"

    # Layer 2: amount cap re-check (applies to the order's grand_total, not the $1 preauth).
    if grand_total > AMOUNT_CAP_USD:
        msg = (
            f"[scheduled_charges] ABORT order_id={order['id']} order_number={order.get('order_number')}: "
            f"grand_total ${grand_total} > cap ${AMOUNT_CAP_USD}. Manual review required."
        )
        print(msg, file=sys.stderr)
        if not dry_run:
            telegram_alert(msg)
        return {"order_id": order["id"], "result": "amount_cap_exceeded", "grand_total": str(grand_total)}

    # Pre-check that we have the saved card before going further.
    customer_id = order.get("stripe_customer_id")
    pm_id = order.get("stripe_payment_method_id")
    if not customer_id or not pm_id:
        msg = (
            f"[scheduled_charges] order_id={order['id']} missing stripe_customer_id or "
            f"stripe_payment_method_id; cannot charge."
        )
        print(msg, file=sys.stderr)
        if not dry_run:
            telegram_alert(msg)
        return {"order_id": order["id"], "result": "missing_stripe_ids"}

    if dry_run:
        return {
            "order_id": order["id"],
            "order_number": order.get("order_number"),
            "result": "WOULD_FIRE",
            "kind": kind,
            "amount_usd": str(amount_usd),
            "idempotency_key": idem_key,
            "from_status": order["status"],
        }

    # Step 3: INSERT payments row pending. UNIQUE blocks dupes.
    try:
        inserted, payment_id, ins_msg = insert_payment_pending(
            order_id=order["id"],
            kind=kind,
            amount=amount_usd,
            currency=currency,
            idempotency_key=idem_key,
            stripe_payment_method_id=pm_id,
        )
    except Exception as e:  # noqa: BLE001
        err = str(e)[:300]
        telegram_alert(f"[scheduled_charges] payments INSERT failed order_id={order['id']}: {err}")
        return {"order_id": order["id"], "result": "insert_failed", "error": err}

    if not inserted:
        # Already processed (cron retry, Mode B/C inline collision by design).
        return {"order_id": order["id"], "result": "already_processed", "idempotency_key": idem_key}

    # Step 4: Stripe call. Same idempotency key.
    amount_cents = int((amount_usd * 100).to_integral_value())
    try:
        pi = stripe_create_payment_intent(
            amount_cents=amount_cents,
            currency=currency,
            customer_id=customer_id,
            payment_method_id=pm_id,
            idempotency_key=idem_key,
            metadata={
                "order_id": order["id"],
                "order_number": order.get("order_number", ""),
                "kind": kind,
                "source": "scheduled_charges_cron",
            },
        )
    except Exception as e:  # noqa: BLE001
        err = str(e)[:500]
        try:
            update_payment(payment_id, {
                "status": "failed",
                "error_message": err,
                "updated_at": _now_iso(),
                "processed_at": _now_iso(),
            })
            update_order_status(order["id"], "failed")
        except Exception as inner:  # noqa: BLE001
            err = f"{err} | rollback also failed: {inner}"
        telegram_alert(
            f"[scheduled_charges] Stripe call failed order_id={order['id']} "
            f"kind={kind} amount=${amount_usd}: {err}"
        )
        return {"order_id": order["id"], "result": "stripe_failed", "error": err}

    pi_id = pi.get("id")
    pi_status = pi.get("status", "")
    charges = (pi.get("charges") or {}).get("data") or []
    charge_id = charges[0]["id"] if charges else (pi.get("latest_charge") or None)

    # Map Stripe PI status -> our payments.status enum.
    if pi_status == "succeeded":
        new_payment_status = "succeeded"
    elif pi_status == "requires_action":
        new_payment_status = "requires_action"
    elif pi_status in ("processing", "requires_capture", "requires_confirmation"):
        new_payment_status = "pending"
    elif pi_status == "canceled":
        new_payment_status = "cancelled"
    else:
        new_payment_status = "failed"

    next_action_jsonb = pi.get("next_action")
    try:
        update_payment(payment_id, {
            "stripe_payment_intent_id": pi_id,
            "stripe_charge_id": charge_id,
            "status": new_payment_status,
            "next_action": next_action_jsonb,
            "stripe_event_raw": pi,
            "updated_at": _now_iso(),
            "processed_at": _now_iso(),
        })
    except Exception as e:  # noqa: BLE001
        err = str(e)[:300]
        telegram_alert(
            f"[scheduled_charges] payments UPDATE failed order_id={order['id']} "
            f"pi={pi_id}: {err}"
        )
        return {"order_id": order["id"], "result": "update_payment_failed", "pi_id": pi_id, "error": err}

    # Step 6: orders.status transition.
    try:
        if new_payment_status == "succeeded":
            if kind == "preauth":
                update_order_status(order["id"], "preauth_held")
            else:  # full_charge
                update_order_status(order["id"], "paid", paid=True)
        elif new_payment_status == "requires_action":
            # Cron cannot do 3DS; webhook will resolve. Leave orders.status as-is.
            telegram_alert(
                f"[scheduled_charges] 3DS required order_id={order['id']} pi={pi_id} — "
                f"will need customer action. Status unchanged."
            )
        elif new_payment_status in ("failed", "cancelled"):
            update_order_status(order["id"], "failed")
            telegram_alert(
                f"[scheduled_charges] Stripe returned {pi_status} order_id={order['id']} "
                f"pi={pi_id} kind={kind}"
            )
    except Exception as e:  # noqa: BLE001
        err = str(e)[:300]
        telegram_alert(
            f"[scheduled_charges] orders.status UPDATE failed order_id={order['id']} "
            f"pi={pi_id}: {err}"
        )
        return {"order_id": order["id"], "result": "update_order_failed", "pi_id": pi_id, "error": err}

    return {
        "order_id": order["id"],
        "order_number": order.get("order_number"),
        "result": "fired",
        "kind": kind,
        "amount_usd": str(amount_usd),
        "idempotency_key": idem_key,
        "stripe_payment_intent_id": pi_id,
        "stripe_charge_id": charge_id,
        "payment_status": new_payment_status,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Lead-time scheduled charges cron (D3).")
    parser.add_argument("--dry-run", action="store_true",
                        help="List candidates + idempotency keys but do not call Stripe or write DB.")
    args = parser.parse_args()

    required = ["BACKUP_SUPABASE_URL", "BACKUP_SUPABASE_SERVICE_KEY"]
    if not args.dry_run:
        required.append("STRIPE_SECRET_KEY")
    missing = [k for k in required if not os.environ.get(k)]
    if missing:
        print(f"ERROR: missing env vars: {missing}", file=sys.stderr)
        return 2

    try:
        candidates = fetch_candidates()
    except Exception as e:  # noqa: BLE001
        err = str(e)[:500]
        print(f"ERROR fetch_candidates: {err}", file=sys.stderr)
        if not args.dry_run:
            telegram_alert(f"[scheduled_charges] fetch_candidates failed: {err}")
        return 1

    if not candidates:
        print(f"[{_now_iso()}] no candidates (dry_run={args.dry_run})")
        return 0

    print(f"[{_now_iso()}] {len(candidates)} candidate(s) (dry_run={args.dry_run})")

    results: list[dict] = []
    for order in candidates:
        try:
            res = process_candidate(order, dry_run=args.dry_run)
        except Exception as e:  # noqa: BLE001
            err = str(e)[:500]
            res = {"order_id": order.get("id"), "result": "uncaught_exception", "error": err}
            if not args.dry_run:
                telegram_alert(f"[scheduled_charges] uncaught order_id={order.get('id')}: {err}")
        print(json.dumps(res, default=str))
        results.append(res)

    # Exit non-zero if any candidate hit a hard failure (not duplicates / would_fire / skips).
    hard_failures = [r for r in results if r.get("result") in {
        "amount_cap_exceeded", "missing_stripe_ids", "insert_failed",
        "stripe_failed", "update_payment_failed", "update_order_failed", "uncaught_exception",
    }]
    if hard_failures:
        print(f"FAIL: {len(hard_failures)}/{len(results)} candidates failed", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
