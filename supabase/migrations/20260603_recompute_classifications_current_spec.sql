-- =============================================================================
-- Recompute catalog_classifications from current-spec gates (S3 follow-up)
-- v1 | 2026-06-03 | DRAFTED by Job_PM (CPO) — EXECUTED by Job_PM after Facu review
-- Project: catalog_rebuild (catalog_rebuild_project.md, slice S3 cleanup)
-- Spec authority: Job_PM/kb/projects/perfect_inventory_bar.md (LIVING v2.2)
-- Target: supabase BACKUP (ibckhcjvyxzrhvdiazbx) ONLY — never PROD.
--         Applies on branch proposal/inventory-data-validator (preview + BACKUP).
--
-- WHY ----------------------------------------------------------------------
-- catalog_classifications (1000 rows) was written by the deprecated 25-gate
-- validator and is keyed to floropolis_inventory_mirror.id (bigint). Its
-- failing_gates arrays reference gate IDs that NO LONGER EXIST in
-- catalog_quality_weights (now exactly 13 gates: 6 blocking / 2 publishable_gap
-- / 5 perfect_gap weight=0 placeholders). Stale gates still present in the data:
--   cost_unverified (627), open_price_alert (299), stock_live_mismatch (276),
--   margin_unknown (72), t3_outside_14d_window (40), missing_arrival_date (27),
--   formula_deviation (25), t2_outside_5d_window (19).
-- The admin UI displays these stale counts. This migration recomputes the table
-- from LIVE silver sources (dim_sku + canonical_cost + product_chrome +
-- box_master_mirror) using ONLY current-spec gate IDs, and RE-KEYS it from the
-- bigint mirror id to dim_sku.sku_id (uuid).
--
-- RE-KEY FINDING -----------------------------------------------------------
-- Old table PK = sku_id bigint (= floropolis_inventory_mirror.id, NO FK — mirror
-- truncated daily). New canonical spine is dim_sku.sku_id (uuid). The old bigint
-- id maps to product_chrome.fi_id for only 550 of 1000 old rows (lossy, partial).
-- The old rows carried NO reviewer judgments (0 rows with reviewer_action set,
-- all reviewer_* null), so there is nothing human-authored to migrate forward.
-- Decision: this is a clean RE-DERIVATION from silver, not a data migration —
-- we DROP & recreate keyed to dim_sku.sku_id (uuid) with a real FK, and
-- recompute every row. The verbatim old table is preserved (see below) so the
-- _down migration can restore it exactly.
--
-- GATE PREDICATES (gate_id -> SQL predicate; grounded against live schema) ---
-- BLOCKING (6, evaluated=true in catalog_quality_weights):
--   price_zero          : NOT (any facu_approved canonical_cost.farm_cost > 0)
--   missing_cost_source : NOT (any facu_approved canonical_cost.source_id IS NOT NULL)
--   missing_vendor_name : dim_sku.vendor_canonical_name IS NULL OR ''
--   missing_unit        : dim_sku.selling_unit IS NULL OR ''
--   missing_box_dims    : no box_master_mirror row matching (vendor_canonical_name
--                         AND (legacy_box_type=box_type OR box_family=box_type), case-insensitive)
--   missing_image       : no product_chrome row with images jsonb length >= 1
-- PUBLISHABLE_GAP (2, evaluated=true, do NOT block — recorded in failing_gates):
--   missing_contents_description : no product_chrome.description non-empty
--   missing_units_or_bunch       : dim_sku.pack IS NULL AND dim_sku.stems_per_unit IS NULL
-- PERFECT_GAP (5, weight=0, evaluated=false): NOT evaluated here (no data signal
--   shipped yet) — never written to failing_gates. (customer_feedback_rating,
--   demand_general, demand_traffic, exclusivity, price_competitiveness.)
--
-- Predicates mirror the S3 view v_sku_publishability exactly, EXCEPT image +
-- contents_description, which the S3 view stubbed as pending (pending_image_gate,
-- pending_contents_description_gate) before product_chrome (S2) existed. S2 has
-- since shipped, so this migration wires the real product_chrome predicates.
--
-- STATUS RULE --------------------------------------------------------------
--   status = 'blocked'     if ANY blocking gate fails
--          = 'publishable' otherwise
-- Per spec, PERFECT is a score-based promotion (weighted quality_score >=
-- perfect_min_score), determined downstream — NOT set here. Every non-blocked
-- SKU lands at 'publishable'; the perfect promoter may later lift some to
-- 'perfect'. We never write 'perfect' in this recompute.
--
-- SCOPE: active SKUs = dim_sku WHERE quarantined=false (879 rows at draft time;
--   dim_sku has no `active` column — `quarantined=false` is the active filter
--   used by both S3/S4 views). Multi-cost SKUs (3 exist with >1 facu_approved
--   canonical_cost) are aggregated to ONE row per sku_id via bool_or, so output
--   is exactly one row per active dim_sku (avoids the view's duplicate-row
--   artifact: v_sku_publishability returns 880 because of the join fan-out).
--
-- Idempotent: safe to re-run (preserve-copy guarded by IF NOT EXISTS).
-- Touches ONLY catalog_classifications (+ the one preserve table). No other
-- table, view, or policy is altered.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- STEP 1 — PRESERVE the old table verbatim (for rollback). Snapshot, no DDL on
--          the original yet. IF NOT EXISTS so a re-run does not clobber the
--          first (true pre-recompute) snapshot.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS catalog_classifications_pre_recompute_20260603
  AS TABLE catalog_classifications;

