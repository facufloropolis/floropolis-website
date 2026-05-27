// Bucket classifier for admin_proposals awaiting Facu review.
// v1 | 2026-05-26 | Job_PM [V8 SHADOW]
//
// Three buckets:
//   actionable_now    — system has current + proposed values; Facu can decide immediately
//   needs_confirmation — flag or signal exists but context is incomplete or ambiguous
//   strategic_backlog  — structural decision, low urgency, no single clear action
//
// Classification is based on proposal type. No DB call.

export type ProposalBucket =
  | 'actionable_now'
  | 'needs_confirmation'
  | 'strategic_backlog';

export function classifyProposalBucket(proposalType: string): ProposalBucket {
  switch (proposalType) {
    // -----------------------------------------------------------------------
    // ACTIONABLE NOW: system knows before + after; executor will run immediately
    // -----------------------------------------------------------------------
    case 'price.formula_reset':                // computed formula price → write to mirror
    case 'price.formula_deviation_review':    // formula vs actual deviation; executor resets to formula price
    case 'price.formula_review.batch':        // Job's synthesized batch from ops.price_audit_log FAIL rows; each batch has clear action (reset_to_formula | raise_to_formula | formula_validation_required | monitor_only)
    case 'price_correction.propose':    // explicit price correction with before/after
    case 'ingest.price_field_bug':      // pipeline bug escalation — act now
    case 'price_alert.batch_clear':     // Facu acknowledges alert; clears flag in mirror
    case 'contents_description.batch_approve': // description template → writes to mirror
    case 'box_master.update':           // physical evidence required; clear change
    case 'pricing_constants.update':    // global constant change with known impact
    case 'discount_rule.create':
    case 'discount_rule.status_change':
    case 'client_profiles.status_change':
    case 'client_profiles.update':
    case 'sku_mapping.confirm':
    case 'refund.create':
    case 'visibility_override.create':
      return 'actionable_now';

    // -----------------------------------------------------------------------
    // NEEDS CONFIRMATION: signal exists but Facu needs to verify context first
    // -----------------------------------------------------------------------
    case 'cost.source_confirm':         // Facu needs to verify vendor source is valid
    case 'cost.source_flag':            // Facu needs to confirm source is unreliable
    case 'price_alert.facu_correction': // Rose flagged suspect; need Facu's read
    case 'contents_description.facu_correction': // description gap; need Facu input
    case 'cost_source.facu_correction': // cost provenance needs Facu clarification
    case 'vendor.pricelist_request':    // waiting on vendor; confirm to log
    case 'delete_cost_row':
    case 'approve_cost_row':
    case 'reject_cost_row':
    case 'resolve_conflict':            // Rose canonical_cost cleanup; needs context
    case 'importance_config.weight_update': // changes conversion model weights → Job_PM must review
    case 'importance_config.variety_update': // changes single variety importance score → Job_PM must review
      return 'needs_confirmation';

    // -----------------------------------------------------------------------
    // STRATEGIC BACKLOG: system-level or non-urgent structural decisions
    // -----------------------------------------------------------------------
    case 'shipping_config.create':
    case 'catalog_quality_weight.update':
    case 'catalog_quality_threshold.update':
    case 'catalog_quality_rebalance':
    case 'catalog_quality_tier_reclassification':
    case 'tier_visibility_window.accept_country':
    case 'tier_visibility_window.update':
    case 'visibility_rule.create':       // executor is STUB; table doesn't exist yet
      return 'strategic_backlog';

    default:
      return 'strategic_backlog';
  }
}

export const BUCKET_LABELS: Record<ProposalBucket, string> = {
  actionable_now: 'Actionable now',
  needs_confirmation: 'Needs confirmation',
  strategic_backlog: 'Strategic backlog',
};

export const BUCKET_DESCRIPTIONS: Record<ProposalBucket, string> = {
  actionable_now: 'System has current + proposed values. Approve runs the executor immediately.',
  needs_confirmation: 'Signal detected but context is incomplete. Review before deciding.',
  strategic_backlog: 'Structural or non-urgent decision. No deadline.',
};
