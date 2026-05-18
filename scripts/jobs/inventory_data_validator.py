#!/usr/bin/env python3
"""
SUBAGENT A: Inventory Data Validator (Job_PM-owned)
v1.2 | 2026-05-18 | Job_PM [V8 SHADOW]

Continuous validation of `floropolis_inventory` data quality. Catches what Rose's
pipeline might miss before customers see it. Per Facu directive 2026-05-17:
"We cannot miss prices, margins, or price alerts."

Schedule: GitHub Actions cron daily 14:00 UTC (1h after Rose's ingest typically completes).
Invocation: Task-tool ad-hoc, or `python scripts/jobs/inventory_data_validator.py`.

Output:
  - JSON summary printed to stdout (workflow log)
  - JSON state file written to /tmp/inventory_validation_<date>.json
  - HTML email to faculavino@gmail.com via Brevo IF any critical threshold breached
  - Per-SKU classifications upserted into `catalog_classifications` (v1.2)

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
  INVENTORY_TABLE       optional (default: floropolis_inventory; mirror for backup)

v1.2 changes (CAT-S2, 2026-05-18):
  1. Reads pricing constants (gpm_target, fedex_rate_per_kg, fuel_surcharge_mult)
     from `pricing_constants` table at start of run. Falls back to hardcoded
     defaults if table is empty/unreachable. This means Facu can edit values via
     /admin/catalog/config and next validator run picks them up.
  2. Reads box weights from `box_master` table at start of run. Falls back to
     hardcoded lookup if table is empty. Multi-format box types (EB/QB, HB/QB,
     EB/HB/QB) still resolve via min() over component weights at runtime.
  3. Per-SKU classification against the 16 hard gates from perfect_inventory_bar.md.
     Each row gets a status (publishable / needs_data_fix / needs_facu_review),
     failing_gates jsonb array, and gate_score (0-16). UPSERTed into
     `catalog_classifications` with last_changed_at preserved on unchanged rows
     and reviewer_* columns NEVER overwritten (preserves human input).
  4. New section in JSON output: `classifications_summary` with global + per-vendor
     + per (vendor,tier) status counts.

  Note on gate coverage: gates 14 (last_harvested_date), 15 (vase_life_days) are
  NOT yet evaluated because the mirror schema lacks the underlying columns. Gate 11
  uses `contents_note` (column actually present) since `contents_description` is
  what perfect_inventory_bar.md aspires to. Per spec: only emit IDs we actually
  evaluate; do not fake-pass. Once Rose adds the columns, gate evaluation expands
  automatically.

v1.1 changes (W2-S7 polish, 2026-05-17):
  1. USA vendor branch verified — zero USA-vendor rows in mirror today, code dormant
     but correct (cost / 0.67, no delivery). Awaits Megaflor-USA SKUs.
  2. box_dim_kg_lookup expanded to cover multi-format box types observed in mirror:
     - "EB/QB", "HB/QB", "EB/HB/QB" (Magic Flowers ships multi-format): use SMALLEST
       weight in the set, which yields a LOWER expected price -> preserves alerts on
       overpriced rows (does not silence them). Justification: when vendor reserves
       the right to ship in any of N box types, we should validate against the cheapest
       delivery scenario; if actual price still deviates, that is real signal.
     - "BB" (2 Magic Flowers rows): UNKNOWN code, NO entry added. TODO escalate to Rose.
  3. New helper `vendor_deviation_summary()` produces per-vendor breakdown of
     formula deviations (mean, max, direction). Added to summary JSON under
     `vendor_deviation_analysis` and rendered in the email body when
     `formula_deviation` is a critical breach.
"""

from __future__ import annotations

import datetime as dt
import json
import math
import os
import sys
import urllib.request


# === Constants per Rose's pricing_formula.md (Section 1) ===
# These are FALLBACKS. At runtime, load_pricing_constants() and load_box_master()
# pull live values from `pricing_constants` and `box_master`. Edits via
# /admin/catalog/config flow through on the next validator run.
GPM_TARGET = 0.33                 # gross profit margin on selling price
FEDEX_RATE_PER_KG = 6.50           # USD per kg
FUEL_SURCHARGE_MULT = 1.25         # 25% fuel surcharge
FORMULA_DEVIATION_THRESHOLD_PCT = 5  # flag if actual price deviates >5% from expected

