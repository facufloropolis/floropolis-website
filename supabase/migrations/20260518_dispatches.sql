-- =============================================================================
-- Dispatches Migration (DISP)
-- v1 | 2026-05-18 | Job_PM [V8 SHADOW]
-- Project: admin /dispatch page (admin_mockup_porting_spec PAGE 11)
-- Target: supabase-backup (ibckhcjvyxzrhvdiazbx) - NOT production
--
-- Creates 1 table:
--   dispatches  - one row per order representing the fulfillment / shipping lifecycle.
--
-- Lifecycle status values:
--   awaiting_pack -> packed -> label_printed -> picked_up -> in_transit -> delivered
--   (or exception at any point)
--
-- Constraints:
--   - one dispatch per order (UNIQUE on order_id)
--   - RLS on, admin-only via service-role (no anon policies)
--   - updated_at trigger
--
-- Idempotent: safe to re-run. Uses IF NOT EXISTS everywhere.
-- =============================================================================

-- Reusable updated_at trigger (defined in D1 migration; recreate defensively).
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS dispatches (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id          bigint NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  status            text NOT NULL DEFAULT 'awaiting_pack' CHECK (status IN (
    'awaiting_pack','packed','label_printed','picked_up','in_transit','delivered','exception'
  )),
  carrier           text NOT NULL DEFAULT 'fedex',
  tracking_number   text,
  label_url         text,
  packed_at         timestamptz,
  picked_up_at      timestamptz,
  in_transit_at     timestamptz,
  delivered_at      timestamptz,
  exception_note    text,
  assigned_to       text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dispatches_status   ON dispatches(status);
CREATE INDEX IF NOT EXISTS idx_dispatches_order_id ON dispatches(order_id);

DROP TRIGGER IF EXISTS trg_dispatches_updated_at ON dispatches;
CREATE TRIGGER trg_dispatches_updated_at BEFORE UPDATE ON dispatches
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS: admin-only. Service-role bypasses RLS, so admin reads/writes happen via
-- the backup service client. No anon policies are created.
ALTER TABLE dispatches ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE  dispatches IS 'DISP: One row per order tracking pack -> label -> pickup -> transit -> delivered lifecycle. Admin-only (service-role).';
COMMENT ON COLUMN dispatches.status         IS 'awaiting_pack | packed | label_printed | picked_up | in_transit | delivered | exception';
COMMENT ON COLUMN dispatches.tracking_number IS 'Carrier tracking number, populated when label is generated.';
COMMENT ON COLUMN dispatches.exception_note  IS 'Free-text reason when status=exception (damage, missing label, customs hold, etc.).';
