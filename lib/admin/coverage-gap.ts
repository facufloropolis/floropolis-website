// lib/admin/coverage-gap.ts
// v1 | 2026-06-16 | Job_PM (CPO)
//
// THE coverage-loop SIBLING to loop-ledger.ts. When Job's cost lens has NO or
// WEAK competitor / peer reference for a variety, the proposal does NOT block
// ("sin referencia" is honest, short-term) — instead we RECORD a prioritized
// coverage-gap so Rose/Talin can fill the benchmark data, ranked by
// importance x frequency. The gap CLOSES when the benchmark data lands.
//
// WHY A SIBLING (not a fork of loop-ledger.recordLoopLedger):
//   recordLoopLedger() REFUSES a non-uuid / null sku_id (loop-ledger.ts:270) — it
//   is built for SKU-keyed asset/price loops. Coverage-gaps are VARIETY-keyed, so
//   sku_id IS NULL (valid: improvement_loop_state.sku_id is nullable, 14 existing
//   rows already carry sku_id NULL). We therefore add recordCoverageGap() here
//   rather than weaken loop-ledger's uuid guard.
//
// SPINE REUSE (no new schema, verified 2026-06-16 via pg_constraint):
//   improvement_loop_state has ONLY two CHECK constraints —
//     catalog_repair_state_owner_agent_check: owner_agent IN
//       (Job_PM, Rose_BI, Nahua_AI, Codex)   <- 'Facu' REJECTED; human goes in
//       evidence.decided_by, NEVER owner_agent.
//     catalog_repair_state_state_check: state IN
//       (open, routed, landed, re_scored, verified).
//   There is NO CHECK on .domain (default 'catalog'); live values are
//   catalog(673) / images(39) / admin_ux(7) / orders_data(1). A new value
//   'benchmark_coverage' is INSERTABLE with no migration. We ALSO encode the
//   benchmark-coverage detail in gate_id + evidence so the rows stay
//   identifiable if a future schema-tightening migration ever constrains .domain.
//
// FREQUENCY-DEDUP (the BLOCKER, verified): the partial unique index
//   uq_catalog_repair_state_sku_gate_open ON (sku_id, gate_id) WHERE
//   state<>'verified' does NOT dedup our rows, because Postgres btree treats NULL
//   sku_id as DISTINCT — two (NULL, same gate_id) rows would BOTH be allowed,
//   inflating the frequency count and breaking the priority ranking. So
//   recordCoverageGap() does an EXPLICIT select-then-update on
//   (gate_id, sku_id IS NULL, state<>'verified'): it transitions / increments the
//   existing open row instead of blind-inserting. Deterministic gate_id keeps the
//   same logical variety on ONE row.
//
// HARD BAR: ZERO writes to dim_sku (Rose applies, flow B) / *_mirror / mirror.* /
// admin_proposals. Service client only (server-side). DB errors are RETURNED to
// the caller (never swallowed) so the page can surface them via warnings[].

import type { SupabaseClient } from '@supabase/supabase-js';

// The benchmark-coverage domain value (no CHECK on .domain today; the gate_id
// prefix + evidence keep the row identifiable if .domain is ever constrained).
export const COVERAGE_DOMAIN = 'benchmark_coverage';
// gate_id prefix: 'benchmark_coverage:'||variety. Deterministic so the same
// logical variety always maps to ONE row (frequency dedup), per the spec.
export const COVERAGE_GATE_PREFIX = 'benchmark_coverage:';
// Coverage-gaps are Job's lane (pricing vs competitor = product_strategy); the
// EXECUTING owner_agent is Job_PM. Rose/Talin are the routed_via fill target.
const COVERAGE_OWNER_AGENT = 'Job_PM';

// Which reference lens is thin for this variety. 'competitor' = no/weak
// market_variety_crosswalk row; 'peer' = no peer canonical_cost reference.
export type MissingLens = 'competitor' | 'peer';

