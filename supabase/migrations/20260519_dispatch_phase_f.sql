-- =============================================================================
-- Dispatch Phase F Migration
-- v1 | 2026-05-19 | Job_PM ADMIN-PORT Phase F [V8 SHADOW]
-- Project: /admin/dispatch 4-panel completion + post-delivery feedback loop
-- Target: supabase-backup (ibckhcjvyxzrhvdiazbx) - NOT production
--
-- BRD reference: catalog_BRD_PRD_v0.3 §5.3 Block 4 (UC-O-181..195),
-- Block 5 (UC-O-196..203). Stops short of: vendor_confirmations, label_reader,
-- WhatsApp ingestion, Brevo sends (Phase G, AI-Infra domain).
--
-- Creates 4 NEW tables (all JOB_OWNED per data ownership matrix):
--   dispatch_communications    - per-shipment outbound/inbound comm log
--   dispatch_feedback          - post-delivery customer feedback (header)
--   dispatch_feedback_sku      - per-SKU feedback rows (1:N w/ feedback)
--   sample_box_prospects       - prospects eligible for the "+ Sample Box" CTA
--
-- Adds columns to dispatches:
--   driver_pickup_confirmed         boolean
--   driver_pickup_confirmed_at      timestamptz
--   fedex_confirmed                 boolean
--   fedex_confirmed_at              timestamptz
--
-- Creates 1 storage bucket:
--   dispatch-labels (private; FedEx PDFs)
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

-- =============================================================================
-- dispatches: add driver / fedex confirmation columns
-- =============================================================================
ALTER TABLE dispatches
  ADD COLUMN IF NOT EXISTS driver_pickup_confirmed    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS driver_pickup_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS fedex_confirmed            boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fedex_confirmed_at         timestamptz,
  ADD COLUMN IF NOT EXISTS dispatch_date              date;

CREATE INDEX IF NOT EXISTS idx_dispatches_dispatch_date ON dispatches(dispatch_date);

COMMENT ON COLUMN dispatches.driver_pickup_confirmed     IS 'Phase F: true when admin manually marks driver pickup (v1). v2 will flip via Rose WhatsApp parser.';
COMMENT ON COLUMN dispatches.driver_pickup_confirmed_at  IS 'Phase F: timestamp of pickup confirmation.';
COMMENT ON COLUMN dispatches.fedex_confirmed             IS 'Phase F: true when admin marks FedEx depot receipt confirmed.';
COMMENT ON COLUMN dispatches.fedex_confirmed_at          IS 'Phase F: timestamp of FedEx depot receipt confirmation.';
COMMENT ON COLUMN dispatches.dispatch_date               IS 'Phase F: the ship date this dispatch belongs to. Used for /admin/dispatch?date=YYYY-MM-DD filtering and the FedEx CSV export. Nullable for legacy rows; derived from orders.requested_delivery_date - lead_time_days when null.';