# Hardcoded box weight fallback (used only if box_master read fails / returns empty).
# Multi-format keys (EB/QB, HB/QB, EB/HB/QB) are derived at runtime from min() of
# component weights, so they are NOT included here.
_BOX_DIM_KG_FALLBACK = {
    "QB": 6.80,   "QB-M": 5.30,  "QB-OLI": 6.80,  "QB-MF": 6.05,
    "HB": 11.70,  "EB": 4.25,    "EB-M": 3.99,    "EB-MF": 4.76,
    "SB-M": 2.94, "QBV": 8.75,   "FB": 20.90,
    "1/8-MF": 4.76,
}

# Live, mutable lookup. Populated by load_box_master() at start of run().
BOX_DIM_KG: dict[str, float] = dict(_BOX_DIM_KG_FALLBACK)

# Tracks whether pricing/box reads fell back to hardcoded values (for return summary).
CONFIG_LOAD_FALLBACK = {
    "pricing_constants": False,
    "box_master": False,
}

# 16 hard gates from kb/projects/perfect_inventory_bar.md.
# Gates currently NOT evaluated (mirror lacks the columns):
#   14 missing_last_harvested  -- needs last_harvested_date column (Rose owns)
#   15 missing_vase_life       -- needs vase_life_days column (Rose owns)
# Gate 11 uses `contents_note` (the column actually present).
ALL_GATE_IDS = [
    "price_zero",                    # 1
    "margin_unknown",                # 2
    "formula_deviation",             # 3
    "missing_cost_source",           # 4
    "cost_unverified",               # 5
    "open_price_alert",              # 6
    "missing_box_dims",              # 7
    "missing_units_or_bunch",        # 8
    "missing_unit",                  # 9
    "missing_image",                 # 10
    "missing_contents_description",  # 11 (mapped to contents_note)
    "missing_arrival_date",          # 12a
    "t2_outside_5d_window",          # 12b
    "t3_outside_14d_window",         # 12c
    "missing_vendor_name",           # 13
    "stock_live_mismatch",           # extra (not in the 16, but Facu-review signal)
]

# Subset we actually evaluate today. Used to size gate_score max.
EVALUATED_GATE_IDS = {
    "price_zero",
    "margin_unknown",
    "formula_deviation",
    "missing_cost_source",
    "cost_unverified",
    "open_price_alert",
    "missing_box_dims",
    "missing_units_or_bunch",
    "missing_unit",
    "missing_image",
    "missing_contents_description",
    "missing_arrival_date",
    "t2_outside_5d_window",
    "t3_outside_14d_window",
    "missing_vendor_name",
}
# Number of gates we can actually evaluate today (max gate_score). The schema
# caps gate_score at 16, but with gates 14/15 not yet implementable our practical
# max is len(EVALUATED_GATE_IDS) = 15. We still emit 0-16 in the column so future
# expansion is a no-op DB-side.

# Gates that route to needs_data_fix (Rose can resolve without Facu).
DATA_FIX_GATES = {
    "price_zero",
    "margin_unknown",
    "missing_cost_source",
    "cost_unverified",
    "open_price_alert",
    "missing_arrival_date",
    "missing_image",
    "missing_unit",
    "missing_units_or_bunch",
    "missing_box_dims",
    "missing_contents_description",
    "missing_vendor_name",
}
# Gates that route to needs_facu_review (policy/edge calls).
FACU_REVIEW_GATES = {
    "formula_deviation",
    "stock_live_mismatch",
    "t2_outside_5d_window",
    "t3_outside_14d_window",
}

# Cost verification freshness window (gate 5).
COST_VERIFIED_WINDOW_DAYS = 30

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
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        # Surface the response body so callers can debug Postgres errors.
        try:
            body = e.read().decode("utf-8")[:600]
        except Exception:
            body = ""
        raise RuntimeError(f"supabase rpc {fn} {e.code}: {body}") from e
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
# Config loaders (pricing_constants + box_master)
# ============================================================================


