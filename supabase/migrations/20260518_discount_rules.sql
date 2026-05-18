-- =============================================================================
-- Discount Rules Table
-- v1 | 2026-05-18 | Job_PM admin-port X6 [V8 SHADOW]
-- Project: supabase-backup (ibckhcjvyxzrhvdiazbx) -- NOT production
--
-- Backs /admin/catalog/discounts. Scope-driven discount rules consumed by
-- the checkout pricing engine (active rules only -- public read).
--
-- Lifecycle:
--   1. Admin proposes via UI -> POST /api/admin/proposals (type='discount_rule.create')
--      writes a row to admin_proposals. The rule does NOT exist here yet.
--   2. Facu approves -> approve route calls executeProposal -> exec inserts here
--      with status='active' and created_by_proposal_id=proposal.id.
--   3. UI / checkout reads active rules from this table.
--   4. Admin can pause/expire later (status flip via future proposal type).
--
-- RLS:
--   - SELECT: public-read but ONLY rows where status='active' (so checkout
--     can compute discounts for unauthenticated cart previews).
--   - INSERT/UPDATE/DELETE: admins only (client_profiles.status='admin').
--   - Service role bypasses RLS for the executor.
--
-- Idempotent: safe to re-run.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.discount_rules (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope                   text NOT NULL
    CHECK (scope IN ('category', 'vendor', 'sku', 'client', 'client_category')),
  scope_value             text NOT NULL,
  discount_pct            numeric(6,3) NOT NULL
    CHECK (discount_pct > 0 AND discount_pct <= 100),
  valid_from              date,
  valid_until             date,
  min_qty                 integer NOT NULL DEFAULT 1
    CHECK (min_qty >= 1),
  status                  text NOT NULL DEFAULT 'awaiting_facu'
    CHECK (status IN ('awaiting_facu', 'active', 'paused', 'expired')),
  notes                   text,
  created_by_proposal_id  uuid REFERENCES public.admin_proposals(id) ON DELETE SET NULL,
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_discount_rules_scope_status
  ON public.discount_rules(scope, scope_value, status);

CREATE INDEX IF NOT EXISTS idx_discount_rules_status
  ON public.discount_rules(status);

ALTER TABLE public.discount_rules ENABLE ROW LEVEL SECURITY;

-- Public read but only active rules (checkout needs unauthenticated price preview).
DROP POLICY IF EXISTS "discount_rules_read_active" ON public.discount_rules;
CREATE POLICY "discount_rules_read_active" ON public.discount_rules
  FOR SELECT USING (status = 'active');

-- Admins can read every row (including awaiting_facu / paused / expired).
DROP POLICY IF EXISTS "discount_rules_admin_read_all" ON public.discount_rules;
CREATE POLICY "discount_rules_admin_read_all" ON public.discount_rules
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.client_profiles
      WHERE user_id = auth.uid()
        AND status = 'admin'
    )
  );

-- Admins can mutate (the executor uses service-role anyway; this is for any
-- direct admin client write outside the proposal flow).
DROP POLICY IF EXISTS "discount_rules_admin_write" ON public.discount_rules;
CREATE POLICY "discount_rules_admin_write" ON public.discount_rules
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.client_profiles
      WHERE user_id = auth.uid()
        AND status = 'admin'
    )
  );

COMMENT ON TABLE public.discount_rules IS
  'Scope-driven discount rules. Public-read filtered to status=active for checkout. Admin proposal -> Facu approval -> exec inserts here.';
