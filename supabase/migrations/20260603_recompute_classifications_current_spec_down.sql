-- =============================================================================
-- DOWN migration for 20260603_recompute_classifications_current_spec.sql
-- v1 | 2026-06-03 | DRAFTED by Job_PM (CPO) — EXECUTED by Job_PM
-- Target: supabase BACKUP (ibckhcjvyxzrhvdiazbx) ONLY.
--
-- Restores catalog_classifications to its EXACT pre-recompute state (bigint
-- sku_id keyed to floropolis_inventory_mirror.id, deprecated 25-gate
-- failing_gates) from the preserved snapshot
-- catalog_classifications_pre_recompute_20260603.
--
-- PRECONDITION: catalog_classifications_pre_recompute_20260603 must still exist
-- (created by the up-migration). If it has been dropped, this down-migration
-- cannot run — abort and recover from a DB backup instead.
--
-- This recreates the table via CREATE TABLE AS, then restores the original
-- constraints, indexes, RLS policies, and comments verbatim from the original
-- 20260518_catalog_classifications.sql + later in-place evolutions (status
-- check already allowing blocked/publishable/perfect; quality_family_id +
-- availability_window_override_id columns; gate_score 0-16 check). The preserved
-- snapshot carries those two extra columns, so CREATE TABLE AS reproduces them.
-- =============================================================================

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'catalog_classifications_pre_recompute_20260603'
  ) THEN
    RAISE EXCEPTION
      'Cannot roll back: snapshot catalog_classifications_pre_recompute_20260603 is missing. Recover from a DB backup instead.';
  END IF;
END $$;

-- Drop the recomputed (uuid-keyed) table.
DROP TABLE IF EXISTS catalog_classifications;

-- Recreate from the verbatim snapshot (restores bigint sku_id + all original
-- columns + the deprecated failing_gates data exactly as captured).
CREATE TABLE catalog_classifications
  AS TABLE catalog_classifications_pre_recompute_20260603;

-- ---------------------------------------------------------------------------
-- Restore constraints (as they existed pre-recompute).
-- ---------------------------------------------------------------------------
ALTER TABLE catalog_classifications
  ALTER COLUMN sku_id            SET NOT NULL,
  ALTER COLUMN status            SET NOT NULL,
  ALTER COLUMN failing_gates     SET NOT NULL,
  ALTER COLUMN failing_gates     SET DEFAULT '[]'::jsonb,
  ALTER COLUMN gate_score        SET NOT NULL,
  ALTER COLUMN gate_score        SET DEFAULT 0,
  ALTER COLUMN last_validated_at SET NOT NULL,
  ALTER COLUMN last_validated_at SET DEFAULT now(),
  ALTER COLUMN last_changed_at   SET NOT NULL,
  ALTER COLUMN last_changed_at   SET DEFAULT now(),
  ALTER COLUMN created_at        SET NOT NULL,
  ALTER COLUMN created_at        SET DEFAULT now();

ALTER TABLE catalog_classifications
  ADD CONSTRAINT catalog_classifications_pkey PRIMARY KEY (sku_id);

ALTER TABLE catalog_classifications
  ADD CONSTRAINT catalog_classifications_status_check
    CHECK (status IN ('blocked','publishable','perfect',
                      'admin_overridden_publish','admin_overridden_hide'));

ALTER TABLE catalog_classifications
  ADD CONSTRAINT catalog_classifications_gate_score_check
    CHECK (gate_score >= 0 AND gate_score <= 16);

ALTER TABLE catalog_classifications
  ADD CONSTRAINT catalog_classifications_reviewer_action_check
    CHECK (reviewer_action IN ('approve_publish','reject_hide','forward_to_rose','awaiting'));

-- FKs that existed pre-recompute on the extra columns.
ALTER TABLE catalog_classifications
  ADD CONSTRAINT catalog_classifications_quality_family_id_fkey
    FOREIGN KEY (quality_family_id) REFERENCES quality_families(id);

ALTER TABLE catalog_classifications
  ADD CONSTRAINT catalog_classifications_availability_window_override_id_fkey
    FOREIGN KEY (availability_window_override_id) REFERENCES catalog_availability_windows(id);

-- ---------------------------------------------------------------------------
-- Restore indexes.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_catalog_classifications_status
  ON catalog_classifications(status);
CREATE INDEX IF NOT EXISTS idx_catalog_classifications_vendor_tier
  ON catalog_classifications(vendor, tier);
CREATE INDEX IF NOT EXISTS idx_catalog_classifications_reviewer_action
  ON catalog_classifications(reviewer_action) WHERE reviewer_action = 'awaiting';

-- ---------------------------------------------------------------------------
-- Restore RLS + policies.
-- ---------------------------------------------------------------------------
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
  'Per-SKU publishability classification (restored to pre-2026-06-03 state). sku_id is bigint (logical ref to floropolis_inventory_mirror.id; no FK because mirror truncates daily).';

-- Drop the snapshot now that the original is restored.
DROP TABLE catalog_classifications_pre_recompute_20260603;

COMMIT;

-- =============================================================================
-- VERIFICATION (run after down-migration):
--   SELECT pg_typeof(sku_id), count(*) FROM catalog_classifications GROUP BY 1;
--     -- expect: bigint, 1000
--   SELECT g, count(*) FROM catalog_classifications cc,
--        LATERAL jsonb_array_elements_text(cc.failing_gates) g
--   WHERE g IN ('cost_unverified','open_price_alert','stock_live_mismatch')
--   GROUP BY g;
--     -- expect the deprecated gates to be present again (627 / 299 / 276)
-- =============================================================================
