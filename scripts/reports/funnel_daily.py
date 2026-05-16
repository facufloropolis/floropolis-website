#!/usr/bin/env python3
"""
Daily funnel report -- the ONLY deliverable per Nahua rule for next 2 weeks.

Pulls from Supabase:
  - ga4_sessions for sessions / users
  - ga4_events for view_product, add_to_quote, submit_quote events
  - quote_requests for $/visitor
  - experiments for which moved this week

Computes:
  - Sessions (yesterday + L7d + P7d)
  - PDP view rate = view_product / sessions
  - Add-to-basket rate = add_to_quote / view_product
  - Quote submit rate = submit_quote / add_to_quote
  - Final conv = submit_quote / sessions (the North Star metric)
  - $/visitor = sum(quote_requests.grand_total) / sessions

Renders HTML email + sends via SMTP if creds set, otherwise prints to stdout.

Env vars:
  SUPABASE_URL           required
  SUPABASE_SERVICE_KEY   required
  BREVO_API_KEY          optional -- if missing, skip email send (prints to stdout instead)
  REPORT_TO              optional (default: faculavino@gmail.com)
  REPORT_FROM            optional (default: facu@floropolis.com)
  REPORT_FROM_NAME       optional (default: "Floropolis BI")

Send path: Brevo transactional REST API (https://api.brevo.com/v3/smtp/email).
"""

from __future__ import annotations

import datetime as dt
import json
import os
import sys
import urllib.request


# ============================================================================
# Supabase client (same pattern as D0 cron -- stdlib only)
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
        return [payload]
    return []


def scalar(query: str, default: float = 0.0) -> float:
    rows = execute_sql(query)
    if not rows:
        return default
    row = rows[0]
    if not row:
        return default
    val = next(iter(row.values()))
    return float(val or default)


# ============================================================================
# Funnel queries
# ============================================================================


def funnel_for_range(start: dt.date, end: dt.date) -> dict:
    """Compute funnel metrics for [start, end] inclusive."""
    s = start.isoformat()
    e = end.isoformat()
    sessions = int(scalar(
        f"SELECT COALESCE(SUM(sessions), 0) AS n FROM ga4_sessions "
        f"WHERE session_date BETWEEN '{s}' AND '{e}'"
    ))

    def event_count(name: str) -> int:
        return int(scalar(
            f"SELECT COALESCE(SUM(event_count), 0) AS n FROM ga4_events "
            f"WHERE event_name = '{name}' AND event_date BETWEEN '{s}' AND '{e}'"
        ))

    view_product = event_count("view_product")
    add_to_quote = event_count("add_to_quote")
    submit_quote = event_count("submit_quote")

    # quote_requests grand_total in window (for $/visitor)
    grand_total = scalar(
        f"SELECT COALESCE(SUM(grand_total), 0) AS s FROM quote_requests "
        f"WHERE created_at::date BETWEEN '{s}' AND '{e}'"
    )

    def rate(num: int, denom: int) -> float | None:
        if denom <= 0:
            return None
        return round(num / denom * 100, 2)

    return {
        "start": s,
        "end": e,
        "sessions": sessions,
        "view_product": view_product,
        "add_to_quote": add_to_quote,
        "submit_quote": submit_quote,
        "grand_total_usd": round(grand_total, 2),
        "pdp_view_rate_pct": rate(view_product, sessions),
        "add_to_basket_rate_pct": rate(add_to_quote, view_product),
        "quote_submit_rate_pct": rate(submit_quote, add_to_quote),
        "quotes_per_visitor_pct": rate(submit_quote, sessions),
        "dollars_per_visitor": round(grand_total / sessions, 2) if sessions > 0 else None,
    }


def experiments_moved_this_week() -> list[dict]:
    """Experiments measured in the last 7 days with their delta_pct."""
    seven_days_ago = (dt.date.today() - dt.timedelta(days=7)).isoformat()
    return execute_sql(
        f"SELECT id, name, ga4_event_name, before_value, after_value, delta_pct, date_measured "
        f"FROM experiments WHERE date_measured >= '{seven_days_ago}' "
        f"ORDER BY ABS(COALESCE(delta_pct, 0)) DESC LIMIT 20"
    )


# ============================================================================
# HTML rendering
# ============================================================================


def fmt_pct(v: float | None) -> str:
    return "--" if v is None else f"{v:.2f}%"


def fmt_int(v: int | None) -> str:
    return "--" if v is None else f"{v:,}"


def fmt_money(v: float | None) -> str:
    return "--" if v is None else f"${v:,.2f}"


def delta_arrow(now: float | None, prev: float | None) -> str:
    if now is None or prev is None or prev == 0:
        return ""
    pct = (now - prev) / prev * 100
    if abs(pct) < 1:
        return f' <span style="color:#64748b">({pct:+.1f}%)</span>'
    color = "#059669" if pct > 0 else "#dc2626"
    arrow = "▲" if pct > 0 else "▼"
    return f' <span style="color:{color}">({arrow} {pct:+.1f}%)</span>'


