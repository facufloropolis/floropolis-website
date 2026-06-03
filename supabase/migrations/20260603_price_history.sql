-- =============================================================================
-- price_history — daily computed-price snapshot + shift observability
-- v1 | 2026-06-03 | DRAFTED by Job_PM (CPO) — DO NOT APPLY without Facu review.
-- Project: supabase BACKUP (ibckhcjvyxzrhvdiazbx) ONLY — never PROD.
--          Applies on branch proposal/inventory-data-validator (preview + BACKUP).
--
-- WHY ----------------------------------------------------------------------
-- Floropolis sell prices are NOT stored — they are COMPUTED at generate time
-- from many silver inputs (farm_cost, gpm_target, box chargeable kg, stems per
-- box, fedex rate, fuel surcharge). A change to ANY of those inputs silently
-- shifts the customer-facing price with no record of when or why. Facu wants
-- PRICE OBSERVABILITY: a durable daily record of every published SKU's computed
-- price + the exact input vector that produced it, so any shift is detectable
-- and attributable to the input that moved.
--
-- WRITER: scripts/jobs/price_snapshot.mjs (daily, LIVE in CI). It replicates the
-- canonical price formula from scripts/generate-products.mjs EXACTLY:
--     sell = farm_cost / (1 - gpm_target) + delivery_per_stem
--     delivery_per_stem = ceil(box_chargeable_kg) * fedex_rate_per_kg
--                         * fuel_surcharge_mult / stems_per_box
-- and writes one row per published SKU per run with the inputs jsonb.
--
-- READER: the admin price-observability surface + v_price_shifts (below), which
-- diffs the latest snapshot against the immediately-previous one per SKU.
--
-- Touches ONLY: creates table price_history + view v_price_shifts. No existing
-- table/view/policy is altered. Idempotent (IF NOT EXISTS / OR REPLACE).
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- price_history — append-only snapshot rows. One row per (sku, run).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.price_history (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku_id        uuid NOT NULL REFERENCES public.dim_sku(sku_id) ON DELETE CASCADE,
  computed_price numeric NOT NULL,
  -- inputs: the exact vector that produced computed_price. Shape (written by
  -- price_snapshot.mjs):
  --   { farm_cost, gpm, box_type, box_weight_kg, stems_per_box,
  --     fedex_rate_per_kg, fuel_surcharge_mult, delivery_per_stem,
  --     price_ex_delivery, market }
  inputs        jsonb NOT NULL,
  captured_at   timestamptz NOT NULL DEFAULT now()
);

-- Primary access path: latest/previous snapshot per SKU (v_price_shifts) and
-- per-SKU price timelines on the admin surface.
CREATE INDEX IF NOT EXISTS idx_price_history_sku_captured
  ON public.price_history (sku_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_price_history_captured
  ON public.price_history (captured_at DESC);

COMMENT ON TABLE public.price_history IS
  'Daily snapshot of the COMPUTED sell price per published SKU + the exact input vector (inputs jsonb) that produced it. Written by scripts/jobs/price_snapshot.mjs. Append-only; never updated in place. Enables price-shift observability (see v_price_shifts).';
COMMENT ON COLUMN public.price_history.computed_price IS
  'Canonical formula: farm_cost/(1-gpm) + ceil(box_kg)*fedex_rate*fuel_mult/stems_per_box. Mirrors scripts/generate-products.mjs computeSellPrice exactly.';
COMMENT ON COLUMN public.price_history.inputs IS
  'JSONB input vector: farm_cost, gpm, box_type, box_weight_kg, stems_per_box, fedex_rate_per_kg, fuel_surcharge_mult, delivery_per_stem, price_ex_delivery, market. Diffed key-by-key against the previous snapshot to attribute a price shift to its cause.';

-- ---------------------------------------------------------------------------
-- v_price_shifts — latest snapshot vs the immediately-previous snapshot per
-- SKU. Surfaces old/new price, pct change, and which input keys changed
-- (derived by comparing the two inputs jsonb objects key by key).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_price_shifts AS
WITH ranked AS (
  SELECT
    ph.sku_id,
    ph.computed_price,
    ph.inputs,
    ph.captured_at,
    row_number() OVER (PARTITION BY ph.sku_id ORDER BY ph.captured_at DESC) AS rn
  FROM public.price_history ph
),
latest AS (
  SELECT sku_id, computed_price, inputs, captured_at FROM ranked WHERE rn = 1
),
previous AS (
  SELECT sku_id, computed_price, inputs, captured_at FROM ranked WHERE rn = 2
)
SELECT
  l.sku_id,
  p.computed_price                                              AS old_price,
  l.computed_price                                              AS new_price,
  (l.computed_price - p.computed_price)                         AS price_delta,
  CASE
    WHEN p.computed_price IS NULL OR p.computed_price = 0 THEN NULL
    ELSE round(((l.computed_price - p.computed_price) / p.computed_price) * 100.0, 4)
  END                                                           AS pct_change,
  p.captured_at                                                 AS prev_captured_at,
  l.captured_at                                                 AS latest_captured_at,
  -- changed_inputs: object of { key: {old, new} } for every input key whose
  -- value differs between the previous and latest snapshot (union of keys,
  -- compared as text so numeric/string changes are both caught).
  (
    SELECT COALESCE(
      jsonb_object_agg(
        k,
        jsonb_build_object('old', p.inputs -> k, 'new', l.inputs -> k)
      ),
      '{}'::jsonb
    )
    FROM (
      SELECT jsonb_object_keys(l.inputs) AS k
      UNION
      SELECT jsonb_object_keys(p.inputs) AS k
    ) keys
    WHERE (l.inputs -> k) IS DISTINCT FROM (p.inputs -> k)
  )                                                             AS changed_inputs
FROM latest l
LEFT JOIN previous p ON p.sku_id = l.sku_id;

COMMENT ON VIEW public.v_price_shifts IS
  'Per published SKU: latest computed price vs the immediately-previous snapshot, pct change, and changed_inputs (key-by-key diff of the two inputs jsonb objects: {key:{old,new}}). The price-observability read surface. SKUs with only one snapshot show old_price NULL.';

-- ---------------------------------------------------------------------------
-- RLS — read-all / admin-write (matches catalog_classifications, box_master,
-- pricing_constants, catalog_repair_state pattern).
-- ---------------------------------------------------------------------------
ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "price_history_read_all" ON public.price_history;
CREATE POLICY "price_history_read_all" ON public.price_history
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "price_history_admin_write" ON public.price_history;
CREATE POLICY "price_history_admin_write" ON public.price_history
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.client_profiles
             WHERE user_id = auth.uid() AND status = 'admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.client_profiles
             WHERE user_id = auth.uid() AND status = 'admin')
  );

COMMIT;

-- =============================================================================
-- VERIFICATION (run AFTER apply; read-only):
--   SELECT count(*) FROM price_history;                       -- grows daily
--   SELECT * FROM v_price_shifts WHERE changed_inputs <> '{}'::jsonb LIMIT 20;
--   -- shifts >2% with cause:
--   SELECT sku_id, old_price, new_price, pct_change, changed_inputs
--     FROM v_price_shifts WHERE abs(pct_change) > 2 ORDER BY abs(pct_change) DESC;
-- =============================================================================