def load_pricing_constants() -> None:
    """Load GPM_TARGET, FEDEX_RATE_PER_KG, FUEL_SURCHARGE_MULT from pricing_constants
    table. Mutate module globals. On any failure or empty table, leave hardcoded
    fallbacks in place and set CONFIG_LOAD_FALLBACK['pricing_constants']=True.
    """
    global GPM_TARGET, FEDEX_RATE_PER_KG, FUEL_SURCHARGE_MULT
    try:
        rows = execute_sql(
            "SELECT id, value_numeric FROM pricing_constants "
            "WHERE id IN ('gpm_target','fedex_rate_per_kg','fuel_surcharge_mult')"
        )
    except Exception as e:
        print(f"pricing_constants read failed ({e}); using hardcoded fallback", file=sys.stderr)
        CONFIG_LOAD_FALLBACK["pricing_constants"] = True
        return

    if not rows:
        print("pricing_constants empty; using hardcoded fallback", file=sys.stderr)
        CONFIG_LOAD_FALLBACK["pricing_constants"] = True
        return

    by_id = {r["id"]: r.get("value_numeric") for r in rows}
    try:
        if by_id.get("gpm_target") is not None:
            GPM_TARGET = float(by_id["gpm_target"])
        if by_id.get("fedex_rate_per_kg") is not None:
            FEDEX_RATE_PER_KG = float(by_id["fedex_rate_per_kg"])
        if by_id.get("fuel_surcharge_mult") is not None:
            FUEL_SURCHARGE_MULT = float(by_id["fuel_surcharge_mult"])
    except (TypeError, ValueError) as e:
        print(f"pricing_constants parse failed ({e}); using hardcoded fallback", file=sys.stderr)
        CONFIG_LOAD_FALLBACK["pricing_constants"] = True


def load_box_master() -> None:
    """Load box_type -> weight_kg from box_master table. Mutate BOX_DIM_KG global.
    On any failure or empty table, leave hardcoded fallback in place and set
    CONFIG_LOAD_FALLBACK['box_master']=True.
    """
    global BOX_DIM_KG
    try:
        rows = execute_sql("SELECT box_type, weight_kg FROM box_master WHERE active = true")
    except Exception as e:
        print(f"box_master read failed ({e}); using hardcoded fallback", file=sys.stderr)
        CONFIG_LOAD_FALLBACK["box_master"] = True
        return

    if not rows:
        print("box_master empty; using hardcoded fallback", file=sys.stderr)
        CONFIG_LOAD_FALLBACK["box_master"] = True
        return

    loaded: dict[str, float] = {}
    for r in rows:
        bt = r.get("box_type")
        wk = r.get("weight_kg")
        if bt is None or wk is None:
            continue
        try:
            loaded[str(bt).upper().strip()] = float(wk)
        except (TypeError, ValueError):
            continue
    if loaded:
        BOX_DIM_KG = loaded
    else:
        CONFIG_LOAD_FALLBACK["box_master"] = True


def resolve_box_weight(box_type_raw: str | None) -> float | None:
    """Look up box weight, including multi-format types (EB/QB, HB/QB, EB/HB/QB).
    Multi-format types resolve to the MIN of component weights (preserves alerts
    on overpriced rows — per v1.1 design note).
    """
    if not box_type_raw:
        return None
    bt = box_type_raw.upper().strip()
    if bt in BOX_DIM_KG:
        return BOX_DIM_KG[bt]
    if "/" in bt:
        components = [c.strip() for c in bt.split("/") if c.strip()]
        weights = [BOX_DIM_KG[c] for c in components if c in BOX_DIM_KG]
        if weights:
            return min(weights)
    return None


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

    dim_kg = resolve_box_weight(row.get("box_type"))
    if dim_kg is None:
        return None  # unknown box type, can't validate

    delivery_per_box = math.ceil(dim_kg) * FEDEX_RATE_PER_KG * FUEL_SURCHARGE_MULT
    delivery_per_stem = delivery_per_box / stems_per_box
    price_ex_delivery = cost / (1 - GPM_TARGET)
    return round(price_ex_delivery + delivery_per_stem, 4)