-- =============================================================================
-- dispatch_communications
-- One row per outbound/inbound comm tied to a dispatch (email, whatsapp, phone).
-- Phase F: STUB writes only (no actual Brevo / Twilio send). Phase G wires sends.
-- =============================================================================
CREATE TABLE IF NOT EXISTS dispatch_communications (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_id          uuid NOT NULL REFERENCES dispatches(id) ON DELETE CASCADE,
  channel              text NOT NULL CHECK (channel IN ('email','whatsapp','phone_note')),
  direction            text NOT NULL CHECK (direction IN ('outbound','inbound')),
  subject              text,
  body                 text,
  recipient            text,
  sent_by              uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sent_at              timestamptz NOT NULL DEFAULT now(),
  external_message_id  text,
  notes                text,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dispatch_comms_dispatch_id ON dispatch_communications(dispatch_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_comms_sent_at     ON dispatch_communications(sent_at);

ALTER TABLE dispatch_communications ENABLE ROW LEVEL SECURITY;
-- Admin-only via service-role; no anon policies.

COMMENT ON TABLE  dispatch_communications IS 'Phase F: per-dispatch comm log. Email send is a STUB in Phase F (writes the row, does not send) - Phase G wires Brevo.';
COMMENT ON COLUMN dispatch_communications.channel       IS 'email | whatsapp | phone_note';
COMMENT ON COLUMN dispatch_communications.direction     IS 'outbound (to customer/vendor) | inbound (from customer/vendor)';
COMMENT ON COLUMN dispatch_communications.external_message_id IS 'Brevo / Twilio / Gmail message id when send is wired (Phase G).';

-- =============================================================================
-- dispatch_feedback (header)
-- Customer arrival feedback per dispatch. UC-O-198 / UC-O-199.
-- =============================================================================
CREATE TABLE IF NOT EXISTS dispatch_feedback (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_id       uuid NOT NULL REFERENCES dispatches(id) ON DELETE CASCADE,
  condition_score   int CHECK (condition_score BETWEEN 1 AND 5),
  notes             text,
  vendor_score      int CHECK (vendor_score BETWEEN 1 AND 5),
  captured_at       timestamptz NOT NULL DEFAULT now(),
  captured_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  source            text NOT NULL DEFAULT 'admin_proxy' CHECK (source IN ('customer','admin_proxy')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz
);

CREATE INDEX IF NOT EXISTS idx_dispatch_feedback_dispatch_id ON dispatch_feedback(dispatch_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_feedback_captured_at ON dispatch_feedback(captured_at);

DROP TRIGGER IF EXISTS trg_dispatch_feedback_updated_at ON dispatch_feedback;
CREATE TRIGGER trg_dispatch_feedback_updated_at BEFORE UPDATE ON dispatch_feedback
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE dispatch_feedback ENABLE ROW LEVEL SECURITY;
-- Admin-only via service-role; no anon policies.

COMMENT ON TABLE  dispatch_feedback IS 'Phase F: post-delivery customer feedback header (UC-O-198 / UC-O-199). Per-SKU detail rows in dispatch_feedback_sku.';
COMMENT ON COLUMN dispatch_feedback.source IS 'customer = filled customer-facing form (future); admin_proxy = ops entered on customer behalf (UC-O-199).';

-- =============================================================================
-- dispatch_feedback_sku (line items)
-- Per-SKU feedback within a dispatch_feedback header.
-- AI-Infra (Rose) consumes these later to populate supply_quality_scores
-- (her domain - out of Phase F scope; UC-O-200 handoff).
-- =============================================================================
CREATE TABLE IF NOT EXISTS dispatch_feedback_sku (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id     uuid NOT NULL REFERENCES dispatch_feedback(id) ON DELETE CASCADE,
  sku_id          text NOT NULL,
  sku_score       int CHECK (sku_score BETWEEN 1 AND 5),
  sku_notes       text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dispatch_feedback_sku_feedback_id ON dispatch_feedback_sku(feedback_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_feedback_sku_sku_id      ON dispatch_feedback_sku(sku_id);

ALTER TABLE dispatch_feedback_sku ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE  dispatch_feedback_sku IS 'Phase F: per-SKU score rows. sku_id intentionally text (no FK) - mirror truncates daily; matches order_lines.sku_id convention but stored as text for flexibility.';

-- =============================================================================
-- sample_box_prospects
-- Standalone prospects table (decoupled from client_profiles - prospects do
-- NOT need an auth.users row to be eligible). Backed by a future Talin-owned
-- ingest pipeline; for v0 we seed manually.
-- =============================================================================
CREATE TABLE IF NOT EXISTS sample_box_prospects (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name   text NOT NULL,
  contact_name    text,
  email           text,
  phone           text,
  city            text,
  state           text,
  country         text NOT NULL DEFAULT 'US' CHECK (length(country) = 2),
  source          text,
  status          text NOT NULL DEFAULT 'eligible' CHECK (status IN (
    'eligible','sent','converted','disqualified'
  )),
  last_sample_sent_at  timestamptz,
  last_dispatch_id     uuid REFERENCES dispatches(id) ON DELETE SET NULL,
  client_profile_id    uuid REFERENCES client_profiles(id) ON DELETE SET NULL,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz
);

CREATE INDEX IF NOT EXISTS idx_sample_box_prospects_status ON sample_box_prospects(status);

DROP TRIGGER IF EXISTS trg_sample_box_prospects_updated_at ON sample_box_prospects;
CREATE TRIGGER trg_sample_box_prospects_updated_at BEFORE UPDATE ON sample_box_prospects
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE sample_box_prospects ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE  sample_box_prospects IS 'Phase F: prospects eligible for the "+ Sample Box" CTA on /admin/dispatch. Decoupled from client_profiles so a lead never needs to sign up first.';
COMMENT ON COLUMN sample_box_prospects.client_profile_id IS 'Set once the prospect converts to a registered client.';

-- Seed a few rows so the demo modal has data (idempotent: no-op on second run).
INSERT INTO sample_box_prospects (business_name, contact_name, city, state, country, source, notes)
SELECT * FROM (VALUES
  ('Lily''s Petals',  'Sarah J.', 'Nashville', 'TN', 'US', 'manual_seed', 'Phase F demo seed'),
  ('Bloom Studio ATL','Mark R.',  'Atlanta',   'GA', 'US', 'manual_seed', 'Phase F demo seed'),
  ('Floral Dreams',   'Ana M.',   'Austin',    'TX', 'US', 'manual_seed', 'Phase F demo seed'),
  ('Petal & Stem Co', 'Erin L.',  'Portland',  'OR', 'US', 'manual_seed', 'Phase F demo seed'),
  ('Stem & Bloom',    'Mia K.',   'Denver',    'CO', 'US', 'manual_seed', 'Phase F demo seed')
) AS v(business_name, contact_name, city, state, country, source, notes)
WHERE NOT EXISTS (SELECT 1 FROM sample_box_prospects WHERE source='manual_seed');

-- =============================================================================
-- Storage bucket: dispatch-labels (private; FedEx PDFs uploaded by admin)
-- =============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('dispatch-labels', 'dispatch-labels', false)
ON CONFLICT (id) DO NOTHING;
