// Sales Cleanup admin model — types + DB read helpers.
// v1 | 2026-05-22 | Job_PM [V8 SHADOW]
//
// Source table: meta.orphan_resolution_queue (swhglnjyuorkycpgkmec — production project).
// Reads + writes via getProdReadClient() service-role (bypasses RLS; safe because
// meta.orphan_resolution_queue is Job's table, not Rose's).
//
// RACI: product_admin (Job_PM R). Writing to this table is explicitly in scope.

// ---------------------------------------------------------------------------
// DB shapes (match actual columns — verified 2026-05-22)
// ---------------------------------------------------------------------------

export interface IdentitySignals {
  email: string | null;
  komet_id: string | null;
  zoho_lead_id: string | null;
  business_name: string | null;
  zoho_account_id: string | null;
  phone_normalized: string | null;
}

export interface TransactionSignals {
  kind: string;
  confidence: string | null;
  txn_source: string;
  total_amount: number;
  current_phase: string;
  flower_amount: number;
  txn_source_id: string;
  freight_amount: number | null;
  phase_timestamps: {
    paid_at: string | null;
    quote_at: string | null;
    prebook_at: string | null;
    shipped_at: string | null;
    invoiced_at: string | null;
    confirmed_at: string | null;
    delivered_at: string | null;
  };
}

export interface FuzzyCandidate {
  match_field: string;
  matched_value: string;
  lead_master_id: number;
  similarity_score: number;
}

export interface CrossSourceSignals {
  calls_with_same_phone: number;
  other_txns_same_email: number;
  other_txns_same_phone: number;
  messages_with_same_phone: number;
  other_txns_same_komet_id: number;
  lead_master_candidates_fuzzy: FuzzyCandidate[];
  rep_emails_with_same_email_address: number;
}

export interface SuggestedAction {
  id: string;
  confidence: number;
  description: string;
}

export type ResolutionStatus = 'pending' | 'deferred' | 'resolved' | 'auto_resolved';

export interface OrphanRow {
  id: string;
  orphan_txn_id: string;
  detected_at: string;
  impact_score: number;
  identity_signals: IdentitySignals;
  transaction_signals: TransactionSignals;
  cross_source_signals: CrossSourceSignals | null;
  suggested_actions: { actions: SuggestedAction[] } | null;
  routed_to: string;
  routed_at: string | null;
  resolution_status: ResolutionStatus;
  resolution_action: string | null;
  resolution_note: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  pattern_classification: string | null;
  pattern_decision_id: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Derived display helpers (no arithmetic on Rose data — this is Job's table)
// ---------------------------------------------------------------------------

export function identitySummary(row: OrphanRow): string {
  const s = row.identity_signals;
  const parts = [s.business_name, s.email, s.phone_normalized].filter(Boolean);
  return parts.join(' · ') || '—';
}

export function txnSummary(row: OrphanRow): string {
  const s = row.transaction_signals;
  const amt = s.total_amount != null ? `$${s.total_amount.toFixed(2)}` : '';
  const age = daysAgo(row.detected_at);
  return `${amt} ${s.kind} ${age} · ${s.txn_source}`;
}

export function crossSourceSummary(row: OrphanRow): string {
  const c = row.cross_source_signals;
  if (!c) return '';
  const parts: string[] = [];
  if (c.other_txns_same_komet_id > 0)
    parts.push(`${c.other_txns_same_komet_id} other txns same Komet ID`);
  if (c.other_txns_same_email > 0)
    parts.push(`${c.other_txns_same_email} other txns same email`);
  if (c.calls_with_same_phone > 0)
    parts.push(`${c.calls_with_same_phone} calls same phone`);
  if (c.lead_master_candidates_fuzzy.length > 0) {
    const best = c.lead_master_candidates_fuzzy[0];
    parts.push(`fuzzy match: ${best.matched_value} (${(best.similarity_score * 100).toFixed(0)}%)`);
  }
  return parts.join(' · ') || 'no cross-source signals';
}

export function topAction(row: OrphanRow): SuggestedAction | null {
  return row.suggested_actions?.actions?.[0] ?? null;
}

function daysAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / 86_400_000);
  if (days === 0) return 'today';
  if (days === 1) return '1d ago';
  return `${days}d ago`;
}

// ---------------------------------------------------------------------------
// Resolve payload (sent from client to API route)
// ---------------------------------------------------------------------------

export interface ResolvePayload {
  resolution_action: string;
  resolution_note?: string;
  apply_as_pattern?: {
    pattern_id: string;
    pattern_description: string;
    pattern_signature: Record<string, unknown>;
  };
}

export interface ResolveResult {
  id: string;
  resolution_status: ResolutionStatus;
  resolved_at: string;
  resolved_by: string;
  cascade_resolved_count: number;
}