def validate_row(row: dict) -> dict:
    """Return list of issues for one row. Empty list = clean.

    Also returns `deviation_pct_signed` (float or None) so downstream aggregators
    (vendor_deviation_summary) can compute mean/max/direction without re-running
    compute_expected_price.
    """
    issues = []
    tier = (row.get("tier") or "").upper()
    price = row.get("price") or 0
    stock = row.get("stock") or 0
    deviation_pct_signed: float | None = None

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
            # signed: negative = underpriced vs formula, positive = overpriced
            deviation_pct_signed = (price - expected) / expected * 100
            delta_pct = abs(deviation_pct_signed)
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

    return {
        "row_id": row.get("id"),
        "slug": row.get("slug"),
        "variety": row.get("variety"),
        "tier": tier,
        "vendor": row.get("vendor"),
        "price": price,
        "issues": issues,
        "deviation_pct_signed": deviation_pct_signed,
    }


# ============================================================================
# Per-vendor deviation analysis (W2-S7 polish 3)
# ============================================================================


def vendor_deviation_summary(validated_rows: list[dict]) -> dict:
    """Aggregate formula deviation by vendor.

    Input: full list of validate_row() outputs (one per inventory row, clean or not).
    Output: {vendor: {total_rows, deviations, mean_deviation_pct, max_deviation_pct,
                      stddev_deviation_pct, direction}}

    Notes:
      - `total_rows` = total rows for this vendor (incl. ones with no expected price).
      - `deviations` = rows that tripped the FORMULA_DEVIATION_THRESHOLD_PCT alert.
      - `mean_deviation_pct` is computed over rows where deviation_pct_signed is not None
        (i.e. we could actually compute an expected price). Signed.
      - `direction`:
          "underpriced" if mean < 0 and stddev <= abs(mean)
          "overpriced"  if mean > 0 and stddev <= abs(mean)
          "mixed"       if stddev > abs(mean) (high variance, no consistent direction)
          "n/a"         if no rows had a computable expected price
    """
    by_vendor: dict[str, dict] = {}
    for r in validated_rows:
        v = r.get("vendor") or "Unknown"
        bucket = by_vendor.setdefault(v, {"total_rows": 0, "deviations": 0, "_signed": []})
        bucket["total_rows"] += 1
        if any(i.startswith("formula_deviation_") for i in r.get("issues", [])):
            bucket["deviations"] += 1
        dps = r.get("deviation_pct_signed")
        if dps is not None:
            bucket["_signed"].append(dps)

    out: dict[str, dict] = {}
    for vendor, b in by_vendor.items():
        signed = b["_signed"]
        n = len(signed)
        if n == 0:
            out[vendor] = {
                "total_rows": b["total_rows"],
                "deviations": b["deviations"],
                "mean_deviation_pct": None,
                "max_deviation_pct": None,
                "stddev_deviation_pct": None,
                "direction": "n/a",
            }
            continue
        mean = sum(signed) / n
        # max by absolute value, but keep the sign for context
        max_signed = max(signed, key=lambda x: abs(x))
        variance = sum((x - mean) ** 2 for x in signed) / n
        stddev = math.sqrt(variance)
        if stddev > abs(mean):
            direction = "mixed"
        elif mean < 0:
            direction = "underpriced"
        elif mean > 0:
            direction = "overpriced"
        else:
            direction = "on_formula"
        out[vendor] = {
            "total_rows": b["total_rows"],
            "deviations": b["deviations"],
            "mean_deviation_pct": round(mean, 1),
            "max_deviation_pct": round(max_signed, 1),
            "stddev_deviation_pct": round(stddev, 1),
            "direction": direction,
        }
    # Sort by deviation count desc for stable readable output
    return dict(sorted(out.items(), key=lambda kv: kv[1]["deviations"], reverse=True))


# ============================================================================
# 16-gate classification (CAT-S2)
# ============================================================================


