-- =============================================================================
-- Admin Proposals Foundation Migration
-- v1 | 2026-05-18 | Job_PM [V8 SHADOW] (admin-foundation)
-- Project: supabase-backup (ibckhcjvyxzrhvdiazbx) -- NOT production
--
-- Restrictive override model for the admin control plane:
--   1. Admin UI writes a row to admin_proposals (NEVER writes source tables directly)
--   2. Server computes warnings (cascade impact, low margin, etc) into the row
--   3. Facu reviews + approves/rejects via admin_approvals
--   4. On approve, the approval-execution registry (lib/admin/proposal-executors.ts)
--      applies the change to the actual source table AND writes a before/after
--      snapshot to override_audit
--
-- Tables created:
--   admin_proposals    -- pending proposed changes from admins
--   admin_approvals    -- Facu's approve/reject decisions
--   override_audit     -- before/after snapshot of every applied change
--   shipping_config_v2 -- new shipping-cost config table (replaces legacy hardcoded zones)
--   quality_families   -- canonical quality buckets (e.g. ROSE-PREMIUM-60CM)
--
-- Columns added:
--   floropolis_inventory_mirror.quality_family_id  (nullable, FK -> quality_families.id)
--   catalog_classifications.quality_family_id      (nullable, FK -> quality_families.id)
--
-- RLS policy convention:
--   - SELECT: authenticated user can read own proposals (proposed_by = auth.uid()).
--   - INSERT: authenticated user can propose, but ONLY for themselves (proposed_by = auth.uid()).
--   - UPDATE/DELETE: admins only (client_profiles.status='admin').
--   - Service role bypasses RLS for server-side executors + Facu approval flow.
--
-- Idempotent: safe to re-run.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. quality_families (referenced by mirror + classifications below)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS quality_families (
  id          text PRIMARY KEY,                       -- e.g. "ROSE-PREMIUM-60CM"
  name        text NOT NULL,
  category    text NOT NULL,                          -- e.g. "rose", "hydrangea"
  attributes  jsonb NOT NULL DEFAULT '{}'::jsonb,     -- {stem_length_cm, head_size, color_group, ...}
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quality_families_category
  ON quality_families(category);

ALTER TABLE quality_families ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "quality_families_read_all" ON quality_families;
CREATE POLICY "quality_families_read_all" ON quality_families
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "quality_families_admin_write" ON quality_families;
CREATE POLICY "quality_families_admin_write" ON quality_families
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

COMMENT ON TABLE quality_families IS
  'Canonical quality buckets used by inventory mirror + catalog_classifications. Plain-text id (e.g. ROSE-PREMIUM-60CM) so it stays human-readable in joins.';

-- -----------------------------------------------------------------------------
-- 2. admin_proposals (proposed changes awaiting Facu)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_proposals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type          text NOT NULL,                         -- e.g. "box_master.update", "shipping_config.create"
  target_table  text NOT NULL,                         -- e.g. "box_master"
  target_id     text,                                  -- e.g. row id of the target; null for create-type proposals
  payload       jsonb NOT NULL DEFAULT '{}'::jsonb,    -- the proposed change body
  warnings      jsonb NOT NULL DEFAULT '[]'::jsonb,    -- [{code, severity, detail}, ...]
  status        text NOT NULL DEFAULT 'awaiting_facu'
    CHECK (status IN ('awaiting_facu', 'approved', 'rejected', 'withdrawn')),
  proposed_by   uuid REFERENCES auth.users(id),
  proposed_at   timestamptz NOT NULL DEFAULT now(),
  notes         text
);

CREATE INDEX IF NOT EXISTS idx_admin_proposals_status
  ON admin_proposals(status);
CREATE INDEX IF NOT EXISTS idx_admin_proposals_type
  ON admin_proposals(type);
CREATE INDEX IF NOT EXISTS idx_admin_proposals_target_table
  ON admin_proposals(target_table);