COMMENT ON TABLE catalog_classifications_pre_recompute_20260603 IS
  'Verbatim snapshot of catalog_classifications BEFORE the 2026-06-03 current-spec recompute + re-key (bigint mirror id -> dim_sku.sku_id uuid). 1000 rows, deprecated 25-gate failing_gates. Restore source for 20260603_recompute_classifications_current_spec_down.sql. Do not drop until the recompute is Facu-approved + verified.';

-- ---------------------------------------------------------------------------
-- STEP 2 — DROP & recreate keyed to dim_sku.sku_id (uuid). Clean re-derivation;
--          no human-authored rows to carry (old reviewer_* all null). FK to
--          dim_sku enforces that every classification references a real SKU.
-- ---------------------------------------------------------------------------
DROP TABLE catalog_classifications;

CREATE TABLE catalog_classifications (
  sku_id              uuid PRIMARY KEY
                        REFERENCES dim_sku(sku_id) ON DELETE CASCADE,
  status              text NOT NULL CHECK (status IN (
                        'blocked',
                        'publishable',
                        'perfect',                 -- reserved; set by score-based promoter, not here
                        'admin_overridden_publish',
                        'admin_overridden_hide'
                      )),
  failing_gates       jsonb NOT NULL DEFAULT '[]'::jsonb,  -- current-spec gate IDs only
  blocking_gate_count integer NOT NULL DEFAULT 0,          -- # of failing BLOCKING gates (replaces deprecated 0-16 gate_score)
  vendor              text,
  tier                text,
  variety             text,
  last_validated_at   timestamptz NOT NULL DEFAULT now(),
  last_changed_at     timestamptz NOT NULL DEFAULT now(),
  -- Reviewer override surface (preserved from prior schema; recompute resets to null)
  reviewer_action     text CHECK (reviewer_action IN (
                        'approve_publish','reject_hide','forward_to_rose','awaiting')),
  reviewer_at         timestamptz,
  reviewer_user_id    uuid,
  reviewer_notes      text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_catalog_classifications_status
  ON catalog_classifications(status);
CREATE INDEX idx_catalog_classifications_vendor_tier
  ON catalog_classifications(vendor, tier);
CREATE INDEX idx_catalog_classifications_reviewer_action
  ON catalog_classifications(reviewer_action) WHERE reviewer_action = 'awaiting';

ALTER TABLE catalog_classifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "catalog_classifications_read_all" ON catalog_classifications;
CREATE POLICY "catalog_classifications_read_all" ON catalog_classifications
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "catalog_classifications_admin_write" ON catalog_classifications;
CREATE POLICY "catalog_classifications_admin_write" ON catalog_classifications
  FOR ALL USING (
    EXISTS (SELECT 1 FROM client_profiles WHERE user_id = auth.uid() AND status = 'admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM client_profiles WHERE user_id = auth.uid() AND status = 'admin')
  );

COMMENT ON TABLE catalog_classifications IS
  'Per-SKU publishability classification, RE-KEYED to dim_sku.sku_id (uuid) and recomputed from current-spec gates 2026-06-03. failing_gates contains ONLY gate_ids present in catalog_quality_weights. Blocked = any blocking gate fails; publishable otherwise; perfect set downstream by score-based promoter.';
COMMENT ON COLUMN catalog_classifications.failing_gates IS
  'JSONB array of current-spec gate_id strings that fail (blocking + publishable_gap). Must be a subset of catalog_quality_weights.gate_id.';
COMMENT ON COLUMN catalog_classifications.blocking_gate_count IS
  'Count of failing BLOCKING gates. >0 implies status=blocked. Replaces the deprecated 0-16 gate_score.';

-- ---------------------------------------------------------------------------
-- STEP 3 — RECOMPUTE one row per active dim_sku from live silver.
-- ---------------------------------------------------------------------------
WITH cost AS (
  -- aggregate across all facu_approved cost rows per SKU (3 SKUs have >1)
  SELECT sku_id,
         bool_or(farm_cost IS NOT NULL AND farm_cost > 0) AS has_price,
         bool_or(source_id IS NOT NULL)                   AS has_cost_source
  FROM canonical_cost
  WHERE facu_approved = true
  GROUP BY sku_id
),
gates AS (
  SELECT
    d.sku_id,
    d.vendor_canonical_name AS vendor,
    d.tier,
    d.variety_normalized    AS variety,
    -- blocking gates
    (NOT COALESCE(c.has_price, false))                                          AS fail_price_zero,
    (NOT COALESCE(c.has_cost_source, false))                                    AS fail_missing_cost_source,
    (d.vendor_canonical_name IS NULL OR btrim(d.vendor_canonical_name) = '')    AS fail_missing_vendor_name,
    (d.selling_unit IS NULL OR btrim(d.selling_unit) = '')                      AS fail_missing_unit,
    (NOT EXISTS (
        SELECT 1 FROM box_master_mirror b
        WHERE b.vendor_canonical_name = d.vendor_canonical_name
          AND ( lower(b.legacy_box_type) = lower(d.box_type)
             OR lower(b.box_family)      = lower(d.box_type) )
    ))                                                                          AS fail_missing_box_dims,
    (NOT EXISTS (
        SELECT 1 FROM product_chrome pc
        WHERE pc.sku_id = d.sku_id
          AND pc.images IS NOT NULL
          AND jsonb_array_length(pc.images) > 0
    ))                                                                          AS fail_missing_image,
    -- publishable_gap gates (recorded, do NOT block)
    (NOT EXISTS (
        SELECT 1 FROM product_chrome pc
        WHERE pc.sku_id = d.sku_id
          AND pc.description IS NOT NULL
          AND btrim(pc.description) <> ''
    ))                                                                          AS fail_missing_contents_description,
    (d.pack IS NULL AND d.stems_per_unit IS NULL)                               AS fail_missing_units_or_bunch
  FROM dim_sku d
  LEFT JOIN cost c ON c.sku_id = d.sku_id
  WHERE d.quarantined = false
),
scored AS (
  SELECT
    g.sku_id, g.vendor, g.tier, g.variety,
    -- assemble failing_gates array from booleans, current-spec ids only
    ( ARRAY[]::text[]
      || CASE WHEN fail_price_zero                   THEN ARRAY['price_zero']                   ELSE ARRAY[]::text[] END
      || CASE WHEN fail_missing_cost_source          THEN ARRAY['missing_cost_source']          ELSE ARRAY[]::text[] END
      || CASE WHEN fail_missing_vendor_name          THEN ARRAY['missing_vendor_name']          ELSE ARRAY[]::text[] END
      || CASE WHEN fail_missing_unit                 THEN ARRAY['missing_unit']                 ELSE ARRAY[]::text[] END
      || CASE WHEN fail_missing_box_dims             THEN ARRAY['missing_box_dims']             ELSE ARRAY[]::text[] END
      || CASE WHEN fail_missing_image                THEN ARRAY['missing_image']                ELSE ARRAY[]::text[] END
      || CASE WHEN fail_missing_contents_description  THEN ARRAY['missing_contents_description'] ELSE ARRAY[]::text[] END
      || CASE WHEN fail_missing_units_or_bunch        THEN ARRAY['missing_units_or_bunch']       ELSE ARRAY[]::text[] END
    ) AS failing_gates_arr,
    ( (fail_price_zero)::int + (fail_missing_cost_source)::int
      + (fail_missing_vendor_name)::int + (fail_missing_unit)::int
      + (fail_missing_box_dims)::int + (fail_missing_image)::int ) AS blocking_gate_count
  FROM gates g
)
INSERT INTO catalog_classifications
  (sku_id, status, failing_gates, blocking_gate_count, vendor, tier, variety,
   last_validated_at, last_changed_at, created_at)
SELECT
  s.sku_id,
  CASE WHEN s.blocking_gate_count > 0 THEN 'blocked' ELSE 'publishable' END,
  to_jsonb(s.failing_gates_arr),
  s.blocking_gate_count,
  s.vendor, s.tier, s.variety,
  now(), now(), now()
FROM scored s;

COMMIT;

-- =============================================================================
-- VERIFICATION BLOCK — run these AFTER the migration. Each must hold for PASS.
-- (Run read-only; not part of the transaction.)
-- =============================================================================
--
-- V1. ZERO deprecated gate_ids remain. failing_gates must be a strict subset of
--     catalog_quality_weights.gate_id. Expected: 0 rows.
--   SELECT DISTINCT g AS orphan_gate_id
--   FROM catalog_classifications cc,
--        LATERAL jsonb_array_elements_text(cc.failing_gates) g
--   WHERE g NOT IN (SELECT gate_id FROM catalog_quality_weights);
--   -- Explicit deprecated-gate sweep (expected count 0 for each):
--   SELECT g, count(*) FROM catalog_classifications cc,
--        LATERAL jsonb_array_elements_text(cc.failing_gates) g
--   WHERE g IN ('cost_unverified','open_price_alert','stock_live_mismatch',
--               'margin_unknown','formula_deviation','t2_outside_5d_window',
--               't3_outside_14d_window','missing_arrival_date','lead_time')
--   GROUP BY g;
--
-- V2. Only EVALUATED gates may appear (no perfect_gap weight=0 placeholders).
--     Expected: 0 rows.
--   SELECT DISTINCT g
--   FROM catalog_classifications cc,
--        LATERAL jsonb_array_elements_text(cc.failing_gates) g
--   WHERE g IN (SELECT gate_id FROM catalog_quality_weights WHERE evaluated = false);
--
-- V3. Row count == active dim_sku count, exactly one row per SKU.
--     Expected: classifications_rows = active_dim_sku = 879 (at draft), dupes = 0.
--   SELECT
--     (SELECT count(*) FROM catalog_classifications)                       AS classifications_rows,
--     (SELECT count(*) FROM dim_sku WHERE quarantined = false)             AS active_dim_sku,
--     (SELECT count(*) FROM (SELECT sku_id FROM catalog_classifications
--                            GROUP BY sku_id HAVING count(*)>1) x)          AS duplicate_sku_ids;
--
-- V4. status consistency: blocked IFF blocking_gate_count>0; no 'perfect' written.
--     Expected: mismatch=0, perfect_rows=0.
--   SELECT
--     count(*) FILTER (WHERE (status='blocked') <> (blocking_gate_count>0)) AS mismatch,
--     count(*) FILTER (WHERE status='perfect')                             AS perfect_rows
--   FROM catalog_classifications;
--
-- V5. Per-gate counts match the live S3 view truth (independent source).
--     For the 5 box/price/cost/vendor/unit gates the view exposes fail_* flags;
--     image is recomputed here from product_chrome (view stubbed it). Compare:
--   SELECT
--     (SELECT count(*) FROM catalog_classifications cc
--        WHERE cc.failing_gates ? 'missing_box_dims')                       AS cls_box,
--     (SELECT count(*) FROM v_sku_publishability WHERE fail_missing_box_dims) AS view_box,
--     (SELECT count(*) FROM catalog_classifications cc
--        WHERE cc.failing_gates ? 'price_zero')                            AS cls_price,
--     (SELECT count(*) FROM v_sku_publishability WHERE fail_price_zero)     AS view_price,
--     (SELECT count(*) FROM catalog_classifications cc
--        WHERE cc.failing_gates ? 'missing_cost_source')                   AS cls_cost,
--     (SELECT count(*) FROM v_sku_publishability WHERE fail_missing_cost_source) AS view_cost,
--     (SELECT count(*) FROM catalog_classifications cc
--        WHERE cc.failing_gates ? 'missing_vendor_name')                   AS cls_vendor,
--     (SELECT count(*) FROM v_sku_publishability WHERE fail_missing_vendor) AS view_vendor,
--     (SELECT count(*) FROM catalog_classifications cc
--        WHERE cc.failing_gates ? 'missing_unit')                          AS cls_unit,
--     (SELECT count(*) FROM v_sku_publishability WHERE fail_missing_unit)   AS view_unit;
--   -- NOTE: v_sku_publishability returns 880 rows (join fan-out on 3 multi-cost
--   --       SKUs); classifications has 879 (one per SKU). Per-gate counts may
--   --       differ by at most that fan-out — investigate only if delta > 3.
--
-- V6. Image gate sanity (recomputed, not from view). Expected cls_image ==
--     active SKUs with no image in product_chrome.
--   SELECT
--     (SELECT count(*) FROM catalog_classifications cc
--        WHERE cc.failing_gates ? 'missing_image')                         AS cls_image,
--     (SELECT count(*) FROM dim_sku d WHERE d.quarantined=false
--        AND NOT EXISTS (SELECT 1 FROM product_chrome pc
--          WHERE pc.sku_id=d.sku_id AND pc.images IS NOT NULL
--            AND jsonb_array_length(pc.images)>0))                         AS silver_image;
--
-- V7. Status distribution (informational; expected at draft: blocked=332,
--     publishable=547, perfect=0). Matches catalog_published "547 shippable".
--   SELECT status, count(*) FROM catalog_classifications GROUP BY status ORDER BY 2 DESC;
--
-- V8. Preserve copy exists and is intact (1000 rows). Expected: 1000.
--   SELECT count(*) FROM catalog_classifications_pre_recompute_20260603;
-- =============================================================================
