-- =============================================================================
-- Ingestion Batches Migration
-- v1 | 2026-05-18 | Job_PM admin-port X4 [V8 SHADOW]
-- Project: supabase-backup (ibckhcjvyxzrhvdiazbx) -- NOT production
--
-- Vendor data staging table for /admin/catalog/ingest.
--
-- Sources:
--   komet_api     -- Rose_BI K2K cron writes here (LIVE)
--   vendor_email  -- email parser agent (PLANNED P2)
--   whatsapp      -- whatsapp scraper agent (PLANNED P2)
--   csv_upload    -- admin CSV uploader (PLANNED P2)
--   manual_paste  -- this page's textarea (LIVE -- via /api/admin/ingest/manual)
--
-- Status lifecycle:
--   awaiting_review -> mapped -> imported
--                  -> rejected
--
-- RLS: enabled, no anon/auth policies. Service-role writes/reads only.
-- Admin UI reads via service-role client from server components.
--
-- Idempotent: safe to re-run.
-- =============================================================================

CREATE TABLE IF NOT EXISTS ingestion_batches (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source              text NOT NULL
    CHECK (source IN ('komet_api','vendor_email','whatsapp','csv_upload','manual_paste')),
  vendor_id           text,                                    -- free-text vendor identifier for now
  received_at         timestamptz NOT NULL DEFAULT now(),
  raw_payload         jsonb NOT NULL DEFAULT '{}'::jsonb,      -- unparsed incoming data
  parsed_rows         jsonb NOT NULL DEFAULT '[]'::jsonb,      -- [{sku?, variety, stem_length, qty, cost}, ...]
  parser_confidence   numeric NOT NULL DEFAULT 0
    CHECK (parser_confidence >= 0 AND parser_confidence <= 1),
  status              text NOT NULL DEFAULT 'awaiting_review'
    CHECK (status IN ('awaiting_review','mapped','rejected','imported')),
  notes               text,
  created_by          uuid REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_ingestion_batches_status
  ON ingestion_batches(status);
CREATE INDEX IF NOT EXISTS idx_ingestion_batches_source
  ON ingestion_batches(source);
CREATE INDEX IF NOT EXISTS idx_ingestion_batches_received_at
  ON ingestion_batches(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_ingestion_batches_vendor_id
  ON ingestion_batches(vendor_id);

ALTER TABLE ingestion_batches ENABLE ROW LEVEL SECURITY;

-- No SELECT/INSERT/UPDATE/DELETE policies for anon or authenticated.
-- Service-role bypasses RLS by design; admin UI fetches via service client.

COMMENT ON TABLE ingestion_batches IS
  'Vendor data staging. One row per inbound batch from any source (komet_api live cron, future vendor_email/whatsapp/csv_upload adapters, manual_paste from /admin/catalog/ingest). Reviewed in the admin UI and routed to mapping queue on approve.';
COMMENT ON COLUMN ingestion_batches.parsed_rows IS
  'Best-effort parse: array of {sku?, variety, stem_length, qty, cost}. May be empty for low-confidence sources.';
COMMENT ON COLUMN ingestion_batches.parser_confidence IS
  '0..1. Computed by the source-specific parser. Manual paste defaults to 0.5 (we do not trust manual). Komet API typically 0.95+.';