def _is_within_cost_window(cost_verified_at) -> bool:
    """Return True if cost_verified_at is within COST_VERIFIED_WINDOW_DAYS of today.
    Accepts ISO string or date/datetime. None / unparseable -> False (treat as stale).
    """
    if not cost_verified_at:
        return False
    today = dt.date.today()
    try:
        if isinstance(cost_verified_at, dt.date) and not isinstance(cost_verified_at, dt.datetime):
            d = cost_verified_at
        elif isinstance(cost_verified_at, dt.datetime):
            d = cost_verified_at.date()
        else:
            s = str(cost_verified_at)
            # Tolerate "YYYY-MM-DD" and "YYYY-MM-DDTHH:MM:SS..." variants
            d = dt.date.fromisoformat(s[:10])
    except (ValueError, TypeError):
        return False
    return (today - d).days <= COST_VERIFIED_WINDOW_DAYS


def _parse_date(v) -> dt.date | None:
    if not v:
        return None
    if isinstance(v, dt.date) and not isinstance(v, dt.datetime):
        return v
    if isinstance(v, dt.datetime):
        return v.date()
    try:
        return dt.date.fromisoformat(str(v)[:10])
    except (ValueError, TypeError):
        return None


def classify_row(row: dict, validate_result: dict) -> dict:
    """Compute 16-gate classification for one inventory row.

    Returns dict with: sku_id, status, failing_gates (list[str]), gate_score (int),
    vendor, tier, variety.

    `validate_result` is the corresponding output of validate_row() and lets us
    reuse deviation_pct_signed without recomputing compute_expected_price.
    """
    failing: list[str] = []
    today = dt.date.today()
    tier = (row.get("tier") or "").upper()
    price = row.get("price") or 0
    stock = row.get("stock") or 0

    # 1 price > 0
    if not price or price <= 0:
        failing.append("price_zero")

    # 2 margin_status set + not UNKNOWN
    ms = row.get("margin_status")
    if not ms or ms == "UNKNOWN":
        failing.append("margin_unknown")

    # 3 formula deviation ~ 0 (perfect_inventory_bar gate 3 is "<=$0.01" but
    # at the dollar level our threshold proxy is FORMULA_DEVIATION_THRESHOLD_PCT)
    dps = validate_result.get("deviation_pct_signed")
    if dps is not None and abs(dps) > FORMULA_DEVIATION_THRESHOLD_PCT:
        failing.append("formula_deviation")

    # 4 cost_source set
    if not row.get("cost_source"):
        failing.append("missing_cost_source")

    # 5 cost_verified_at set + within 30d
    if not _is_within_cost_window(row.get("cost_verified_at")):
        failing.append("cost_unverified")

    # 6 has_open_price_alert = false
    if row.get("has_open_price_alert") is True:
        failing.append("open_price_alert")

    # 7 box_type set AND validated weight available
    if resolve_box_weight(row.get("box_type")) is None:
        failing.append("missing_box_dims")

    # 8 units_per_box > 0 AND stems_per_bunch > 0 where applicable
    upb = row.get("units_per_box") or 0
    spb = row.get("stems_per_bunch") or 0
    unit_lower = (row.get("unit") or "").lower()
    needs_bunch = unit_lower == "bunch"
    if upb <= 0 or (needs_bunch and spb <= 0):
        failing.append("missing_units_or_bunch")

    # 9 unit set
    if not row.get("unit"):
        failing.append("missing_unit")

    # 10 images >= 1
    imgs = row.get("images")
    if imgs is None or (isinstance(imgs, list) and len(imgs) == 0):
        failing.append("missing_image")

    # 11 contents_description set (mirror schema uses `contents_note`)
    if not row.get("contents_note"):
        failing.append("missing_contents_description")

    # 12 tier-appropriate lead time
    arrival = _parse_date(row.get("arrival_date"))
    if tier in ("T2", "T3") and arrival is None:
        failing.append("missing_arrival_date")
    if tier == "T2" and arrival is not None and stock <= 0:
        if (arrival - today).days < 5:
            failing.append("t2_outside_5d_window")
    if tier == "T3" and arrival is not None and stock <= 0:
        if (arrival - today).days < 14:
            failing.append("t3_outside_14d_window")

    # 13 vendor name set
    if not row.get("vendor"):
        failing.append("missing_vendor_name")

    # Gates 14 (last_harvested_date), 15 (vase_life_days), 16 (description-of-contents)
    # are intentionally NOT evaluated: mirror schema lacks the columns. Per spec:
    # do not fake-pass. When Rose adds the columns, append gate evaluations above.

    # Extra signal (not in the 16 but flagged for Facu): stock>0 + live=false
    if stock > 0 and row.get("live") is False:
        failing.append("stock_live_mismatch")

    # gate_score: count of evaluated gates that PASSED.
    failing_evaluated = [g for g in failing if g in EVALUATED_GATE_IDS]
    gate_score = max(0, min(16, len(EVALUATED_GATE_IDS) - len(failing_evaluated)))

    # Status routing
    has_data_fix = any(g in DATA_FIX_GATES for g in failing)
    has_facu = any(g in FACU_REVIEW_GATES for g in failing)
    if not failing_evaluated and not has_facu:
        status = "publishable"
    elif has_data_fix:
        status = "needs_data_fix"   # prioritized — Rose can resolve without Facu
    elif has_facu:
        status = "needs_facu_review"
    else:
        # Failing gates exist but none routed -- conservative fallback
        status = "needs_data_fix"

    return {
        "sku_id": row.get("id"),
        "status": status,
        "failing_gates": failing,
        "gate_score": gate_score,
        "vendor": row.get("vendor"),
        "tier": tier or None,
        "variety": row.get("variety"),
    }


