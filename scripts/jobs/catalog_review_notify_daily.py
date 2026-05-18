#!/usr/bin/env python3
"""
Catalog Review Notify Daily -- daily email to Facu summarizing the catalog
approval queue.
v1 | 2026-05-18 | Job_PM [V8 SHADOW] (CAT-S6)

Reads `catalog_classifications` where reviewer_action='awaiting' AND
status='needs_facu_review' and emails Facu a triage summary so he knows there
are rows waiting on his decision in /admin/catalog/approval-queue.

DIFFERENT from inventory_data_validator.py (Subagent A) and
catalog_audit_daily.py:
  - Subagent A validates the snapshot + WRITES classifications.
  - catalog_audit_daily emits day-over-day deltas.
  - THIS script just READS classifications and notifies Facu when the queue
    is non-empty. No writes to inventory or classifications.

Schedule: GitHub Actions cron daily 14:30 UTC (30 min after Subagent A so the
queue reflects today's validation pass).

Output:
  - If queue is empty: prints "no review needed, skipping email" and exits 0
    WITHOUT sending email.
  - If queue is non-empty: aggregates by vendor + by failing gate, renders an
    HTML email, sends via Brevo to faculavino@gmail.com (or REPORT_TO).
  - Always writes /tmp/catalog_review_notify_<date>.json for audit, regardless
    of whether email was sent.

Env vars:
  SUPABASE_URL          required
  SUPABASE_SERVICE_KEY  required
  BREVO_API_KEY         optional (skip email + just print summary if missing,
                        same idiom as Subagent A)
  REPORT_TO             optional (default: faculavino@gmail.com)
"""

from __future__ import annotations

import datetime as dt
import json
import os
import sys
import urllib.error
import urllib.request


APPROVAL_QUEUE_URL = (
    "https://floropolis-clean-git-proposal-in-86b0f9-facufloropolis-projects"
    ".vercel.app/admin/catalog/approval-queue"
)

TOP_GATES_LIMIT = 5      # show top N failing gates globally
PER_VENDOR_LIMIT = 25    # cap rendered vendor table rows


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
# Queue read + aggregate
# ============================================================================


def fetch_awaiting_rows() -> list[dict]:
    """Pull all rows currently flagged as awaiting Facu's review.

    Filter: reviewer_action='awaiting' AND status='needs_facu_review'.
    Returns the minimal columns we need for aggregation.
    """
    return execute_sql(
        "SELECT sku_id, vendor, tier, variety, failing_gates, gate_score, "
        "last_validated_at, last_changed_at "
        "FROM catalog_classifications "
        "WHERE reviewer_action = 'awaiting' "
        "  AND status = 'needs_facu_review' "
        "ORDER BY last_changed_at DESC, sku_id ASC"
    )


def _parse_gates(raw) -> list[str]:
    """failing_gates may arrive as JSON string or already-decoded list depending
    on PostgREST/execute_sql wrapper. Normalize to list[str]."""
    if raw is None:
        return []
    if isinstance(raw, list):
        return [str(g) for g in raw]
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                return [str(g) for g in parsed]
        except (json.JSONDecodeError, ValueError):
            return []
    return []


def aggregate(rows: list[dict]) -> dict:
    """Build the summary used for the email body.

    Returns:
      {
        total: int,
        by_vendor: [{vendor, count, top_gate, top_gate_count}, ...] sorted desc by count,
        top_gates: [{gate, count}, ...] sorted desc, capped at TOP_GATES_LIMIT,
        oldest_awaiting: ISO date (or None),
      }
    """
    total = len(rows)
    vendor_counts: dict[str, int] = {}
    vendor_gate_counts: dict[str, dict[str, int]] = {}
    global_gate_counts: dict[str, int] = {}
    oldest: dt.datetime | None = None

    for r in rows:
        vendor = r.get("vendor") or "Unknown"
        vendor_counts[vendor] = vendor_counts.get(vendor, 0) + 1
        gates = _parse_gates(r.get("failing_gates"))
        vbucket = vendor_gate_counts.setdefault(vendor, {})
        for g in gates:
            global_gate_counts[g] = global_gate_counts.get(g, 0) + 1
            vbucket[g] = vbucket.get(g, 0) + 1

        # Track oldest awaiting by last_changed_at (when the row entered this status)
        lc = r.get("last_changed_at")
        if lc:
            try:
                # tolerate "YYYY-MM-DDTHH:MM:SS..." and trailing tz; Python 3.12 handles "+00:00"
                lc_dt = dt.datetime.fromisoformat(str(lc).replace("Z", "+00:00"))
                if oldest is None or lc_dt < oldest:
                    oldest = lc_dt
            except (ValueError, TypeError):
                pass

    by_vendor_list = []
    for vendor, count in vendor_counts.items():
        vgates = vendor_gate_counts.get(vendor, {})
        if vgates:
            top_gate, top_gate_count = max(vgates.items(), key=lambda kv: kv[1])
        else:
            top_gate, top_gate_count = "(none)", 0
        by_vendor_list.append({
            "vendor": vendor,
            "count": count,
            "top_gate": top_gate,
            "top_gate_count": top_gate_count,
        })
    by_vendor_list.sort(key=lambda x: x["count"], reverse=True)

    top_gates_list = sorted(
        ({"gate": g, "count": c} for g, c in global_gate_counts.items()),
        key=lambda x: x["count"],
        reverse=True,
    )[:TOP_GATES_LIMIT]

    return {
        "total": total,
        "by_vendor": by_vendor_list,
        "top_gates": top_gates_list,
        "oldest_awaiting": oldest.isoformat() if oldest else None,
    }


# ============================================================================
# Email (via Brevo)
# ============================================================================


