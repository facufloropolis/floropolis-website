-- sku_mappings: vendor SKU text -> canonical (parent_sku_id, quality_family_id) review queue.
-- v1 | 2026-05-18 | Job_PM admin-port X5 [V8 SHADOW]
--
-- Rows are produced by the ingestion-side SKU Mapper agent (proposed). Each row
-- is one raw vendor SKU string that we want to bind to a parent_sku / quality
-- family. The mapper computes a similarity confidence in [0, 1]:
--   - high   (>= 0.85)  -- auto-mappable (handled outside this UI)
--   - medium (0.50-0.85) -- queued here as 'awaiting_review'
--   - low    (< 0.50)    -- queued here as 'low_confidence'
--
-- /admin/catalog/mapping is the human-review surface. Confirm goes through
-- admin_proposals (type=sku_mapping.confirm) so it lands in override_audit.
-- Rejection is reversible -- it flips status='rejected' directly via
-- /api/admin/mapping/[id]/reject without a proposal.
--
-- parent_sku_id is intentionally a free text column today (no FK): the canonical
-- parent_sku table does not exist yet, and the mapping queue must be usable
-- before it does. Once parent_sku lands we'll add the FK in a follow-up.

CREATE TABLE IF NOT EXISTS sku_mappings (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id                text NOT NULL,
  vendor_sku_text          text NOT NULL,                       -- raw vendor input, e.g. "ROJO 60CM HV"
  parent_sku_id            text,                                -- canonical parent SKU (free text until parent_sku table lands)
  quality_family_id        text REFERENCES quality_families(id),
  confidence               numeric NOT NULL DEFAULT 0
    CHECK (confidence >= 0 AND confidence <= 1),
  status                   text NOT NULL DEFAULT 'awaiting_review'
    CHECK (status IN ('awaiting_review', 'mapped', 'rejected', 'low_confidence')),
  mapped_by                uuid REFERENCES auth.users(id),
  mapped_at                timestamptz,
  mapped_via_proposal_id   uuid REFERENCES admin_proposals(id),
  created_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sku_mappings_vendor_status_confidence
  ON sku_mappings(vendor_id, status, confidence);

CREATE INDEX IF NOT EXISTS idx_sku_mappings_status
  ON sku_mappings(status);

ALTER TABLE sku_mappings ENABLE ROW LEVEL SECURITY;

-- SELECT: admins only
DROP POLICY IF EXISTS "sku_mappings_admin_read" ON sku_mappings;
CREATE POLICY "sku_mappings_admin_read" ON sku_mappings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM client_profiles
      WHERE user_id = auth.uid() AND status = 'admin'
    )
  );

-- INSERT/UPDATE/DELETE: admins only at the policy layer. Writes from the UI go
-- through admin_proposals -> executor (service role) so RLS doesn't matter
-- there; this policy exists for parity with the rest of the admin surface.
DROP POLICY IF EXISTS "sku_mappings_admin_write" ON sku_mappings;
CREATE POLICY "sku_mappings_admin_write" ON sku_mappings
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

COMMENT ON TABLE sku_mappings IS
  'Review queue for vendor SKU text -> canonical (parent_sku, quality_family). Populated by ingestion-side SKU Mapper agent. UI: /admin/catalog/mapping. Confirms go through admin_proposals (type=sku_mapping.confirm); rejections flip status directly via /api/admin/mapping/[id]/reject.';
COMMENT ON COLUMN sku_mappings.parent_sku_id IS
  'Canonical parent SKU id. Free text today (no FK) -- the parent_sku table does not exist yet. Backfill will add the FK in a follow-up migration.';
COMMENT ON COLUMN sku_mappings.confidence IS
  'Parser similarity score in [0, 1]. >=0.85 auto-mapped (not queued); 0.50-0.85 = awaiting_review; <0.50 = low_confidence.';
COMMENT ON COLUMN sku_mappings.status IS
  'awaiting_review | mapped | rejected | low_confidence. mapped requires a successful admin_proposals execution (mapped_via_proposal_id set). rejected is a soft delete and is reversible.';
