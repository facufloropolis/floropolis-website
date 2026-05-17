-- Inventory Validation Snapshots
-- v1 | 2026-05-17 | Job_PM [V8 SHADOW]
--
-- One row per day. Stores Subagent A validator output (validator_json) and
-- catalog_audit_daily.py output (catalog_audit_json) so the next day's audit
-- can compute day-over-day deltas.
--
-- Project: supabase-backup (ibckhcjvyxzrhvdiazbx)

CREATE TABLE IF NOT EXISTS public.inventory_validation_snapshots (
  snapshot_date date PRIMARY KEY,
  validator_json jsonb NOT NULL,
  catalog_audit_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.inventory_validation_snapshots ENABLE ROW LEVEL SECURITY;

-- Service-role-only access (no anon/authenticated policies on purpose; only the
-- GH Actions worker should touch this table).
COMMENT ON TABLE public.inventory_validation_snapshots IS
  'Job_PM-owned daily snapshot of inventory validator + catalog audit JSON. '
  'PK = snapshot_date so a day''s row is upserted, not duplicated. '
  'RLS enabled with no policies = service-role-only access.';