CREATE INDEX IF NOT EXISTS idx_admin_proposals_proposed_by
  ON admin_proposals(proposed_by);

ALTER TABLE admin_proposals ENABLE ROW LEVEL SECURITY;

-- SELECT: own proposals OR admin sees all
DROP POLICY IF EXISTS "admin_proposals_read_own_or_admin" ON admin_proposals;
CREATE POLICY "admin_proposals_read_own_or_admin" ON admin_proposals
  FOR SELECT USING (
    proposed_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM client_profiles
      WHERE user_id = auth.uid() AND status = 'admin'
    )
  );

-- INSERT: authenticated user proposing as themselves
DROP POLICY IF EXISTS "admin_proposals_insert_self" ON admin_proposals;
CREATE POLICY "admin_proposals_insert_self" ON admin_proposals
  FOR INSERT WITH CHECK (proposed_by = auth.uid());

-- UPDATE: admins only (Facu transitions status to approved/rejected via server)
DROP POLICY IF EXISTS "admin_proposals_update_admin" ON admin_proposals;
CREATE POLICY "admin_proposals_update_admin" ON admin_proposals
  FOR UPDATE USING (
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

-- DELETE: admins only (rare; withdrawals should set status='withdrawn')
DROP POLICY IF EXISTS "admin_proposals_delete_admin" ON admin_proposals;
CREATE POLICY "admin_proposals_delete_admin" ON admin_proposals
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM client_profiles
      WHERE user_id = auth.uid() AND status = 'admin'
    )
  );

COMMENT ON TABLE admin_proposals IS
  'Every admin edit lands here first. Direct writes to source tables (box_master, pricing_constants, shipping_config_v2, client_profiles, ...) are forbidden -- routes/UI must propose, then the approval-execution registry applies on Facu approve.';
COMMENT ON COLUMN admin_proposals.warnings IS
  'Server-computed warnings at proposal time, e.g. [{"code":"low_margin","severity":"warn","detail":"GPM falls below 28%"}].';

-- -----------------------------------------------------------------------------
-- 3. admin_approvals (Facu's decisions)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_approvals (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id  uuid NOT NULL REFERENCES admin_proposals(id) ON DELETE CASCADE,
  decision     text NOT NULL CHECK (decision IN ('approve', 'reject')),
  decided_by   uuid REFERENCES auth.users(id),
  decided_at   timestamptz NOT NULL DEFAULT now(),
  reason       text
);

CREATE INDEX IF NOT EXISTS idx_admin_approvals_proposal
  ON admin_approvals(proposal_id);
CREATE INDEX IF NOT EXISTS idx_admin_approvals_decided_by
  ON admin_approvals(decided_by);

ALTER TABLE admin_approvals ENABLE ROW LEVEL SECURITY;

-- SELECT: admins or the original proposer can read decisions on their proposal
DROP POLICY IF EXISTS "admin_approvals_read" ON admin_approvals;
CREATE POLICY "admin_approvals_read" ON admin_approvals
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM client_profiles
      WHERE user_id = auth.uid() AND status = 'admin'
    )
    OR EXISTS (
      SELECT 1 FROM admin_proposals p
      WHERE p.id = admin_approvals.proposal_id AND p.proposed_by = auth.uid()
    )
  );

-- INSERT/UPDATE/DELETE: admins only
DROP POLICY IF EXISTS "admin_approvals_admin_write" ON admin_approvals;
CREATE POLICY "admin_approvals_admin_write" ON admin_approvals
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

COMMENT ON TABLE admin_approvals IS
  'Approve/reject log. One decision per row; subsequent overturns create new rows (history preserved).';

-- -----------------------------------------------------------------------------
-- 4. override_audit (before/after snapshots of every applied change)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS override_audit (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id          uuid REFERENCES admin_proposals(id),
  target_table         text NOT NULL,
  target_id            text,
  before_jsonb         jsonb,
  after_jsonb          jsonb,
  applied_at           timestamptz NOT NULL DEFAULT now(),
  applied_by_function  text                                  -- e.g. "proposal-executors.boxMasterUpdate"
);

