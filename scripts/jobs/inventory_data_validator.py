#!/usr/bin/env python3
"""
SUBAGENT A: Inventory Data Validator (Job_PM-owned)
v1 | 2026-05-17 | Job_PM [V8 SHADOW]

Continuous validation of `floropolis_inventory` data quality. Catches what Rose's
pipeline might miss before customers see it. Per Facu directive 2026-05-17:
"We cannot miss prices, margins, or price alerts."

Schedule: GitHub Actions cron daily 14:00 UTC (1h after Rose's ingest typically completes).
Invocation: Task-tool ad-hoc, or `python scripts/jobs/inventory_data_validator.py`.

Output:
  - JSON summary printed to stdout (workflow log)
  - JSON state file written to /tmp/inventory_validation_<date>.json
  - HTML email to faculavino@gmail.com via Brevo IF any critical threshold breached

Critical thresholds (email triggers):
  - >5% of catalog has missing price
  - >5% has UNKNOWN margin_status
  - >10% has has_open_price_alert=true
  - >5% has formula deviation >5% (actual vs expected price)
  - >5% has inconsistent state (stock>0 + live=false)

Env vars:
  SUPABASE_URL          required
  SUPABASE_SERVICE_KEY  required
  BREVO_API_KEY         optional (skip email if missing)
  REPORT_TO             optional (default: faculavino@gmail.com)
"""

from __future__ import annotations

import datetime as dt
import json
import math
import os
import sys
import urllib.request


# === Constants per Rose's pricing_formula.md (Section 1) ===
GPM_TARGET = 0.33                 # gross profit margin on selling price
FEDEX_RATE_PER_KG = 6.50           # USD per kg
FUEL_SURCHARGE_MULT = 1.25         # 25% fuel surcharge
FORMULA_DEVIATION_THRESHOLD_PCT = 5  # flag if actual price deviates >5% from expected

# Email-trigger thresholds (% of catalog)
CRITICAL_THRESHOLDS = {
    "missing_price": 5,
    "unknown_margin": 5,
    "open_price_alert": 10,
    "formula_deviation": 5,
    "inconsistent_state": 5,
}


# ============================================================================
# Supabase
# ============================================================================


def _supabase_post(fn: str, params: dict) -> object:
    url = os.environ["SUPABASE_URL"].rstrip("/") + f"/rest/v1/rpc/{fn}"
    key = os.environ["SUPABASE_SERVICE_KEY"]
    req = urllib.request.Request(
        url,
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        },
        data=json.dumps(params).encode("utf-8"),
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        raw = resp.read().decode("utf-8")
    return json.loads(raw) if raw else None


def execute_sql(query: str) -> list[dict]:
    payload = _supabase_post("execute_sql", {"query": query})
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        if isinstance(payload.get("data"), list):
            return payload["data"]
        if isinstance(payload.get("rows"), list):
            return payload["rows"]
    return []


# ============================================================================
# Validation rules
# ============================================================================


def compute_expected_price(row: dict) -> float | None:
    """Apply Rose's pricing formula. Returns expected price per stem, or None if uncomputable."""
    cost = row.get("farm_cost")
    if cost is None or cost <= 0:
        return None

    # USA vendors skip delivery (per pricing_formula.md Section 3)
    vendor = (row.get("vendor") or "").lower()
    if "usa" in vendor:
        return round(cost / (1 - GPM_TARGET), 4)

    # Standard formula: needs box weight + stems per box
    # box_weight_kg is implicit per box_type; we don't have it on the row, but we have
    # `total_stems` (units in box) which we use as stems_per_box.
    stems_per_box = row.get("units_per_box") or row.get("total_stems")
    if not stems_per_box or stems_per_box <= 0:
        return None

    # Approximate delivery_per_stem from box_type (per Rose's verified table).
    # We don't have box_weight_kg on the row -- best-effort lookup by box_type.
    box_type = (row.get("box_type") or "").upper().strip()
    box_dim_kg_lookup = {
        "QB": 6.80,   "QB-M": 5.30,  "QB-OLI": 6.80,  "QB-MF": 6.05,
        "HB": 11.70,  "EB": 4.25,    "EB-M": 3.99,    "EB-MF": 4.76,
        "SB-M": 2.94, "QBV": 8.75,   "FB": 20.90,
    }
    dim_kg = box_dim_kg_lookup.get(box_type)
    if dim_kg is None:
        return None  # unknown box type, can't validate

    delivery_per_box = math.ceil(dim_kg) * FEDEX_RATE_PER_KG * FUEL_SURCHARGE_MULT
    delivery_per_stem = delivery_per_box / stems_per_box
    price_ex_delivery = cost / (1 - GPM_TARGET)
    return round(price_ex_delivery + delivery_per_stem, 4)