def render_html(yesterday: dict, l7: dict, p7: dict, experiments: list[dict]) -> str:
    today_str = dt.date.today().isoformat()

    def row(label: str, y_v, l7_v, p7_v, fmt=fmt_int) -> str:
        return (
            f"<tr>"
            f'<td style="padding:8px;border-bottom:1px solid #e2e8f0;color:#334155">{label}</td>'
            f'<td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right">{fmt(y_v)}</td>'
            f'<td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right">{fmt(l7_v)}{delta_arrow(l7_v if isinstance(l7_v,(int,float)) else None, p7_v if isinstance(p7_v,(int,float)) else None)}</td>'
            f'<td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;color:#64748b">{fmt(p7_v)}</td>'
            f"</tr>"
        )

    exp_rows = "".join(
        f'<tr>'
        f'<td style="padding:6px;border-bottom:1px solid #e2e8f0;font-family:monospace;font-size:11px;color:#475569">{e.get("id","")}</td>'
        f'<td style="padding:6px;border-bottom:1px solid #e2e8f0">{e.get("name","")}</td>'
        f'<td style="padding:6px;border-bottom:1px solid #e2e8f0;text-align:right;font-family:monospace">{e.get("before_value") or "--"}</td>'
        f'<td style="padding:6px;border-bottom:1px solid #e2e8f0;text-align:right;font-family:monospace">{e.get("after_value") or "--"}</td>'
        f'<td style="padding:6px;border-bottom:1px solid #e2e8f0;text-align:right">{fmt_pct(e.get("delta_pct"))}</td>'
        f'</tr>'
        for e in experiments
    )

    if not exp_rows:
        exp_rows = (
            '<tr><td colspan="5" style="padding:12px;text-align:center;color:#64748b;font-style:italic">'
            "No experiments measured in the last 7 days."
            "</td></tr>"
        )

    return f"""<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#f8fafc;margin:0;padding:24px">
<div style="max-width:680px;margin:0 auto;background:white;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">

<div style="background:#059669;color:white;padding:20px 24px">
<h1 style="margin:0;font-size:20px">Floropolis Funnel -- {today_str}</h1>
<p style="margin:4px 0 0 0;font-size:13px;opacity:0.9">Daily report . [V8 SHADOW] Job_PM</p>
</div>

<div style="padding:20px 24px">
<h2 style="margin:0 0 12px 0;font-size:16px;color:#0f172a">Conversion funnel</h2>
<table style="width:100%;border-collapse:collapse;font-size:13px">
<thead>
<tr style="background:#f8fafc">
<th style="padding:8px;text-align:left;color:#64748b;font-weight:600;border-bottom:2px solid #cbd5e1">Metric</th>
<th style="padding:8px;text-align:right;color:#64748b;font-weight:600;border-bottom:2px solid #cbd5e1">Yesterday</th>
<th style="padding:8px;text-align:right;color:#64748b;font-weight:600;border-bottom:2px solid #cbd5e1">L7d</th>
<th style="padding:8px;text-align:right;color:#64748b;font-weight:600;border-bottom:2px solid #cbd5e1">P7d</th>
</tr>
</thead>
<tbody>
{row("Sessions", yesterday["sessions"], l7["sessions"], p7["sessions"])}
{row("PDP views (view_product)", yesterday["view_product"], l7["view_product"], p7["view_product"])}
{row("PDP view rate", yesterday["pdp_view_rate_pct"], l7["pdp_view_rate_pct"], p7["pdp_view_rate_pct"], fmt_pct)}
{row("Add to quote", yesterday["add_to_quote"], l7["add_to_quote"], p7["add_to_quote"])}
{row("Add-to-basket rate", yesterday["add_to_basket_rate_pct"], l7["add_to_basket_rate_pct"], p7["add_to_basket_rate_pct"], fmt_pct)}
{row("Submit quote", yesterday["submit_quote"], l7["submit_quote"], p7["submit_quote"])}
{row("Quote submit rate", yesterday["quote_submit_rate_pct"], l7["quote_submit_rate_pct"], p7["quote_submit_rate_pct"], fmt_pct)}
</tbody>
</table>

<div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;padding:16px;margin-top:20px">
<div style="font-size:12px;color:#047857;font-weight:600;text-transform:uppercase;letter-spacing:0.04em">North Star</div>
<div style="display:flex;justify-content:space-between;margin-top:6px">
<div>
<div style="font-size:24px;font-weight:700;color:#064e3b">{fmt_pct(l7["quotes_per_visitor_pct"])}</div>
<div style="font-size:11px;color:#047857">quotes/visitor (L7d){delta_arrow(l7["quotes_per_visitor_pct"], p7["quotes_per_visitor_pct"])}</div>
</div>
<div>
<div style="font-size:24px;font-weight:700;color:#064e3b">{fmt_money(l7["dollars_per_visitor"])}</div>
<div style="font-size:11px;color:#047857">$/visitor (L7d){delta_arrow(l7["dollars_per_visitor"], p7["dollars_per_visitor"])}</div>
</div>
</div>
</div>

<h2 style="margin:24px 0 12px 0;font-size:16px;color:#0f172a">Experiments measured (L7d)</h2>
<table style="width:100%;border-collapse:collapse;font-size:12px">
<thead>
<tr style="background:#f8fafc">
<th style="padding:6px;text-align:left;color:#64748b;font-weight:600;border-bottom:2px solid #cbd5e1">ID</th>
<th style="padding:6px;text-align:left;color:#64748b;font-weight:600;border-bottom:2px solid #cbd5e1">Name</th>
<th style="padding:6px;text-align:right;color:#64748b;font-weight:600;border-bottom:2px solid #cbd5e1">Before</th>
<th style="padding:6px;text-align:right;color:#64748b;font-weight:600;border-bottom:2px solid #cbd5e1">After</th>
<th style="padding:6px;text-align:right;color:#64748b;font-weight:600;border-bottom:2px solid #cbd5e1">Delta</th>
</tr>
</thead>
<tbody>
{exp_rows}
</tbody>
</table>

<div style="margin-top:20px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8">
Source: Supabase swhglnjyuorkycpgkmec . ga4_sessions + ga4_events + quote_requests + experiments<br>
Cron: GitHub Actions daily 13:00 UTC (06:00 PDT) . Job_PM-owned per Nahua P2.3 V1 Sense Product/Web
</div>

</div>
</div>
</body></html>"""