CREATE INDEX IF NOT EXISTS idx_override_audit_proposal
  ON override_audit(proposal_id);
CREATE INDEX IF NOT EXISTS idx_override_audit_target
  ON override_audit(target_table, target_id);
CREATE INDEX IF NOT EXISTS idx_override_audit_applied_at
  ON override_audit(applied_at DESC);

ALTER TABLE override_audit ENABLE ROW LEVEL SECURITY;

-- SELECT: admins only (audit log is admin-internal)
DROP POLICY IF EXISTS "override_audit_admin_read" ON override_audit;
CREATE POLICY "override_audit_admin_read" ON override_audit
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM client_profiles
      WHERE user_id = auth.uid() AND status = 'admin'
    )
  );

-- WRITE: service role only -- no policy means no anon/auth writes (RLS denies by default)

COMMENT ON TABLE override_audit IS
  'Append-only before/after log of every admin override that was actually applied to a source table.';

-- -----------------------------------------------------------------------------
-- 5. shipping_config_v2 (replaces legacy hardcoded shipping zones)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shipping_config_v2 (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  origin_country           text NOT NULL,            -- e.g. "CO" (Colombia), "EC" (Ecuador)
  dest_port                text NOT NULL,            -- e.g. "MIA", "JFK"
  zone                     text NOT NULL,            -- e.g. "us-east", "us-west"
  fuel_pct                 numeric NOT NULL DEFAULT 0,
  dim_divisor              integer NOT NULL DEFAULT 6000,
  rel_number               numeric NOT NULL DEFAULT 1,
  effective_from           date NOT NULL,
  effective_until          date,
  created_by_proposal_id   uuid REFERENCES admin_proposals(id),
  UNIQUE (origin_country, dest_port, effective_from)
);

CREATE INDEX IF NOT EXISTS idx_shipping_config_v2_origin_dest
  ON shipping_config_v2(origin_country, dest_port);
CREATE INDEX IF NOT EXISTS idx_shipping_config_v2_effective
  ON shipping_config_v2(effective_from, effective_until);

ALTER TABLE shipping_config_v2 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shipping_config_v2_read_all" ON shipping_config_v2;
CREATE POLICY "shipping_config_v2_read_all" ON shipping_config_v2
  FOR SELECT USING (true);

-- Writes go through admin_proposals -> executors (service role). No direct admin write policy.

COMMENT ON TABLE shipping_config_v2 IS
  'Time-versioned shipping config. New rows created via admin_proposals -> proposal-executors.ts so every change has an approval trail in created_by_proposal_id.';

-- -----------------------------------------------------------------------------
-- 6. Add quality_family_id to mirror + classifications (no backfill here)
-- -----------------------------------------------------------------------------
ALTER TABLE public.floropolis_inventory_mirror
  ADD COLUMN IF NOT EXISTS quality_family_id text REFERENCES quality_families(id);

CREATE INDEX IF NOT EXISTS idx_floropolis_inventory_mirror_quality_family
  ON public.floropolis_inventory_mirror(quality_family_id);

ALTER TABLE public.catalog_classifications
  ADD COLUMN IF NOT EXISTS quality_family_id text REFERENCES quality_families(id);

CREATE INDEX IF NOT EXISTS idx_catalog_classifications_quality_family
  ON public.catalog_classifications(quality_family_id);

COMMENT ON COLUMN public.floropolis_inventory_mirror.quality_family_id IS
  'Optional link to quality_families. Backfill is intentionally NOT performed in this migration -- handled by a separate Job_PM script after the family taxonomy is finalized.';
COMMENT ON COLUMN public.catalog_classifications.quality_family_id IS
  'Optional link to quality_families. Mirrors the column on floropolis_inventory_mirror.';
