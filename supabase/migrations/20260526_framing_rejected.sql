-- Framing rejection + stale-guard infrastructure
-- v1 | 2026-05-26 | Job_PM [V8 SHADOW]
--
-- Two additions:
--
-- 1. admin_approvals: add 'framing_rejected' to the decision CHECK constraint
--    and a correction_data JSONB column for the structured correction
--    { what_is_wrong, what_should_be_true }.
--    Also adds facu_rationale + urgency_tier IF they don't exist yet
--    (Phase C added them in code before this migration existed).
--
-- 2. admin_proposals: add 'framing_rejected' to the status CHECK constraint.
--    Proposals in this state appear in the "Rejected" tab, visually
--    distinguished, and carry an override_audit row with the correction.

-- -------------------------------------------------------------------------
-- admin_approvals: expand decision constraint + add correction_data column
-- -------------------------------------------------------------------------

ALTER TABLE public.admin_approvals
  DROP CONSTRAINT IF EXISTS admin_approvals_decision_check;

ALTER TABLE public.admin_approvals
  ADD CONSTRAINT admin_approvals_decision_check
    CHECK (decision IN ('approve', 'reject', 'framing_rejected'));

ALTER TABLE public.admin_approvals
  ADD COLUMN IF NOT EXISTS correction_data jsonb;

-- Phase C columns (code was writing these before migration existed)
ALTER TABLE public.admin_approvals
  ADD COLUMN IF NOT EXISTS facu_rationale text;

ALTER TABLE public.admin_approvals
  ADD COLUMN IF NOT EXISTS urgency_tier text
    CHECK (urgency_tier IS NULL OR urgency_tier IN ('routine', 'urgent', 'critical'));

COMMENT ON COLUMN public.admin_approvals.correction_data IS
  'Structured correction for framing_rejected decisions. Shape: { what_is_wrong: string, what_should_be_true: string }. Null for approve/reject decisions.';

COMMENT ON COLUMN public.admin_approvals.facu_rationale IS
  'Facu mandatory rationale. NOT NULL enforced at API layer (min 5 chars for approve/reject, min 20 chars for framing_rejected). Stored here for audit.';

COMMENT ON COLUMN public.admin_approvals.urgency_tier IS
  'SLA tier chosen at approval time. routine=72h, urgent=12h, critical=4h. Only applies to approve decisions.';

-- -------------------------------------------------------------------------
-- admin_proposals: expand status constraint
-- -------------------------------------------------------------------------

ALTER TABLE public.admin_proposals
  DROP CONSTRAINT IF EXISTS admin_proposals_status_check;

ALTER TABLE public.admin_proposals
  ADD CONSTRAINT admin_proposals_status_check
    CHECK (status IN ('awaiting_facu', 'approved', 'rejected', 'framing_rejected', 'withdrawn'));

COMMENT ON COLUMN public.admin_proposals.status IS
  'Proposal lifecycle state. awaiting_facu: pending Facu decision. approved: executor ran, change applied. rejected: Facu rejected, no execution. framing_rejected: Facu says the premise was wrong -- correction in admin_approvals.correction_data and override_audit. withdrawn: abandoned before review.';
