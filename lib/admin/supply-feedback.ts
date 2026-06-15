// lib/admin/supply-feedback.ts
// v1 | 2026-06-15 | Job_PM (CPO)
//
// THE single persist+encode helper for a Facu decision on a supply review card.
// The three supply review routes (decide / image-review / content-review) call
// this so the learning signal is written ONCE, identically, and CHECK-compliant.
//
// One Facu decision = a FeedbackPayload. We fan it out into the two existing
// feedback tables (NO migration — reuse columns only):
//
//   supply_recommendation_feedback  (the PRIORITY / ranker signal)
//     decision     <- payload.decision               (CHECK: approve|reject|defer|correct)
//     reason_tags  <- encoded tags (text[])          (NOT NULL default '{}')
//     weight_delta <- priorityDelta (clamped) OR a quality-derived delta
//     target_variety / target_sku, rec_type, decided_by
//   getLearnedRerank reads decision + weight_delta -> changes next ranked order.
//
//   supply_solution_feedback        (the SOLUTION / closure signal)
//     outcome      <- 'pick' (approve) | 'reject' (reject)   (CHECK: pick|reject)
//     reason       <- encoded human-readable reason (tags + find_better + note)
//     lever, target_sku, target_variety, chosen_value, metric_*, decided_by
//   THE REJECT PATH NOW WRITES A ROW (outcome='reject'). The sourcing area reads
//   supply_solution_feedback WHERE outcome='reject' AND reason ILIKE '%find_better%'
//   as the RE-SOURCING flag — no new column needed.
//
// Every DB error is RETURNED (warnings[]), never swallowed — callers surface them
// in the response. Service client only (server-side). ZERO writes to *_mirror.
//
// Enumerated CHECKs verified live (project ibckhcjvyxzrhvdiazbx, 2026-06-15):
//   supply_solution_feedback.outcome        ∈ {pick,reject}
//   supply_recommendation_feedback.decision ∈ {approve,reject,defer,correct}
//   decided_by: free text on both (NO CHECK) — human email captured here.

import type { SupabaseClient } from '@supabase/supabase-js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// SHARED CONTRACT — one Facu decision on a review card.
// ---------------------------------------------------------------------------

export type FeedbackDecision = 'approve' | 'reject';
export type RejectTag = 'wrong_color' | 'not_tinted' | 'low_quality' | 'check_prod' | 'other';
export type QualityRating = 'weak' | 'good' | 'excellent';

export interface FeedbackPayload {
  decision: FeedbackDecision;
  rejectTags?: RejectTag[];
  quality?: QualityRating;
  findBetter?: boolean;
  priorityDelta?: number;
  note?: string;
}

const VALID_REJECT_TAGS: ReadonlySet<RejectTag> = new Set<RejectTag>([
  'wrong_color',
  'not_tinted',
  'low_quality',
  'check_prod',
  'other',
]);
const VALID_QUALITY: ReadonlySet<QualityRating> = new Set<QualityRating>([
  'weak',
  'good',
  'excellent',
]);

/**
 * Parse + narrow an untrusted body into a FeedbackPayload. Returns null when the
 * decision is missing/invalid (the caller returns 400). Unknown tags/qualities are
 * dropped (lossy on garbage, never throws).
 */
export function parseFeedbackPayload(raw: unknown): FeedbackPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const decision =
    o.decision === 'approve' ? 'approve' : o.decision === 'reject' ? 'reject' : null;
  if (!decision) return null;

  const rejectTags = Array.isArray(o.rejectTags)
    ? (o.rejectTags.filter(
        (t): t is RejectTag => typeof t === 'string' && VALID_REJECT_TAGS.has(t as RejectTag),
      ))
    : undefined;

  const quality =
    typeof o.quality === 'string' && VALID_QUALITY.has(o.quality as QualityRating)
      ? (o.quality as QualityRating)
      : undefined;

  const findBetter = typeof o.findBetter === 'boolean' ? o.findBetter : undefined;

  const priorityDelta =
    typeof o.priorityDelta === 'number' && Number.isFinite(o.priorityDelta)
      ? o.priorityDelta
      : undefined;

  const note = typeof o.note === 'string' && o.note.trim().length > 0 ? o.note.trim() : undefined;

  return {
    decision,
    rejectTags: rejectTags && rejectTags.length > 0 ? rejectTags : undefined,
    quality,
    findBetter,
    priorityDelta,
    note,
  };
}