// Normalize a variety to the gate_id key. MUST match how the cost lens + the
// crosswalk (our_variety_l) + supply_importance_signal (variety_l) resolve a
// variety, or the same logical variety splits across distinct gate_ids and the
// frequency count fragments (per RISKS). trim + lowercase + collapse whitespace.
export function normalizeCoverageVariety(variety: string | null | undefined): string {
  return (variety ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// Build the deterministic gate_id for a variety's coverage-gap.
export function coverageGateId(variety: string | null | undefined): string {
  return `${COVERAGE_GATE_PREFIX}${normalizeCoverageVariety(variety)}`;
}

export interface CoverageEvidence {
  variety: string; // normalized variety key
  missing_lens: MissingLens[]; // which lens(es) lack a reference
  importance: number; // supply_importance_signal.weight (0 floor when absent)
  importance_provenance: string | null; // tag the weight provenance (honest)
  frequency: number; // how many times this gap was hit (dedup increments this)
  decided_by?: string | null; // the HUMAN (e.g. 'Facu') when a person triggered it
  crosswalk_rows: number; // n_rows behind the (weak) competitor reference, 0 if absent
  benchmark_pps: number | null; // null while uncovered; lands when Rose/Talin fill
}

export interface RecordCoverageGapArgs {
  variety: string;
  missingLens: MissingLens[]; // at least one lens that is thin/absent
  importance?: number; // supply_importance_signal.weight; floor 0 when absent
  importanceProvenance?: string | null;
  decidedBy?: string | null; // human approver, captured in evidence (NOT owner_agent)
  crosswalkRows?: number; // weak-coverage n_rows (0 when absent)
  benchmarkPps?: number | null; // null while uncovered
  // Route the gap to the fill owner (Rose for benchmark data / Talin for market
  // intel). Stored in routed_via; transitions state open -> routed.
  routedVia?: string | null;
}

export interface RecordCoverageGapResult {
  ok: boolean;
  id?: string;
  state?: string;
  frequency?: number;
  created?: boolean; // true = inserted fresh; false = transitioned an existing open row
  error?: string;
}

function toInt(v: unknown, floor = 0): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : floor;
}

/**
 * Record / increment ONE coverage-gap row for a variety on the
 * improvement_loop_state spine. Idempotent per variety:
 *   - looks up an existing OPEN/routed row by (gate_id, sku_id IS NULL,
 *     state<>'verified') — the partial unique index does NOT do this for us
 *     because NULL sku_id is treated as DISTINCT (the dedup BLOCKER), so the
 *     lookup is mandatory;
 *   - if found, INCREMENTS evidence.frequency (merging missing_lens + refreshing
 *     importance) and routes it (open -> routed) when a routedVia is given;
 *   - if not, INSERTS a fresh row at state 'open' (or 'routed' with routedVia).
 *
 * Writes: improvement_loop_state ONLY. owner_agent='Job_PM' (the human approver
 * is evidence.decided_by — 'Facu' is REJECTED by the CHECK). sku_id=NULL
 * (variety-keyed). domain='benchmark_coverage' (no CHECK) + gate_id/evidence
 * fallback. NEVER touches dim_sku / admin_proposals / *_mirror.
 *
 * Returns a typed result; DB errors are RETURNED (never thrown / swallowed) so
 * the caller surfaces them via warnings[].
 */
export async function recordCoverageGap(
  svc: SupabaseClient,
  args: RecordCoverageGapArgs,
): Promise<RecordCoverageGapResult> {
  const variety = normalizeCoverageVariety(args.variety);
  if (!variety) return { ok: false, error: 'invalid_variety' };
  const lenses = Array.from(new Set((args.missingLens ?? []).filter((l): l is MissingLens => l === 'competitor' || l === 'peer')));
  if (lenses.length === 0) return { ok: false, error: 'no_missing_lens' };

  const gateId = coverageGateId(variety);
  // Importance floors at 0 (the long tail with no weight signal ranks on
  // frequency alone, tagged provenance — honest 'sin referencia', never crash).
  const importance = Math.max(0, toInt(args.importance, 0));
  const importanceProvenance = (args.importanceProvenance ?? null) || null;
  const decidedBy = (args.decidedBy ?? null) || null;
  const crosswalkRows = Math.max(0, toInt(args.crosswalkRows, 0));
  const benchmarkPps =
    args.benchmarkPps == null || !Number.isFinite(Number(args.benchmarkPps))
      ? null
      : Number(args.benchmarkPps);
  const routedVia = (args.routedVia ?? null) || null;
  const nowIso = new Date().toISOString();

  // EXPLICIT dedup lookup: the partial unique index cannot enforce it for
  // NULL sku_id, so we find the existing open/routed row by gate_id here.
  const { data: existing, error: selErr } = await svc
    .from('improvement_loop_state')
    .select('id, state, evidence, routed_via, opened_at, routed_at')
    .eq('gate_id', gateId)
    .is('sku_id', null)
    .neq('state', 'verified')
    .maybeSingle();
  if (selErr) return { ok: false, error: selErr.message };

  if (existing && (existing as { id: string }).id) {
    const ex = existing as {
      id: string;
      state: string | null;
      evidence: unknown;
      routed_via: string | null;
      routed_at: string | null;
    };
    const prev = (ex.evidence && typeof ex.evidence === 'object' ? ex.evidence : {}) as Partial<CoverageEvidence>;
    const prevLenses = Array.isArray(prev.missing_lens) ? prev.missing_lens : [];
    const mergedLenses = Array.from(new Set([...prevLenses, ...lenses])) as MissingLens[];
    const nextFrequency = Math.max(1, toInt(prev.frequency, 0)) + 1;
    const evidence: CoverageEvidence = {
      variety,
      missing_lens: mergedLenses,
      importance,
      importance_provenance: importanceProvenance,
      frequency: nextFrequency,
      decided_by: decidedBy ?? prev.decided_by ?? null,
      crosswalk_rows: crosswalkRows,
      benchmark_pps: benchmarkPps,
    };
    // open -> routed once a fill target is named; otherwise keep current state.
    const nextState = routedVia && ex.state === 'open' ? 'routed' : ex.state ?? 'open';
    const { data: upd, error: updErr } = await svc
      .from('improvement_loop_state')
      .update({
        state: nextState,
        evidence,
        routed_via: routedVia ?? ex.routed_via,
        routed_at: nextState === 'routed' ? ex.routed_at ?? nowIso : ex.routed_at,
      })
      .eq('id', ex.id)
      .select('id, state')
      .maybeSingle();
    if (updErr) return { ok: false, error: updErr.message };
    return {
      ok: true,
      id: (upd as { id: string } | null)?.id ?? ex.id,
      state: (upd as { state: string } | null)?.state ?? nextState,
      frequency: nextFrequency,
      created: false,
    };
  }

  // Fresh gap: state 'routed' if we already have a fill target, else 'open'.
  const initialState = routedVia ? 'routed' : 'open';
  const evidence: CoverageEvidence = {
    variety,
    missing_lens: lenses,
    importance,
    importance_provenance: importanceProvenance,
    frequency: 1,
    decided_by: decidedBy,
    crosswalk_rows: crosswalkRows,
    benchmark_pps: benchmarkPps,
  };
  const { data: ins, error: insErr } = await svc
    .from('improvement_loop_state')
    .insert({
      sku_id: null,
      gate_id: gateId,
      state: initialState,
      owner_agent: COVERAGE_OWNER_AGENT,
      domain: COVERAGE_DOMAIN,
      routed_via: routedVia,
      evidence,
      opened_at: nowIso,
      routed_at: initialState === 'routed' ? nowIso : null,
    })
    .select('id, state')
    .maybeSingle();
  if (insErr) return { ok: false, error: insErr.message };
  return {
    ok: true,
    id: (ins as { id: string } | null)?.id,
    state: (ins as { state: string } | null)?.state ?? initialState,
    frequency: 1,
    created: true,
  };
}

export interface CoverageGapRow {
  id: string;
  variety: string;
  gateId: string;
  state: string; // open | routed | re_scored | verified
  missingLens: MissingLens[];
  importance: number; // supply_importance_signal.weight (0 floor)
  importanceProvenance: string | null;
  frequency: number;
  priority: number; // importance x frequency (frequency-only when importance 0)
  crosswalkRows: number;
  benchmarkPps: number | null; // null while uncovered; set when data lands
  decidedBy: string | null;
  routedVia: string | null;
  openedAt: string | null;
}

export interface CoverageGapList {
  gaps: CoverageGapRow[]; // descending by priority
  openCount: number;
  routedCount: number;
  warnings: string[]; // DB errors surfaced honestly (never swallowed)
}

/**
 * Read the open/routed/re_scored coverage-gaps off the spine, ranked by
 * priority = importance x frequency (frequency-only floor when importance is 0,
 * per RISKS — the long tail never silently drops). 'verified' gaps (benchmark
 * data landed) are excluded — they have left the loop. Never throws; any DB
 * error is returned in warnings[] so the page surfaces it.
 */
export async function listCoverageGaps(svc: SupabaseClient): Promise<CoverageGapList> {
  const out: CoverageGapList = { gaps: [], openCount: 0, routedCount: 0, warnings: [] };
  const { data, error } = await svc
    .from('improvement_loop_state')
    .select('id, gate_id, state, evidence, routed_via, opened_at, sku_id, domain')
    .eq('domain', COVERAGE_DOMAIN)
    .is('sku_id', null)
    .neq('state', 'verified')
    .limit(2000);
  if (error) {
    out.warnings.push(`coverage-gaps read: ${error.message}`);
    return out;
  }
  for (const r of (data ?? []) as Array<{
    id: string;
    gate_id: string | null;
    state: string | null;
    evidence: unknown;
    routed_via: string | null;
    opened_at: string | null;
  }>) {
    // gate_id fallback identity: rows must carry the benchmark_coverage prefix
    // (so they remain identifiable even if .domain is later constrained away).
    const gateId = (r.gate_id ?? '').trim();
    if (!gateId.startsWith(COVERAGE_GATE_PREFIX)) continue;
    const ev = (r.evidence && typeof r.evidence === 'object' ? r.evidence : {}) as Partial<CoverageEvidence>;
    const variety = (ev.variety ?? gateId.slice(COVERAGE_GATE_PREFIX.length)).trim();
    const lenses = (Array.isArray(ev.missing_lens) ? ev.missing_lens : []).filter(
      (l): l is MissingLens => l === 'competitor' || l === 'peer',
    );
    const importance = Math.max(0, toInt(ev.importance, 0));
    const frequency = Math.max(1, toInt(ev.frequency, 1));
    // priority = importance x frequency; when importance is 0 (no weight signal),
    // fall back to frequency alone so the gap still ranks (never drops to 0/hidden).
    const priority = importance > 0 ? importance * frequency : frequency;
    const state = (r.state ?? 'open').trim();
    out.gaps.push({
      id: r.id,
      variety,
      gateId,
      state,
      missingLens: lenses,
      importance,
      importanceProvenance: ev.importance_provenance ?? null,
      frequency,
      priority,
      crosswalkRows: Math.max(0, toInt(ev.crosswalk_rows, 0)),
      benchmarkPps:
        ev.benchmark_pps == null || !Number.isFinite(Number(ev.benchmark_pps))
          ? null
          : Number(ev.benchmark_pps),
      decidedBy: ev.decided_by ?? null,
      routedVia: r.routed_via ?? null,
      openedAt: r.opened_at ?? null,
    });
    if (state === 'open') out.openCount += 1;
    else if (state === 'routed') out.routedCount += 1;
  }
  out.gaps.sort((a, b) => b.priority - a.priority || b.frequency - a.frequency || a.variety.localeCompare(b.variety));
  return out;
}
