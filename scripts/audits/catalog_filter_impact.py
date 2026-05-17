#!/usr/bin/env python3
"""
Catalog filter impact audit.

Runs the proposed publishability filter against current floropolis_inventory
and reports: total rows, what would publish, what would hide + reasons,
badge distribution, top 10 examples per hide-reason for spot-checking.

Used pre-merge so Facu can preview the impact of switching the website
from "show everything" to "show only Rose's publishable + tier-badge'd set."

Env vars:
  SUPABASE_URL          required
  SUPABASE_SERVICE_KEY  required
"""

from __future__ import annotations

import datetime as dt
import json
import os
import sys
import urllib.request


def _post(query: str) -> list[dict]:
    url = os.environ["SUPABASE_URL"].rstrip("/") + "/rest/v1/rpc/execute_sql"
    key = os.environ["SUPABASE_SERVICE_KEY"]
    req = urllib.request.Request(
        url,
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        data=json.dumps({"query": query}).encode("utf-8"),
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        raw = resp.read().decode("utf-8")
    payload = json.loads(raw) if raw else []
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        if isinstance(payload.get("data"), list):
            return payload["data"]
    return []


def decide(row: dict, today: dt.date, mode: str = "lenient") -> tuple[bool, str, str | None]:
    """Mirror of lib/catalog-filters.ts decidePublishability(). Returns (publish, reason, badge_kind)."""
    price = row.get("price")
    if price is None or price <= 0:
        return False, "price_missing_or_zero", None

    if mode == "strict":
        if row.get("has_open_price_alert") is True:
            return False, "open_price_alert", None
        if row.get("live") is False:
            return False, "live_false_k2k_specific", None
        if row.get("margin_status") == "UNKNOWN":
            return False, "margin_unknown", None
    elif mode == "balanced":
        if row.get("has_open_price_alert") is True:
            return False, "open_price_alert", None
        if row.get("margin_status") == "UNKNOWN":
            return False, "margin_unknown", None
    # lenient: only price gate; rely on tier-window logic below

    arrival = row.get("arrival_date")
    arrival_date = dt.date.fromisoformat(str(arrival)[:10]) if arrival else None
    stock = row.get("stock") or 0

    if arrival_date and arrival_date < today and stock <= 0:
        return False, "stale_past_arrival_and_oos", None

    tier = (row.get("tier") or "").strip().upper()
    days_until = (arrival_date - today).days if arrival_date else None

    if tier == "T2":
        if stock > 0:
            return True, "ok", "in_stock_now"
        if days_until is None:
            return False, "t2_missing_arrival_date_and_no_stock", None
        if 0 <= days_until <= 7:
            return True, "ok", "confirmed_7d"
        if 7 < days_until <= 14:
            return True, "ok", "sourceable_14d"
        return False, "t2_outside_window_no_stock", None

    if tier == "T3":
        if stock > 0:
            return True, "ok", "in_stock_now"
        if days_until is None:
            return False, "t3_missing_arrival_date_and_no_stock", None
        if 0 <= days_until <= 14:
            return True, "ok", "sourceable_14d"
        return False, "t3_beyond_14d_window", None

    # T1 / T4 / unknown
    if stock > 0:
        return True, "ok", "in_stock_now"
    return True, "ok", None


def main() -> int:
    if not os.environ.get("SUPABASE_URL") or not os.environ.get("SUPABASE_SERVICE_KEY"):
        print("ERROR: SUPABASE_URL + SUPABASE_SERVICE_KEY required", file=sys.stderr)
        return 2

    today = dt.date.today()
    print(f"=== Catalog filter impact audit -- {today.isoformat()} ===\n")

    rows = _post(
        "SELECT id, slug, name, variety, color, vendor, category, tier, price, stock, "
        "arrival_date, live, active, has_open_price_alert, margin_status "
        "FROM floropolis_inventory ORDER BY id"
    )
    print(f"Total rows in floropolis_inventory: {len(rows)}")
    print(f"Currently shown on site (no filter applied): {len(rows)}\n")

    # Run all 3 modes for comparison
    print("=== SUMMARY ACROSS ALL 3 FILTER MODES ===\n")
    print(f"{'Mode':10} {'Published':>10} {'Hidden':>10} {'Hide %':>8}")
    print("-" * 42)
    summaries = {}
    for mode in ("strict", "balanced", "lenient"):
        published = 0
        hidden_reasons: dict[str, list[dict]] = {}
        badges_mode: dict[str, int] = {}
        for row in rows:
            publish, reason, badge = decide(row, today, mode)
            if publish:
                published += 1
                badges_mode[badge or "no_badge"] = badges_mode.get(badge or "no_badge", 0) + 1
            else:
                hidden_reasons.setdefault(reason, []).append(row)
        hidden = len(rows) - published
        print(f"{mode:10} {published:>10} {hidden:>10} {hidden/len(rows)*100:>7.1f}%")
        summaries[mode] = (published, hidden, hidden_reasons, badges_mode)

    print()
    # Detailed view of the recommended (lenient) mode
    print("=== LENIENT MODE DETAIL (recommended default) ===")
    published_count, hidden_count, hidden_by_reason, badges = summaries["lenient"]
    print(f"  PUBLISHED: {published_count} ({published_count/len(rows)*100:.1f}%)")
    print(f"  HIDDEN:    {hidden_count} ({hidden_count/len(rows)*100:.1f}%)\n")

    print(f"Hidden breakdown (by reason):")
    for reason, items in sorted(hidden_by_reason.items(), key=lambda x: -len(x[1])):
        print(f"  {reason:42} {len(items):4} rows")
    print()

    print(f"Badge distribution (published rows):")
    for kind, count in sorted(badges.items(), key=lambda x: -x[1]):
        print(f"  {kind:25} {count:4} rows")
    print()

    print("Top 5 examples per hide-reason (for spot-check):")
    for reason in sorted(hidden_by_reason.keys(), key=lambda r: -len(hidden_by_reason[r])):
        print(f"\n  --- {reason} ---")
        for ex in hidden_by_reason[reason][:5]:
            v = ex.get("variety") or ""
            c = ex.get("color") or ""
            t = ex.get("tier") or "?"
            p = ex.get("price")
            s = ex.get("stock") or 0
            vendor = ex.get("vendor") or "?"
            ad = ex.get("arrival_date") or "no-date"
            live = ex.get("live")
            alert = ex.get("has_open_price_alert")
            margin = ex.get("margin_status") or "?"
            print(f"    [{t}] {v} {c}  vendor={vendor}  price={p}  stock={s}  arrival={ad}  live={live} alert={alert} margin={margin}")

    print("\n=== DONE ===")
    print(f"To approve: merge proposal/catalog-publishability-filter to main.")
    print(f"To revert any time: git revert <merge-commit>.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