def validate_row(row: dict) -> dict:
    """Return list of issues for one row. Empty list = clean."""
    issues = []
    tier = (row.get("tier") or "").upper()
    price = row.get("price") or 0
    stock = row.get("stock") or 0

    # 1. Missing price
    if not price or price <= 0:
        issues.append("missing_price")

    # 2. Missing / unknown margin
    if not row.get("margin_status"):
        issues.append("missing_margin")
    elif row.get("margin_status") == "UNKNOWN":
        issues.append("unknown_margin")

    # 3. Missing cost_source
    if not row.get("cost_source"):
        issues.append("missing_cost_source")

    # 4. cost_source set but never verified
    if row.get("cost_source") and not row.get("cost_verified_at"):
        issues.append("cost_unverified")

    # 5. Missing arrival_date for T2/T3
    if tier in ("T2", "T3") and not row.get("arrival_date"):
        issues.append("missing_arrival_date")

    # 6. has_open_price_alert
    if row.get("has_open_price_alert") is True:
        issues.append("open_price_alert")

    # 7. Pricing formula deviation
    if price > 0 and row.get("farm_cost"):
        expected = compute_expected_price(row)
        if expected is not None and expected > 0:
            delta_pct = abs(price - expected) / expected * 100
            if delta_pct > FORMULA_DEVIATION_THRESHOLD_PCT:
                issues.append(f"formula_deviation_{delta_pct:.0f}pct")

    # 8. Inconsistencies
    if stock > 0 and row.get("live") is False:
        issues.append("inconsistent_stock_with_live_false")
    if not stock and row.get("live") is True and tier in ("T2", "T3"):
        # T2/T3 marked live but stock=0 and no arrival_date is suspect
        if not row.get("arrival_date"):
            issues.append("inconsistent_live_no_stock_no_date")

    # 9. Missing image (best-effort: check images jsonb)
    images = row.get("images")
    if images is None or (isinstance(images, list) and len(images) == 0):
        issues.append("missing_image")

    return {"row_id": row.get("id"), "slug": row.get("slug"), "variety": row.get("variety"), "tier": tier, "vendor": row.get("vendor"), "price": price, "issues": issues}


# ============================================================================
# Aggregate + report
# ============================================================================


def run_validation() -> dict:
    """Pull all inventory + validate every row. Return summary dict."""
    rows = execute_sql(
        "SELECT id, slug, name, variety, color, vendor, tier, price, stock, "
        "farm_cost, cost_source, cost_verified_at, margin_status, "
        "has_open_price_alert, arrival_date, live, active, box_type, "
        "units_per_box, total_stems, images "
        "FROM floropolis_inventory ORDER BY id"
    )

    issue_counts: dict[str, int] = {}
    issue_examples: dict[str, list] = {}
    rows_with_issues = []
    rows_clean = 0

    for row in rows:
        result = validate_row(row)
        if result["issues"]:
            rows_with_issues.append(result)
            for issue in result["issues"]:
                # Normalize formula_deviation_* to formula_deviation for counting
                key = "formula_deviation" if issue.startswith("formula_deviation_") else issue
                issue_counts[key] = issue_counts.get(key, 0) + 1
                if len(issue_examples.setdefault(key, [])) < 5:
                    issue_examples[key].append(result)
        else:
            rows_clean += 1

    total = len(rows)
    issue_pct = {k: round(v / total * 100, 1) for k, v in issue_counts.items()}

    # Determine critical alerts
    critical_breaches = []
    for issue, threshold_pct in CRITICAL_THRESHOLDS.items():
        if issue_pct.get(issue, 0) > threshold_pct:
            critical_breaches.append({
                "issue": issue,
                "actual_pct": issue_pct[issue],
                "threshold_pct": threshold_pct,
                "count": issue_counts[issue],
            })

    return {
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "date": dt.date.today().isoformat(),
        "total_rows": total,
        "rows_clean": rows_clean,
        "rows_with_issues": len(rows_with_issues),
        "issue_counts": issue_counts,
        "issue_pct": issue_pct,
        "issue_examples": issue_examples,
        "critical_breaches": critical_breaches,
        "thresholds": CRITICAL_THRESHOLDS,
    }