def _supabase_upsert(table: str, rows: list[dict], on_conflict: str) -> int:
    """POST rows to /rest/v1/<table> with merge-duplicates resolution. Returns count."""
    if not rows:
        return 0
    url = (
        os.environ["SUPABASE_URL"].rstrip("/")
        + f"/rest/v1/{table}?on_conflict={on_conflict}"
    )
    key = os.environ["SUPABASE_SERVICE_KEY"]
    req = urllib.request.Request(
        url,
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=minimal",
        },
        data=json.dumps(rows).encode("utf-8"),
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            resp.read()
    except urllib.error.HTTPError as e:
        try:
            body = e.read().decode("utf-8")[:600]
        except Exception:
            body = ""
        raise RuntimeError(f"supabase upsert {table} {e.code}: {body}") from e
    return len(rows)


def upsert_classifications(classifications: list[dict], batch_size: int = 200) -> int:
    """UPSERT classifications into catalog_classifications via PostgREST.

    Preserves reviewer_* columns automatically (we never send those keys -> they
    fall back to existing values on update). For last_changed_at: we first SELECT
    existing (sku_id, status, last_changed_at), then for each payload row decide
    whether to bump last_changed_at to now() (status changed or new row) or carry
    the prior value (status unchanged).

    Why not a data-modifying CTE through the execute_sql RPC? Postgres forbids
    data-modifying statements inside the RPC's `SELECT row_to_json(t) FROM (...) t`
    wrapper. PostgREST native upsert sidesteps that.

    Returns count of rows written.
    """
    if not classifications:
        return 0

    # 1) Fetch existing rows so we can compute last_changed_at correctly.
    #    Use the RPC (which IS SELECT-friendly) to avoid REST pagination caps.
    existing_rows = execute_sql(
        "SELECT sku_id, status, last_changed_at FROM catalog_classifications"
    )
    existing: dict[int, dict] = {}
    for r in existing_rows or []:
        sid = r.get("sku_id")
        if sid is None:
            continue
        existing[int(sid)] = {
            "status": r.get("status"),
            "last_changed_at": r.get("last_changed_at"),
        }

    now_iso = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")

    payload: list[dict] = []
    for c in classifications:
        sku = c.get("sku_id")
        if sku is None:
            continue
        sku_int = int(sku)
        prior = existing.get(sku_int)
        if prior is None:
            last_changed = now_iso  # new row
        elif prior["status"] != c["status"]:
            last_changed = now_iso  # status flipped
        else:
            # status unchanged -> preserve prior last_changed_at
            last_changed = prior["last_changed_at"] or now_iso
        payload.append({
            "sku_id": sku_int,
            "status": c["status"],
            "failing_gates": c["failing_gates"],
            "gate_score": int(c["gate_score"]),
            "vendor": c.get("vendor"),
            "tier": c.get("tier"),
            "variety": c.get("variety"),
            "last_validated_at": now_iso,
            "last_changed_at": last_changed,
        })

    # 2) Upsert in batches via PostgREST.
    written = 0
    for i in range(0, len(payload), batch_size):
        batch = payload[i:i + batch_size]
        written += _supabase_upsert("catalog_classifications", batch, on_conflict="sku_id")
    return written


