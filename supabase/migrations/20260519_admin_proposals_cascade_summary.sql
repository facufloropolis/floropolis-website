-- Phase C: admin_proposals.cascade_summary
-- ----------------------------------------------------------------------------
-- BRD UC-D-128 (cascade computation). The cascade impact (N SKUs affected) is
-- computed AT PROPOSAL-CREATION TIME and stored on the row. The approval queue
-- read-side renders it directly -- no recomputation per render, no N+1 joins,
-- no surprise drift between propose and review.
--
-- Shape:
--   {
--     "affected_sku_count": <int>,         -- best-effort count, 0 if unknown
--     "affected_skus_sample": [<id>, ...], -- up to 10 sample SKU ids/box_types
--     "warnings": [<text>, ...],           -- e.g. "all SKUs (global constant)"
--     "computed_at": "<ISO ts>",
--     "computed_by": "api/admin/proposals POST"
--   }
--
-- The column is JSONB NOT NULL DEFAULT '{}'. Old rows (pre-Phase C) keep '{}'
-- so the UI must treat empty as "TBD" and fall back to the old runtime compute.

ALTER TABLE public.admin_proposals
  ADD COLUMN IF NOT EXISTS cascade_summary jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.admin_proposals.cascade_summary IS
  'Pre-computed cascade impact at proposal create time. Shape: { affected_sku_count, affected_skus_sample, warnings, computed_at, computed_by }. Approval queue reads directly, no per-render recomputation. Phase C 2026-05-19.';
