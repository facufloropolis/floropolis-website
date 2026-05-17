#!/usr/bin/env python3
"""
Daily snapshot of production floropolis_inventory into supabase-backup mirror.

Per Facu directive 2026-05-17 (standing rule #10): new pipelines must validate
against supabase-backup before touching prod. This script keeps the mirror
fresh so inventory_data_validator.py can run against backup nightly.

Flow:
  1. Pull all rows from prod (floropolis-bi.floropolis_inventory)
  2. Open a sync_log row, status='running'
  3. TRUNCATE supabase-backup.floropolis_inventory_mirror
  4. INSERT all rows (batched 500 at a time via REST API upsert)
  5. Close sync_log row, status='success' + counts
  6. On any error: status='failed' + error_message

Schedule: GH Actions cron daily 13:00 UTC (1h before validator at 14:00 UTC).

Env vars:
  SOURCE_SUPABASE_URL          floropolis-bi project URL
  SOURCE_SUPABASE_SERVICE_KEY  floropolis-bi service role key
  BACKUP_SUPABASE_URL          supabase-backup project URL (ibckhcjvyxzrhvdiazbx)
  BACKUP_SUPABASE_SERVICE_KEY  supabase-backup service role key
"""

from __future__ import annotations

import datetime as dt
import json
import os
import sys
import urllib.error
import urllib.request


def _request(url: str, headers: dict, data: bytes | None = None, method: str = "GET") -> bytes:
    req = urllib.request.Request(url, headers=headers, data=data, method=method)
    with urllib.request.urlopen(req, timeout=120) as resp:
        return resp.read()


def _src_headers() -> dict:
    key = os.environ["SOURCE_SUPABASE_SERVICE_KEY"]
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Accept": "application/json",
        "Content-Type": "application/json",
    }


def _bak_headers() -> dict:
    key = os.environ["BACKUP_SUPABASE_SERVICE_KEY"]
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }


def fetch_source_inventory() -> list[dict]:
    """Pull all rows from production via execute_sql RPC (no pagination needed for ~1000 rows)."""
    url = os.environ["SOURCE_SUPABASE_URL"].rstrip("/") + "/rest/v1/rpc/execute_sql"
    payload = json.dumps({
        "query": (
            "SELECT id, scrape_date, name, category, color, variety, length, price, unit, "
            "stems_per_bunch, units_per_box, box_type, stock, vendor, created_at, arrival_date, "
            "is_on_deal, deal_label, deal_price, deal_expiry, is_best_seller, is_featured, "
            "display_order, slug, images, whatsapp_message_template, tier, total_stems, "
            "contents_note, first_oos_date, price_override, commitment_tier, ingest_run_id, "
            "farm_cost, cost_source, cost_verified_at, price_formula_version, margin_status, "
            "k2k_alignment_status, k2k_last_verified_at, k2k_listed_price_avg, unit_type, "
            "unit_weight_g, has_open_price_alert, live, active, manual_featured_override "
            "FROM floropolis_inventory ORDER BY id"
        )
    }).encode("utf-8")
    raw = _request(url, _src_headers(), payload, "POST")
    data = json.loads(raw) if raw else []
    if isinstance(data, list):
        return data
    if isinstance(data, dict) and isinstance(data.get("data"), list):
        return data["data"]
    raise RuntimeError(f"Unexpected source payload shape: {type(data)}")


def open_sync_log() -> int:
    url = os.environ["BACKUP_SUPABASE_URL"].rstrip("/") + "/rest/v1/inventory_mirror_sync_log"
    headers = {**_bak_headers(), "Prefer": "return=representation"}
    payload = json.dumps({"status": "running"}).encode("utf-8")
    raw = _request(url, headers, payload, "POST")
    rows = json.loads(raw)
    return int(rows[0]["run_id"])


def close_sync_log(run_id: int, status: str, source_count: int, mirror_count: int, error: str | None = None) -> None:
    url = os.environ["BACKUP_SUPABASE_URL"].rstrip("/") + f"/rest/v1/inventory_mirror_sync_log?run_id=eq.{run_id}"
    payload = json.dumps({
        "finished_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "source_rows_count": source_count,
        "mirror_rows_count": mirror_count,
        "status": status,
        "error_message": error,
    }).encode("utf-8")
    _request(url, _bak_headers(), payload, "PATCH")


def truncate_mirror() -> None:
    """DELETE everything from mirror (TRUNCATE not exposed via REST)."""
    url = os.environ["BACKUP_SUPABASE_URL"].rstrip("/") + "/rest/v1/floropolis_inventory_mirror?id=gte.0"
    _request(url, _bak_headers(), None, "DELETE")


def insert_mirror_batch(rows: list[dict]) -> None:
    url = os.environ["BACKUP_SUPABASE_URL"].rstrip("/") + "/rest/v1/floropolis_inventory_mirror"
    payload = json.dumps(rows).encode("utf-8")
    _request(url, _bak_headers(), payload, "POST")


def count_mirror() -> int:
    url = (
        os.environ["BACKUP_SUPABASE_URL"].rstrip("/")
        + "/rest/v1/floropolis_inventory_mirror?select=id"
    )
    headers = {**_bak_headers(), "Prefer": "count=exact", "Range": "0-0", "Range-Unit": "items"}
    req = urllib.request.Request(url, headers=headers, method="GET")
    with urllib.request.urlopen(req, timeout=60) as resp:
        cr = resp.headers.get("content-range") or ""
        if "/" in cr:
            return int(cr.split("/")[-1])
    return -1


def main() -> int:
    required = ("SOURCE_SUPABASE_URL", "SOURCE_SUPABASE_SERVICE_KEY",
                "BACKUP_SUPABASE_URL", "BACKUP_SUPABASE_SERVICE_KEY")
    missing = [k for k in required if not os.environ.get(k)]
    if missing:
        print(f"ERROR: missing env vars: {missing}", file=sys.stderr)
        return 2

    run_id: int | None = None
    try:
        rows = fetch_source_inventory()
        source_count = len(rows)
        print(f"Source: {source_count} rows pulled from prod")

        run_id = open_sync_log()
        print(f"Sync log run_id={run_id}")

        truncate_mirror()
        print("Mirror truncated")

        # Insert in batches of 200 to stay under REST payload limits
        BATCH = 200
        for i in range(0, len(rows), BATCH):
            chunk = rows[i : i + BATCH]
            insert_mirror_batch(chunk)
            print(f"  inserted {min(i + BATCH, len(rows))}/{len(rows)}")

        mirror_count = count_mirror()
        print(f"Mirror: {mirror_count} rows")

        if source_count != mirror_count:
            close_sync_log(run_id, "failed", source_count, mirror_count,
                          f"row count mismatch: source={source_count} mirror={mirror_count}")
            print(f"FAIL: source={source_count} != mirror={mirror_count}", file=sys.stderr)
            return 1

        close_sync_log(run_id, "success", source_count, mirror_count)
        print(f"SUCCESS: {source_count} rows mirrored")
        return 0

    except Exception as e:
        err = str(e)[:500]
        print(f"ERROR: {err}", file=sys.stderr)
        if run_id is not None:
            try:
                close_sync_log(run_id, "failed", -1, -1, err)
            except Exception:
                pass
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