def summarize_classifications(classifications: list[dict]) -> dict:
    """Build classifications_summary: global, per-vendor, per (vendor, tier)."""
    statuses = ("publishable", "needs_data_fix", "needs_facu_review")
    global_counts = {s: 0 for s in statuses}
    by_vendor: dict[str, dict] = {}
    by_vendor_tier: dict[str, dict] = {}

    for c in classifications:
        s = c["status"]
        if s not in global_counts:
            # admin overrides etc -- include but don't crash
            global_counts.setdefault(s, 0)
        global_counts[s] = global_counts.get(s, 0) + 1

        v = c.get("vendor") or "Unknown"
        vbucket = by_vendor.setdefault(v, {st: 0 for st in statuses})
        vbucket.setdefault(s, 0)
        vbucket[s] = vbucket.get(s, 0) + 1

        t = c.get("tier") or "Unknown"
        key = f"{v} | {t}"
        vt = by_vendor_tier.setdefault(key, {st: 0 for st in statuses})
        vt.setdefault(s, 0)
        vt[s] = vt.get(s, 0) + 1

    # totals + publishable %
    def _with_total(d: dict[str, dict]) -> dict[str, dict]:
        out = {}
        for k, v in d.items():
            total = sum(v.values())
            pub = v.get("publishable", 0)
            out[k] = {
                **v,
                "total": total,
                "publishable_pct": round(pub / total * 100, 1) if total else 0.0,
            }
        return out

    total = sum(global_counts.values())
    pub = global_counts.get("publishable", 0)
    return {
        "global": {
            **global_counts,
            "total": total,
            "publishable_pct": round(pub / total * 100, 1) if total else 0.0,
        },
        "by_vendor": _with_total(by_vendor),
        "by_vendor_tier": _with_total(by_vendor_tier),
    }


# ============================================================================
# Aggregate + report
# ============================================================================