// ---------------------------------------------------------------------------
// Encoding (REUSE existing columns — no new schema).
// ---------------------------------------------------------------------------

// supply_recommendation_feedback.weight_delta is the ONLY signal getLearnedRerank
// reads from this table besides `decision` (reason_tags is ignored by the ranker).
// So if Facu wants QUALITY to move the rank, we DERIVE a weight_delta from it.
// priorityDelta (explicit steer) WINS; else quality maps to a directional nudge;
// else fall back to the decision default. Clamped to the decide-route range.
const QUALITY_DELTA: Record<QualityRating, number> = {
  weak: -8, // a weak asset should not lift this kind of rec
  good: 4,
  excellent: 8,
};
const DECISION_DELTA: Record<FeedbackDecision, number> = {
  approve: 15,
  reject: -40,
};
const WEIGHT_MIN = -20;
const WEIGHT_MAX = 20;

export function deriveWeightDelta(p: FeedbackPayload): number {
  let raw: number;
  if (typeof p.priorityDelta === 'number' && Number.isFinite(p.priorityDelta)) {
    raw = p.priorityDelta;
  } else if (p.quality) {
    raw = QUALITY_DELTA[p.quality];
  } else {
    raw = DECISION_DELTA[p.decision];
  }
  return Math.max(WEIGHT_MIN, Math.min(WEIGHT_MAX, raw));
}

// reason_tags (text[]) — structured-ish tags the activity feed can render. The
// ranker ignores these (see deriveWeightDelta for the rank path); they are the
// human-readable WHY captured for future decisions.
export function buildReasonTags(p: FeedbackPayload): string[] {
  const tags: string[] = [];
  if (p.quality) tags.push(`quality:${p.quality}`);
  for (const t of p.rejectTags ?? []) tags.push(`tag:${t}`);
  if (p.findBetter) tags.push('find_better');
  if (p.note) tags.push(`note:${p.note.slice(0, 200)}`);
  return tags;
}

// supply_solution_feedback.reason (text) — a single readable line the SOURCING
// area greps. MUST contain 'find_better' / 'low_quality' when set so the
// re-sourcing query (outcome='reject' AND reason ILIKE '%find_better%') fires.
export function buildSolutionReason(p: FeedbackPayload): string | null {
  const parts: string[] = [];
  if (p.rejectTags && p.rejectTags.length > 0) parts.push(`tags:${p.rejectTags.join(',')}`);
  if (p.quality) parts.push(`quality:${p.quality}`);
  if (p.findBetter) parts.push('find_better:true');
  if (p.note) parts.push(`note:${p.note.slice(0, 500)}`);
  return parts.length > 0 ? parts.join(';') : null;
}

// The RE-SOURCING signal: a reject that asks for a better asset. True when Facu
// ticked findBetter OR flagged low quality. When true, the reject path writes a
// supply_solution_feedback row whose reason contains 'find_better'/'low_quality'.
export function isReSource(p: FeedbackPayload): boolean {
  return !!p.findBetter || !!p.rejectTags?.includes('low_quality');
}

// ---------------------------------------------------------------------------
// Persist — the single writer the 3 routes call.
// ---------------------------------------------------------------------------

export interface PersistFeedbackArgs {
  payload: FeedbackPayload;
  recType: string; // engine gap_type / lever rec_type (recommendation_feedback)
  lever: string; // closure lever key (solution_feedback): 'image' | 'content' | ...
  variety: string | null;
  // The SKU uuid for solution_feedback.target_sku (and recommendation_feedback
  // .target_sku when uuid). Non-uuid is dropped (FK-safe; columns are uuid).
  skuId?: string | null;
  decidedBy: string; // human email (free-text column; never owner_agent)
  // Optional metric snapshot for the solution_feedback closure math.
  metricBefore?: number | null;
  metricAfter?: number | null;
  chosenValue?: string | null;
  source?: string | null;
  // Write the recommendation_feedback (priority/ranker) row? Default true. The
  // image/content approve path already records solution_feedback for the pick;
  // it also wants the ranker signal, so default on.
  writeRecommendation?: boolean;
  // Write the solution_feedback (closure) row? Default true. On APPROVE this is
  // the 'pick'; on REJECT this is the new outcome='reject' row that was missing.
  writeSolution?: boolean;
}

