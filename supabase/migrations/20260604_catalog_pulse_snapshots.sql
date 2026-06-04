-- Catalog Pulse Snapshots: trust-pulse deltas for "Facu's Desk — Zone 1"
-- v1 | 2026-06-04 | Job_PM (CPO) — DRAFT, do NOT apply blind; Job_PM verifies + commits.
--
-- WHY: Facu's catalog UX reflection (kb/facu_catalog_ux_reflection_2026-06-04.md,
-- "Zone 1 — The pulse (10s)") asks the top of /admin/catalog to answer, in ten
-- seconds: "is it getting BETTER since I last looked, what's the #1 limiter, and
-- how many decisions need ME?". The state numbers already exist live
-- (catalog_classifications, catalog_repair_state, admin_proposals). What does NOT
-- exist is a record of the PRIOR state — the "since last visit" anchor that turns
-- a state dump into a delta. This table stores one row per pulse read so the next
-- read can compute ▲/▼ deltas. lib/admin/pulse.ts writes it (throttled ~20h) and
-- reads the latest prior row.
--
-- GROUNDING (read-only SELECTs vs BACKUP ibckhcjvyxzrhvdiazbx, 2026-06-04):
--   catalog_classifications: status 'publishable'=689, 'blocked'=248, total=937
--   dim_sku: 949 rows  -> quarantined = 949 - 937 = 12
--   catalog_repair_state: open=674, routed=32, verified=0
--   admin_proposals where status='awaiting_facu' = 13
-- These are the seven integer columns below (published = publishable count).
--
-- RLS: read-all / admin-write, matching catalog_repair_state and box_master.
-- Project: supabase-backup (ibckhcjvyxzrhvdiazbx)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.catalog_pulse_snapshots (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- catalog_classifications.status counts (published == 'publishable')
  published           integer NOT NULL,
  blocked             integer NOT NULL,
  -- dim_sku count - catalog_classifications count (data-integrity quarantine)
  quarantined         integer NOT NULL,

  -- catalog_repair_state counts by loop position
  repairs_open        integer NOT NULL,   -- state = 'open'
  repairs_in_flight   integer NOT NULL,   -- state IN ('routed','landed','re_scored')
  repairs_verified    integer NOT NULL,   -- state = 'verified'

  -- admin_proposals where status = 'awaiting_facu'
  decisions_waiting   integer NOT NULL,

  captured_at         timestamptz NOT NULL DEFAULT now()
);

-- Latest-prior lookup is "ORDER BY captured_at DESC LIMIT 1" on every page read.
CREATE INDEX IF NOT EXISTS idx_catalog_pulse_snapshots_captured_at
  ON public.catalog_pulse_snapshots (captured_at DESC);

COMMENT ON TABLE public.catalog_pulse_snapshots IS
  'Facu''s Desk Zone 1 pulse: one row per catalog state read, written throttled '
  '(~20h) by lib/admin/pulse.ts. The latest prior row is the "since last visit" '
  'anchor for ▲/▼ deltas. published == catalog_classifications.status=publishable.';

-- ───────────────────────────────────────────────────────────────────────────
-- RLS — read-all, admin-write (matches catalog_repair_state / box_master)
-- ───────────────────────────────────────────────────────────────────────────

ALTER TABLE public.catalog_pulse_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "catalog_pulse_snapshots_read_all" ON public.catalog_pulse_snapshots;
CREATE POLICY "catalog_pulse_snapshots_read_all" ON public.catalog_pulse_snapshots
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "catalog_pulse_snapshots_admin_write" ON public.catalog_pulse_snapshots;
CREATE POLICY "catalog_pulse_snapshots_admin_write" ON public.catalog_pulse_snapshots
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.client_profiles
             WHERE user_id = auth.uid() AND status = 'admin')
  );
