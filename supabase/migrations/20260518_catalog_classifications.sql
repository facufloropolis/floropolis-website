-- =============================================================================
-- Catalog Classifications Migration
-- v1 | 2026-05-18 | Job_PM [V8 SHADOW] (CAT-S1)
-- Project: inventory_revamp / perfect_inventory_bar (Subagent A pipeline)
-- Target: supabase-backup (ibckhcjvyxzrhvdiazbx) - NOT production
--
-- Creates per-SKU publishability classification table. Subagent A validator
-- writes one row per SKU after evaluating the 16 hard gates from
-- kb/projects/perfect_inventory_bar.md. Consumed by:
--   - /admin/catalog UI (X1 catalog list, X2 SKU detail, X8 proposals queue)
--   - /shop catalog filter (only status='publishable' or 'admin_overridden_publish')
--   - Layer 3 exit gate rollup (% publishable by vendor x tier)
--
-- Design decisions:
--   1. sku_id is plain bigint (NO foreign key) because floropolis_inventory_mirror
--      truncates + reloads daily. Mirrors order_lines.sku_id pattern from D1.
--   2. failing_gates as jsonb array of string gate IDs (e.g. "price_zero",
--      "margin_unknown") to allow flexible gate evolution without schema changes.
--   3. vendor/tier/variety denormalized for fast rollup queries without joining
--      the mirror (which truncates daily and may temporarily be empty mid-reload).
--   4. last_changed_at separate from last_validated_at: every validator run
--      bumps last_validated_at, but last_changed_at only moves on actual status
--      flip (used for "stable for N consecutive days" Layer 3 gate).
--   5. Admin role = client_profiles.status='admin' (same convention as D1).
--   6. RLS: public read (so /shop SSR can filter), admin-only write.
--      Service-role bypasses RLS for validator writes.
--
-- Idempotent: safe to re-run.
-- =============================================================================

CREATE TABLE IF NOT EXISTS catalog_classifications (
  sku_id              bigint PRIMARY KEY,           -- references floropolis_inventory_mirror.id but no FK (mirror truncates daily)
  status              text NOT NULL CHECK (status IN (
    'publishable',
    'needs_data_fix',
    'needs_facu_review',
    'admin_overridden_publish',
    'admin_overridden_hide'
  )),
  failing_gates       jsonb NOT NULL DEFAULT '[]'::jsonb,  -- array of gate IDs that failed, e.g. ["price_zero","margin_unknown","formula_deviation"]
  gate_score          integer NOT NULL DEFAULT 0 CHECK (gate_score >= 0 AND gate_score <= 16),  -- 0-16 count of passing gates
  vendor              text,                                -- denormalized for fast rollup queries
  tier                text,                                -- denormalized for fast rollup queries
  variety             text,                                -- denormalized
  last_validated_at   timestamptz NOT NULL DEFAULT now(),
  last_changed_at     timestamptz NOT NULL DEFAULT now(),  -- when status last changed (stable-days gate)
  -- Reviewer action (Facu's approval queue moves)
  reviewer_action     text CHECK (reviewer_action IN (
    'approve_publish',
    'reject_hide',
    'forward_to_rose',
    'awaiting'
  )),
  reviewer_at         timestamptz,
  reviewer_user_id    uuid,                                -- backup auth.users.id (no FK; cross-project tolerant)
  reviewer_notes      text,
  -- Internal
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_catalog_classifications_status
  ON catalog_classifications(status);
CREATE INDEX IF NOT EXISTS idx_catalog_classifications_vendor_tier
  ON catalog_classifications(vendor, tier);
CREATE INDEX IF NOT EXISTS idx_catalog_classifications_reviewer_action
  ON catalog_classifications(reviewer_action) WHERE reviewer_action = 'awaiting';

ALTER TABLE catalog_classifications ENABLE ROW LEVEL SECURITY;

-- Read: anyone (so /shop catalog filter + admin UI can query without auth gymnastics)
DROP POLICY IF EXISTS "catalog_classifications_read_all" ON catalog_classifications;
CREATE POLICY "catalog_classifications_read_all" ON catalog_classifications
  FOR SELECT USING (true);

-- Write: admin only (service-role bypasses RLS for validator writes)
DROP POLICY IF EXISTS "catalog_classifications_admin_write" ON catalog_classifications;
CREATE POLICY "catalog_classifications_admin_write" ON catalog_classifications
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM client_profiles
      WHERE user_id = auth.uid() AND status = 'admin'
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM client_profiles
      WHERE user_id = auth.uid() AND status = 'admin'
    )
  );

COMMENT ON TABLE catalog_classifications IS
  'Per-SKU publishability classification. Written by Subagent A validator, read by /admin/catalog UI + /shop catalog filter. sku_id intentionally has NO foreign key (mirror truncates daily).';
COMMENT ON COLUMN catalog_classifications.sku_id IS 'Logical reference to floropolis_inventory_mirror.id; no FK because mirror truncates daily.';
COMMENT ON COLUMN catalog_classifications.failing_gates IS 'JSONB array of gate ID strings that failed validation (e.g. ["price_zero","margin_unknown"]).';
COMMENT ON COLUMN catalog_classifications.gate_score IS '0-16 count of passing gates from perfect_inventory_bar.md.';
COMMENT ON COLUMN catalog_classifications.last_changed_at IS 'When status last flipped (NOT when last validated); used for stable-days Layer 3 exit gate.';