export interface PersistFeedbackResult {
  ok: boolean;
  warnings: string[];
  recommendationId?: number | null;
  solutionId?: number | null;
  weightDelta: number;
  reasonTags: string[];
  reSource: boolean;
}

function uuidOrNull(v: string | null | undefined): string | null {
  return typeof v === 'string' && UUID_RE.test(v.trim()) ? v.trim() : null;
}

/**
 * Persist one Facu review decision into the two feedback tables, CHECK-compliant.
 * - decision ∈ {approve,reject} (recommendation_feedback CHECK ok — subset of 4)
 * - outcome  ∈ {pick (approve), reject (reject)} (solution_feedback CHECK ok)
 * - priorityDelta/quality -> weight_delta (clamped) so the ranker re-ranks
 * - rejectTags/quality/findBetter/note -> reason_tags (text[]) + reason (text)
 * NEVER throws on a DB error: each failure is pushed to warnings[] and returned
 * so the route surfaces it (no console.error + silent ok).
 */
export async function persistSupplyFeedback(
  svc: SupabaseClient,
  args: PersistFeedbackArgs,
): Promise<PersistFeedbackResult> {
  const { payload } = args;
  const warnings: string[] = [];
  const weightDelta = deriveWeightDelta(payload);
  const reasonTags = buildReasonTags(payload);
  const reason = buildSolutionReason(payload);
  const reSource = isReSource(payload);
  const skuUuid = uuidOrNull(args.skuId);
  const variety = args.variety && args.variety.trim().length > 0 ? args.variety.trim() : null;
  const decidedBy = args.decidedBy && args.decidedBy.length > 0 ? args.decidedBy : 'facu';

  let recommendationId: number | null = null;
  let solutionId: number | null = null;

  // 1) PRIORITY / ranker signal -> supply_recommendation_feedback.
  if (args.writeRecommendation !== false) {
    const { data, error } = await svc
      .from('supply_recommendation_feedback')
      .insert({
        target_variety: variety,
        target_sku: skuUuid,
        rec_type: args.recType,
        decision: payload.decision, // ∈ {approve,reject} ⊂ CHECK {approve,reject,defer,correct}
        reason_tags: reasonTags, // text[] NOT NULL default '{}'
        weight_delta: weightDelta,
        decided_by: decidedBy,
      })
      .select('id')
      .maybeSingle();
    if (error) warnings.push(`recommendation_feedback_failed: ${error.message}`);
    else recommendationId = (data as { id: number } | null)?.id ?? null;
  }

  // 2) SOLUTION / closure signal -> supply_solution_feedback.
  //    APPROVE -> outcome='pick'. REJECT -> outcome='reject' (the row that used to
  //    be DROPPED — without it the ranker/closure could not learn from rejects).
  if (args.writeSolution !== false) {
    const outcome = payload.decision === 'approve' ? 'pick' : 'reject';
    const { data, error } = await svc
      .from('supply_solution_feedback')
      .insert({
        lever: args.lever,
        target_sku: skuUuid,
        target_variety: variety,
        source: args.source ?? null,
        outcome, // ∈ {pick,reject} — CHECK supply_solution_feedback_outcome_check
        chosen_value: args.chosenValue ?? null,
        reason, // readable; contains find_better/low_quality for the sourcing grep
        metric_before: args.metricBefore ?? null,
        metric_after: args.metricAfter ?? null,
        decided_by: decidedBy,
      })
      .select('id')
      .maybeSingle();
    if (error) warnings.push(`solution_feedback_failed: ${error.message}`);
    else solutionId = (data as { id: number } | null)?.id ?? null;
  }

  return {
    ok: warnings.length === 0,
    warnings,
    recommendationId,
    solutionId,
    weightDelta,
    reasonTags,
    reSource,
  };
}