def render_html(summary: dict) -> str:
    total = summary["total"]
    by_vendor = summary["by_vendor"][:PER_VENDOR_LIMIT]
    top_gates = summary["top_gates"]
    oldest = summary["oldest_awaiting"]

    vendor_rows = "".join(
        f'<tr><td style="padding:6px 8px">{v["vendor"]}</td>'
        f'<td style="padding:6px 8px;text-align:right"><b>{v["count"]}</b></td>'
        f'<td style="padding:6px 8px">{v["top_gate"]} ({v["top_gate_count"]})</td></tr>'
        for v in by_vendor
    )

    gates_rows = "".join(
        f'<tr><td style="padding:6px 8px">{g["gate"]}</td>'
        f'<td style="padding:6px 8px;text-align:right"><b>{g["count"]}</b></td></tr>'
        for g in top_gates
    )

    oldest_html = (
        f'<p style="font-size:12px;color:#475569;margin:6px 0 0 0">'
        f'Oldest row in queue entered status on <b>{oldest[:10]}</b>.</p>'
        if oldest else ""
    )

    return f"""<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:680px;margin:0 auto;padding:24px">
<h2 style="color:#b45309;margin:0">{total} SKUs need your review</h2>
<p style="font-size:13px;color:#475569;margin:6px 0">The catalog validator flagged these as edge cases needing your decision.
Visit <a href="{APPROVAL_QUEUE_URL}" style="color:#0369a1">/admin/catalog/approval-queue</a>.</p>
{oldest_html}

<h3 style="margin:18px 0 4px 0;font-size:15px">By vendor</h3>
<table style="width:100%;border-collapse:collapse;font-size:13px;margin:6px 0">
<thead><tr style="background:#fef3c7">
<th style="padding:8px;text-align:left">Vendor</th>
<th style="padding:8px;text-align:right">Awaiting</th>
<th style="padding:8px;text-align:left">Most common gate</th>
</tr></thead>
<tbody>{vendor_rows}</tbody>
</table>

<h3 style="margin:18px 0 4px 0;font-size:15px">Top failure modes</h3>
<table style="width:100%;border-collapse:collapse;font-size:13px;margin:6px 0">
<thead><tr style="background:#fef3c7">
<th style="padding:8px;text-align:left">Gate</th>
<th style="padding:8px;text-align:right">Count</th>
</tr></thead>
<tbody>{gates_rows}</tbody>
</table>

<hr style="margin:20px 0;border:none;border-top:1px solid #e2e8f0">
<p style="font-size:11px;color:#94a3b8">This is the daily catalog triage email.
To stop: remove the workflow .github/workflows/catalog_review_notify_daily.yml.<br/>
Generated by catalog_review_notify_daily.py (Job_PM CAT-S6). Cron daily 14:30 UTC.</p>
</body></html>"""


def send_email(summary: dict, today: dt.date) -> bool:
    api_key = os.environ.get("BREVO_API_KEY", "").strip()
    if not api_key:
        print("EMAIL SKIPPED: BREVO_API_KEY not set", file=sys.stderr)
        return False

    to = os.environ.get("REPORT_TO") or "faculavino@gmail.com"
    total = summary["total"]
    subj = f"[V8 SHADOW] [CATALOG] {total} SKUs awaiting your review"

    html = render_html(summary)
    text_lines = [
        f"{total} SKUs awaiting your review.",
        f"View: {APPROVAL_QUEUE_URL}",
        "",
        "By vendor (top 10):",
    ]
    for v in summary["by_vendor"][:10]:
        text_lines.append(
            f"  - {v['vendor']}: {v['count']} awaiting (top gate: {v['top_gate']})"
        )
    text_lines.append("")
    text_lines.append("Top failure modes:")
    for g in summary["top_gates"]:
        text_lines.append(f"  - {g['gate']}: {g['count']}")

    payload = {
        "sender": {"name": "Floropolis BI", "email": "facu@floropolis.com"},
        "to": [{"email": to}],
        "subject": subj,
        "htmlContent": html,
        "textContent": "\n".join(text_lines),
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
        try:
            body = e.read().decode("utf-8")[:200]
        except Exception:
            body = ""
        print(f"BREVO error {e.code}: {body}", file=sys.stderr)
        return False


# ============================================================================
# Main
# ============================================================================


def main() -> int:
    if not os.environ.get("SUPABASE_URL") or not os.environ.get("SUPABASE_SERVICE_KEY"):
        print("ERROR: SUPABASE_URL + SUPABASE_SERVICE_KEY required", file=sys.stderr)
        return 2

    today = dt.date.today()

    rows = fetch_awaiting_rows()
    summary = aggregate(rows)
    summary["generated_at"] = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    summary["date"] = today.isoformat()

    # Always write the audit file (even on empty queue) so we have a daily trace.
    state_path = f"/tmp/catalog_review_notify_{today.isoformat()}.json"
    try:
        with open(state_path, "w") as f:
            json.dump(summary, f, indent=2, default=str)
        print(f"State file written: {state_path}")
    except OSError as e:
        print(f"State file write failed: {e}", file=sys.stderr)

    if summary["total"] == 0:
        print("no review needed, skipping email")
        return 0

    # Print summary to stdout (workflow log) before sending
    print(json.dumps({
        "date": summary["date"],
        "total": summary["total"],
        "by_vendor": summary["by_vendor"][:10],
        "top_gates": summary["top_gates"],
        "oldest_awaiting": summary["oldest_awaiting"],
    }, indent=2, default=str))

    sent = send_email(summary, today)
    if sent:
        print(f"\n[NOTIFY] {summary['total']} SKU(s) awaiting review emailed to Facu.")
    else:
        print(
            f"\n[NOTIFY] {summary['total']} SKU(s) awaiting review but email not sent "
            "(no BREVO_API_KEY or send failed)."
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
