-- visibility_overrides table
-- v1 | 2026-05-26 | Job_PM [V8 SHADOW]
--
-- Created retroactively: execVisibilityOverrideCreate in proposal-executors.ts
-- has been writing to this table since Phase C (2026-05-19) but the DDL was
-- never committed. This migration ensures the table is reproducible from
-- migrations alone (required for any restore/branch operation).
--
-- Schema inferred from execVisibilityOverrideCreate (proposal-executors.ts lines 375-426).

CREATE TABLE IF NOT EXISTS public.visibility_overrides (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku_id       bigint NOT NULL,
  decision     text NOT NULL CHECK (decision IN ('show', 'hide')),
  reason       text NOT NULL,
  expires_at   timestamptz,
  set_by       uuid REFERENCES auth.users(id),
  proposal_id  uuid REFERENCES admin_proposals(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_visibility_overrides_sku_id
  ON public.visibility_overrides(sku_id);

CREATE INDEX IF NOT EXISTS idx_visibility_overrides_proposal_id
  ON public.visibility_overrides(proposal_id);

ALTER TABLE public.visibility_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "visibility_overrides_admin_all" ON public.visibility_overrides;
CREATE POLICY "visibility_overrides_admin_all" ON public.visibility_overrides
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

COMMENT ON TABLE public.visibility_overrides IS
  'Per-SKU show/hide overrides applied via admin_proposals. Checked by the catalog publisher before including a SKU in a live feed.';