# ============================================================================
# Send
# ============================================================================


def send_email(html: str, subject: str) -> bool:
    """Send via Brevo transactional REST API. Returns False if BREVO_API_KEY missing."""
    api_key = os.environ.get("BREVO_API_KEY", "").strip()
    if not api_key:
        return False

    # `or` handles both "key missing" AND "key set to empty string" (which GitHub Actions
    # does when a secret doesn't exist but the env var is still passed).
    to = os.environ.get("REPORT_TO") or "faculavino@gmail.com"
    sender_email = os.environ.get("REPORT_FROM") or "facu@floropolis.com"
    sender_name = os.environ.get("REPORT_FROM_NAME") or "Floropolis BI"

    payload = {
        "sender": {"name": sender_name, "email": sender_email},
        "to": [{"email": to}],
        "subject": subject,
        "htmlContent": html,
        "textContent": "Your funnel report is in HTML. View in a modern email client.",
    }

    req = urllib.request.Request(
        "https://api.brevo.com/v3/smtp/email",
        headers={
            "accept": "application/json",
            "api-key": api_key,
            "content-type": "application/json",
        },
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            resp.read()
        return True
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        print(f"\nBREVO API error {e.code}: {body[:500]}", file=sys.stderr)
        # Surface the offending payload (without HTML content -- too long)
        debug_payload = {**payload, "htmlContent": f"<{len(payload['htmlContent'])} chars omitted>"}
        print(f"Payload was: {json.dumps(debug_payload, indent=2)[:600]}", file=sys.stderr)
        return False


# ============================================================================
# Main
# ============================================================================


def main() -> int:
    if not os.environ.get("SUPABASE_URL") or not os.environ.get("SUPABASE_SERVICE_KEY"):
        print("ERROR: SUPABASE_URL + SUPABASE_SERVICE_KEY env vars required", file=sys.stderr)
        return 2

    today = dt.date.today()
    yesterday = today - dt.timedelta(days=1)
    l7_start = today - dt.timedelta(days=7)
    p7_start = today - dt.timedelta(days=14)
    p7_end = today - dt.timedelta(days=8)

    y_funnel = funnel_for_range(yesterday, yesterday)
    l7_funnel = funnel_for_range(l7_start, today - dt.timedelta(days=1))
    p7_funnel = funnel_for_range(p7_start, p7_end)
    experiments = experiments_moved_this_week()

    summary = {
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "yesterday": y_funnel,
        "l7d": l7_funnel,
        "p7d": p7_funnel,
        "experiments_measured_l7": len(experiments),
    }
    print(json.dumps(summary, indent=2))

    html = render_html(y_funnel, l7_funnel, p7_funnel, experiments)
    subject = (
        f"[V8 SHADOW] Floropolis funnel {today.isoformat()} -- "
        f"q/v {fmt_pct(l7_funnel['quotes_per_visitor_pct'])} L7"
    )

    if send_email(html, subject):
        print(f"\nEMAIL SENT via Brevo to: {os.environ.get('REPORT_TO','faculavino@gmail.com')}")
    else:
        print("\nEMAIL SKIPPED: BREVO_API_KEY not set. Set repo secret to enable.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