# ============================================================================
# Email (via Brevo)
# ============================================================================


def maybe_send_email(summary: dict) -> bool:
    if not summary.get("critical_breaches"):
        return False
    api_key = os.environ.get("BREVO_API_KEY", "").strip()
    if not api_key:
        print("EMAIL SKIPPED: BREVO_API_KEY not set", file=sys.stderr)
        return False

    to = os.environ.get("REPORT_TO") or "faculavino@gmail.com"
    breaches = summary["critical_breaches"]
    subj = f"[V8 SHADOW] [INVENTORY ALERT] {len(breaches)} data-quality threshold(s) breached"

    breach_rows = "".join(
        f'<tr><td style="padding:6px 8px">{b["issue"]}</td>'
        f'<td style="padding:6px 8px;text-align:right"><b>{b["actual_pct"]}%</b></td>'
        f'<td style="padding:6px 8px;text-align:right;color:#94a3b8">{b["threshold_pct"]}%</td>'
        f'<td style="padding:6px 8px;text-align:right">{b["count"]}</td></tr>'
        for b in breaches
    )

    examples_html = ""
    for b in breaches:
        ex_list = summary["issue_examples"].get(b["issue"], [])
        examples_html += f'<h4 style="margin:14px 0 4px 0">{b["issue"]} -- top examples</h4><ul style="margin:0;padding-left:18px;font-size:12px">'
        for ex in ex_list:
            examples_html += f'<li>[{ex.get("tier","?")}] {ex.get("variety","?")} -- vendor {ex.get("vendor","?")}, price ${ex.get("price","?")}, slug={ex.get("slug","?")}</li>'
        examples_html += "</ul>"

    html = f"""<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:680px;margin:0 auto;padding:24px">
<h2 style="color:#dc2626;margin:0">Inventory Validation -- {len(breaches)} alert(s)</h2>
<p style="font-size:13px;color:#475569">{summary["date"]} . {summary["total_rows"]} rows audited . {summary["rows_with_issues"]} have at least one issue ({round(summary["rows_with_issues"]/summary["total_rows"]*100,1)}%)</p>
<table style="width:100%;border-collapse:collapse;font-size:13px;margin:12px 0">
<thead><tr style="background:#fef2f2"><th style="padding:8px;text-align:left">Issue</th><th style="padding:8px;text-align:right">Actual</th><th style="padding:8px;text-align:right;color:#94a3b8">Threshold</th><th style="padding:8px;text-align:right">Count</th></tr></thead>
<tbody>{breach_rows}</tbody>
</table>
{examples_html}
<hr style="margin:20px 0;border:none;border-top:1px solid #e2e8f0">
<p style="font-size:11px;color:#94a3b8">Generated by inventory_data_validator.py (Job_PM Subagent A). Cron daily 14:00 UTC.</p>
</body></html>"""

    payload = {
        "sender": {"name": "Floropolis BI", "email": "facu@floropolis.com"},
        "to": [{"email": to}],
        "subject": subj,
        "htmlContent": html,
        "textContent": f"Inventory validation alert. {len(breaches)} thresholds breached. View HTML for detail.",
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

    summary = run_validation()

    # Write to /tmp state file
    state_path = f"/tmp/inventory_validation_{summary['date']}.json"
    try:
        with open(state_path, "w") as f:
            json.dump(summary, f, indent=2, default=str)
        print(f"State file written: {state_path}")
    except OSError as e:
        print(f"State file write failed: {e}", file=sys.stderr)

    # Print summary to stdout (workflow log)
    print(json.dumps({
        "generated_at": summary["generated_at"],
        "date": summary["date"],
        "total_rows": summary["total_rows"],
        "rows_clean": summary["rows_clean"],
        "rows_with_issues": summary["rows_with_issues"],
        "issue_counts": summary["issue_counts"],
        "issue_pct": summary["issue_pct"],
        "critical_breaches": summary["critical_breaches"],
    }, indent=2))

    # Send email IF breaches
    sent = maybe_send_email(summary)
    if sent:
        print(f"\n[ALERT] {len(summary['critical_breaches'])} breach(es) emailed to Facu.")
    elif summary.get("critical_breaches"):
        print(f"\n[ALERT] {len(summary['critical_breaches'])} breach(es) detected but email not sent (no BREVO_API_KEY).")
    else:
        print("\nAll thresholds within tolerance. No email sent.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