def run_validation() -> dict:
    """Pull all inventory + validate every row. Return summary dict.

    INVENTORY_TABLE env var defaults to 'floropolis_inventory' (prod).
    Set to 'floropolis_inventory_mirror' when running against supabase-backup.
    """
    # Load live config from DB (with fallback to hardcoded constants)
    load_pricing_constants()
    load_box_master()

    table = os.environ.get("INVENTORY_TABLE", "floropolis_inventory")
    # whitelist to prevent injection -- only known table names allowed
    if table not in ("floropolis_inventory", "floropolis_inventory_mirror"):
        raise ValueError(f"INVENTORY_TABLE must be floropolis_inventory or floropolis_inventory_mirror, got {table!r}")
    rows = execute_sql(
        "SELECT id, slug, name, variety, color, vendor, tier, price, stock, "
        "farm_cost, cost_source, cost_verified_at, margin_status, "
        "has_open_price_alert, arrival_date, live, active, box_type, "
        "units_per_box, total_stems, stems_per_bunch, unit, contents_note, "
        f"images FROM {table} ORDER BY id"
    )

    issue_counts: dict[str, int] = {}
    issue_examples: dict[str, list] = {}
    rows_with_issues = []
    all_results: list[dict] = []
    classifications: list[dict] = []
    rows_clean = 0

    for row in rows:
        result = validate_row(row)
        all_results.append(result)
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
        # 16-gate classification (CAT-S2)
        classifications.append(classify_row(row, result))

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

    vendor_dev = vendor_deviation_summary(all_results)

    # Upsert classifications into catalog_classifications (CAT-S2)
    classification_summary = summarize_classifications(classifications)
    rows_written = 0
    upsert_error: str | None = None
    try:
        rows_written = upsert_classifications(classifications)
    except Exception as e:  # noqa: BLE001
        upsert_error = f"{type(e).__name__}: {e}"
        print(f"catalog_classifications upsert failed: {upsert_error}", file=sys.stderr)

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
        "vendor_deviation_analysis": vendor_dev,
        "classifications_summary": classification_summary,
        "classifications_written": rows_written,
        "classifications_upsert_error": upsert_error,
        "config_load_fallback": dict(CONFIG_LOAD_FALLBACK),
        "pricing_constants_used": {
            "gpm_target": GPM_TARGET,
            "fedex_rate_per_kg": FEDEX_RATE_PER_KG,
            "fuel_surcharge_mult": FUEL_SURCHARGE_MULT,
        },
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

    # Per-vendor formula deviation breakdown -- only when formula_deviation is a critical breach
    vendor_dev_html = ""
    formula_breach = any(b["issue"] == "formula_deviation" for b in breaches)
    vendor_dev = summary.get("vendor_deviation_analysis") or {}
    if formula_breach and vendor_dev:
        vendor_dev_rows = "".join(
            f'<tr><td style="padding:6px 8px">{vendor}</td>'
            f'<td style="padding:6px 8px;text-align:right">{stats["total_rows"]}</td>'
            f'<td style="padding:6px 8px;text-align:right"><b>{stats["deviations"]}</b></td>'
            f'<td style="padding:6px 8px;text-align:right">{stats["mean_deviation_pct"]}%</td>'
            f'<td style="padding:6px 8px;text-align:right">{stats["max_deviation_pct"]}%</td>'
            f'<td style="padding:6px 8px">{stats["direction"]}</td></tr>'
            for vendor, stats in vendor_dev.items()
        )
        vendor_dev_html = (
            '<h4 style="margin:18px 0 4px 0">formula_deviation by vendor</h4>'
            '<table style="width:100%;border-collapse:collapse;font-size:12px;margin:6px 0">'
            '<thead><tr style="background:#fef2f2">'
            '<th style="padding:6px 8px;text-align:left">Vendor</th>'
            '<th style="padding:6px 8px;text-align:right">Total</th>'
            '<th style="padding:6px 8px;text-align:right">Deviations</th>'
            '<th style="padding:6px 8px;text-align:right">Mean dev</th>'
            '<th style="padding:6px 8px;text-align:right">Max dev</th>'
            '<th style="padding:6px 8px;text-align:left">Direction</th>'
            f'</tr></thead><tbody>{vendor_dev_rows}</tbody></table>'
        )

    html = f"""<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:680px;margin:0 auto;padding:24px">
<h2 style="color:#dc2626;margin:0">Inventory Validation -- {len(breaches)} alert(s)</h2>
<p style="font-size:13px;color:#475569">{summary["date"]} . {summary["total_rows"]} rows audited . {summary["rows_with_issues"]} have at least one issue ({round(summary["rows_with_issues"]/summary["total_rows"]*100,1)}%)</p>
<table style="width:100%;border-collapse:collapse;font-size:13px;margin:12px 0">
<thead><tr style="background:#fef2f2"><th style="padding:8px;text-align:left">Issue</th><th style="padding:8px;text-align:right">Actual</th><th style="padding:8px;text-align:right;color:#94a3b8">Threshold</th><th style="padding:8px;text-align:right">Count</th></tr></thead>
<tbody>{breach_rows}</tbody>
</table>
{examples_html}
{vendor_dev_html}
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
        "vendor_deviation_analysis": summary["vendor_deviation_analysis"],
        "classifications_summary": summary["classifications_summary"],
        "classifications_written": summary["classifications_written"],
        "classifications_upsert_error": summary["classifications_upsert_error"],
        "config_load_fallback": summary["config_load_fallback"],
        "pricing_constants_used": summary["pricing_constants_used"],
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
