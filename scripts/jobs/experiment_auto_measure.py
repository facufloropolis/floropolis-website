#!/usr/bin/env python3
"""
D0 -- experiment auto-measure cron (Phase 2 prep).

Reads SUPABASE_URL + SUPABASE_SERVICE_KEY from env. No local config files.
Self-contained: stdlib only (urllib, json, datetime). No pip install required.

Job_PM-owned. Per Nahua framework v2: Job is R+A, Pita measures
(verify_experiment_auto_measure), metric = unmeasured experiments age >14 sessions.

Source of truth for logic: ~/Claude_MA_v8/Job_PM/scripts/experiment_auto_measure.py
(local dev version with shared MA_v8 helpers). This is the portable cloud version.

Behavior:
  1. Find live, unmeasured experiments older than 7 days
  2. Sum GA4 event counts for each (event_name, date range)
  3. Compute after_value = total / days_since_live
  4. Compute delta_pct vs experiments.before_value if set
  5. UPDATE experiments SET after_value, delta_pct, date_measured, status='measured'
  6. Print JSON summary (workflow logs read this)

Env vars required:
  SUPABASE_URL              e.g. https://swhglnjyuorkycpgkmec.supabase.co
  SUPABASE_SERVICE_KEY      service role key (NOT anon)

Optional flags:
  --dry-run                 measure but do NOT write back to DB
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys
import urllib.request


def iso_now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")


def today_str() -> str:
    return dt.date.today().isoformat()


def _sql_quote(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


class SupabaseClient:
    def __init__(self, url: str, key: str) -> None:
        self.url = url.rstrip("/")
        self.key = key
        self.rpc_base = self.url + "/rest/v1/rpc"

    def _post_rpc(self, fn: str, params: dict) -> object:
        headers = {
            "apikey": self.key,
            "Authorization": f"Bearer {self.key}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        }
        data = json.dumps(params).encode("utf-8")
        req = urllib.request.Request(
            f"{self.rpc_base}/{fn}", headers=headers, data=data, method="POST"
        )
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read().decode("utf-8")
        return json.loads(raw) if raw else None

    def execute_sql(self, query: str) -> list[dict]:
        payload = self._post_rpc("execute_sql", {"query": query})
        if payload is None:
            return []
        if isinstance(payload, list):
            return payload
        if isinstance(payload, dict):
            if isinstance(payload.get("data"), list):
                return payload["data"]
            if isinstance(payload.get("rows"), list):
                return payload["rows"]
            return [payload]
        return []

    def execute_sql_dml(self, query: str) -> int:
        payload = self._post_rpc("execute_sql_dml", {"query": query})
        if isinstance(payload, dict):
            return int(payload.get("rows_affected", 0) or 0)
        return 0


def get_client() -> SupabaseClient:
    url = os.environ.get("SUPABASE_URL", "").strip()
    key = os.environ.get("SUPABASE_SERVICE_KEY", "").strip()
    if not url or not key:
        print(
            "ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY env vars are required.",
            file=sys.stderr,
        )
        sys.exit(2)
    return SupabaseClient(url, key)


def fetch_candidates(client: SupabaseClient) -> list[dict]:
    query = """
    SELECT id, name, date_live, date_measured, ga4_event_name, before_value
    FROM experiments
    WHERE date_measured IS NULL
      AND date_live IS NOT NULL
      AND status = 'live'
    ORDER BY date_live ASC
    """
    return client.execute_sql(query)


def measure_row(client: SupabaseClient, row: dict) -> dict | None:
    date_live_raw = str(row.get("date_live") or "").strip()
    if not date_live_raw:
        return None
    date_live = dt.date.fromisoformat(date_live_raw[:10])
    measurement_start = date_live + dt.timedelta(days=7)
    today = dt.date.today()
    if today < measurement_start:
        return {
            "id": row["id"],
            "name": row.get("name"),
            "status": "too_early",
            "date_live": date_live.isoformat(),
            "measurement_start": measurement_start.isoformat(),
        }
    days_since_live = max((today - date_live).days, 1)
    event_name = str(row.get("ga4_event_name") or "").strip()
    if not event_name:
        return {
            "id": row["id"],
            "name": row.get("name"),
            "status": "missing_event_name",
            "date_live": date_live.isoformat(),
        }
    sum_query = f"""
    SELECT COALESCE(SUM(event_count), 0) AS total_event_count
    FROM ga4_events
    WHERE event_name = {_sql_quote(event_name)}
      AND event_date BETWEEN {_sql_quote(date_live.isoformat())} AND CURRENT_DATE
    """
    result = client.execute_sql(sum_query)
    total = float((result[0].get("total_event_count") if result else 0) or 0)
    after_value = round(total / days_since_live, 4)
    baseline = float(row.get("before_value") or 0)
    delta_pct = None
    if baseline > 0:
        delta_pct = round(((after_value - baseline) / baseline) * 100, 2)
    return {
        "id": row["id"],
        "name": row.get("name"),
        "status": "eligible",
        "date_live": date_live.isoformat(),
        "measurement_start": measurement_start.isoformat(),
        "ga4_event_name": event_name,
        "days_since_live": days_since_live,
        "before_value": baseline,
        "after_value": after_value,
        "delta_pct": delta_pct,
    }


def apply_measurements(client: SupabaseClient, rows: list[dict]) -> int:
    affected = 0
    for row in rows:
        if row.get("status") != "eligible":
            continue
        delta_sql = "NULL" if row.get("delta_pct") is None else str(row["delta_pct"])
        query = f"""
        UPDATE experiments
        SET after_value = {row['after_value']},
            delta_pct = {delta_sql},
            date_measured = CURRENT_DATE,
            status = 'measured'
        WHERE id = {_sql_quote(str(row['id']))}
        """
        affected += client.execute_sql_dml(query)
    return affected


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="D0 experiment auto-measure cron.")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args(argv)

    client = get_client()
    measured_rows = [measure_row(client, row) for row in fetch_candidates(client)]
    measured_rows = [row for row in measured_rows if row is not None]
    eligible = [row for row in measured_rows if row.get("status") == "eligible"]
    measured_count = 0 if args.dry_run else apply_measurements(client, eligible)
    summary = {
        "generated_at": iso_now(),
        "date": today_str(),
        "dry_run": args.dry_run,
        "eligible_count": len(eligible),
        "measured_count": measured_count,
        "too_early_count": len([r for r in measured_rows if r.get("status") == "too_early"]),
        "missing_event_name_count": len(
            [r for r in measured_rows if r.get("status") == "missing_event_name"]
        ),
        "no_baseline_count": len(
            [r for r in eligible if r.get("delta_pct") is None]
        ),
        "rows": measured_rows,
    }
    print(json.dumps(summary, indent=2, ensure_ascii=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
