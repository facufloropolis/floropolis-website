// lib/admin/loop-ledger.ts
// v1 | 2026-06-15 | Job_PM (CPO)
//
// THE shared closer + ledger contract for the supply loop. Both the apply-* routes
// (apply-image / apply-content) AND the review-queue routes (image-review /
// content-review / price-review) consume this module so a Facu decision actually
// CLOSES the loop and is RECORDED, instead of a shallow product_chrome-only update.
//
//   closeAssetGate(svc, { skuIds, gate, asset })
//     The single asset closer for the IMAGE and CONTENT levers. For the given SKU
//     uuids: (1) write the asset into product_chrome (append+dedupe images, or set
//     description), (2) CLEAR the failing gate in catalog_classifications,
//     recompute blocking_gate_count and flip status -> publishable when none left,
//     (3) RE-READ v_supply_recommendations + catalog_classifications independently
//     so the caller reports the REAL metric move (gate gone, left the lever,
//     publishable). The OLD shallow product_chrome.update in the review routes is
//     REPLACED by this — never run both (would decrement blocking_gate_count twice).
//     NOTE: price is NOT asset-closable; price-review uses recordLoopLedger
//     (targetState='landed') + an admin_proposals handoff, never closeAssetGate.
//
//   recordLoopLedger(svc, { skuId, gateId, domain, targetState, routedVia?, evidence })
//     Writes the improvement_loop_state row that lets the streak advance from a
//     Facu decision (today nobody writes it; 42 verified are a frozen seed). It
//     VALIDATES skuId is a real uuid (review tables store sku_id as TEXT,
//     improvement_loop_state.sku_id is UUID) and refuses with a typed error on a
//     non-uuid value (never a malformed insert). It UPSERTs onto the partial-unique
//     key (sku_id, gate_id) WHERE state<>'verified' — transitioning the existing
//     OPEN/landed row to landed/verified rather than duplicate-inserting (which
//     would violate uq_catalog_repair_state_sku_gate_open). Re-running is a no-op.
//
// HARD BAR: ZERO writes to *_mirror / mirror.* . Service client only (server-side).

import type { SupabaseClient } from '@supabase/supabase-js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AssetGate = 'missing_image' | 'missing_contents_description';
export type LoopDomain = 'images' | 'content' | 'price' | 'catalog' | 'benchmark_coverage';
export type LoopTargetState = 'landed' | 'verified';

// Map a failing-gate token to the lever the view derives from it. Used to check
// the SKU left the SPECIFIC gate's lever (not "absent from the whole view" — a SKU
// with another gate of the same class correctly stays under that lever).
const GATE_LEVER: Record<AssetGate, string> = {
  missing_image: 'image',
  missing_contents_description: 'content',
};

function imgLen(images: unknown): number {
  return Array.isArray(images) ? images.length : 0;
}
function appendDedupe(images: unknown, urls: string[]): { next: string[]; changed: boolean } {
  const cur: string[] = Array.isArray(images)
    ? images.filter((el): el is string => typeof el === 'string')
    : [];
  const next = [...cur];
  let changed = false;
  for (const u of urls) {
    if (!next.includes(u)) {
      next.push(u);
      changed = true;
    }
  }
  return { next, changed };
}
function hasGate(failingGates: unknown, gate: string): boolean {
  return Array.isArray(failingGates) && failingGates.some((g) => g === gate);
}
function clearGate(failingGates: unknown, gate: string): string[] {
  if (!Array.isArray(failingGates)) return [];
  return failingGates.filter((g): g is string => typeof g === 'string' && g !== gate);
}

interface ClassRow {
  sku_id: string;
  failing_gates: unknown;
  blocking_gate_count: number | null;
  status: string | null;
}

export interface CloseAssetGateArgs {
  skuIds: string[]; // uuid strings; non-uuid values are skipped (no malformed write)
  gate: AssetGate;
  asset: { images?: string[] } | { description?: string };
}

export interface CloseAssetGateResult {
  gatesCleared: number;
  closed: number; // left the gate's lever AND gate gone
  nowPublishable: number;
  assetWritten: number;
  statusAfter: Map<string, { status: string | null; failing: unknown }>;
}

/**
 * The EXTRACTED single closer for image/content. Writes the asset, clears the
 * gate, recomputes blocking_gate_count/status, re-reads the view + classification.
 * Operates on an explicit set of SKU uuids (the review path passes the candidate's
 * one sku; the apply-* path can pass its gap set).
 */
export async function closeAssetGate(
  svc: SupabaseClient,
  args: CloseAssetGateArgs,
): Promise<CloseAssetGateResult> {
  const { gate, asset } = args;
  const empty: CloseAssetGateResult = {
    gatesCleared: 0,
    closed: 0,
    nowPublishable: 0,
    assetWritten: 0,
    statusAfter: new Map(),
  };

  // Only real uuids reach product_chrome/catalog_classifications (uuid PKs).
  const skuIds = Array.from(new Set(args.skuIds.filter((s) => typeof s === 'string' && UUID_RE.test(s))));
  if (skuIds.length === 0) return empty;

  const lever = GATE_LEVER[gate];
  const nowIso = new Date().toISOString();

  // 1) Read current chrome (for append/dedupe) + classifications (for gate math).
  const { data: chromeRows } = await svc
    .from('product_chrome')
    .select('sku_id, images')
    .in('sku_id', skuIds);
  const chromeBySku = new Map<string, unknown>();
  for (const r of (chromeRows ?? []) as { sku_id: string; images: unknown }[]) {
    chromeBySku.set(r.sku_id, r.images);
  }

  const { data: classRows } = await svc
    .from('catalog_classifications')
    .select('sku_id, failing_gates, blocking_gate_count, status')
    .in('sku_id', skuIds);
  const classBySku = new Map<string, ClassRow>();
  for (const r of (classRows ?? []) as ClassRow[]) classBySku.set(r.sku_id, r);

  // 2) Write the asset into product_chrome (idempotent).
  let assetWritten = 0;
  const isImage = gate === 'missing_image';
  if (isImage) {
    const urls = ('images' in asset ? asset.images : undefined) ?? [];
    const valid = urls.filter((u) => typeof u === 'string' && /^https?:\/\//i.test(u) && u.length <= 2000);
    if (valid.length > 0) {
      const payload: { sku_id: string; images: string[]; matched_by: string; updated_at: string }[] = [];
      for (const id of skuIds) {
        const { next, changed } = appendDedupe(chromeBySku.get(id), valid);
        if (changed) payload.push({ sku_id: id, images: next, matched_by: 'supply_review_close', updated_at: nowIso });
      }
      if (payload.length > 0) {
        const { error, count } = await svc
          .from('product_chrome')
          .upsert(payload, { onConflict: 'sku_id', count: 'exact' });
        if (!error) assetWritten = count ?? payload.length;
      }
    }
  } else {
    const text = 'description' in asset ? (asset.description ?? '').trim() : '';
    if (text.length >= 3) {
      const desc = text.slice(0, 4000);
      const payload = skuIds.map((id) => ({
        sku_id: id,
        description: desc,
        matched_by: 'supply_review_close',
        updated_at: nowIso,
      }));
      const { error, count } = await svc
        .from('product_chrome')
        .upsert(payload, { onConflict: 'sku_id', count: 'exact' });
      if (!error) assetWritten = count ?? payload.length;
    }
  }

  // 3) CLEAR the gate -> publishable when no blocking gate remains. Read the
  //    CURRENT row's blocking_gate_count (not a stale snapshot); skip SKUs that no
  //    longer carry the gate (idempotent, no double-decrement).
  let gatesCleared = 0;
  for (const id of skuIds) {
    const cls = classBySku.get(id);
    if (!cls || !hasGate(cls.failing_gates, gate)) continue;
    const nextGates = clearGate(cls.failing_gates, gate);
    const nextBlocking = Math.max(0, (cls.blocking_gate_count ?? 0) - 1);
    const nextStatus = nextBlocking === 0 ? 'publishable' : cls.status ?? 'blocked';
    const { error } = await svc
      .from('catalog_classifications')
      .update({
        failing_gates: nextGates,
        blocking_gate_count: nextBlocking,
        status: nextStatus,
        last_changed_at: nowIso,
        last_validated_at: nowIso,
      })
      .eq('sku_id', id);
    if (!error) gatesCleared += 1;
  }

  // 4) RE-READ engine + classification independently to confirm closure.
  const { data: recheckRecs } = await svc
    .from('v_supply_recommendations')
    .select('sku_id, gap_type')
    .in('sku_id', skuIds);
  const gapTypeAfter = new Map<string, string | null>();
  for (const r of (recheckRecs ?? []) as { sku_id: string; gap_type: string | null }[]) {
    gapTypeAfter.set(r.sku_id, r.gap_type);
  }
  const { data: recheckClass } = await svc
    .from('catalog_classifications')
    .select('sku_id, status, failing_gates')
    .in('sku_id', skuIds);
  const statusAfter = new Map<string, { status: string | null; failing: unknown }>();
  for (const r of (recheckClass ?? []) as ClassRow[]) {
    statusAfter.set(r.sku_id, { status: r.status, failing: r.failing_gates });
  }

  let closed = 0;
  let nowPublishable = 0;
  for (const id of skuIds) {
    const st = statusAfter.get(id);
    const gateGone = st ? !hasGate(st.failing, gate) : true;
    // Left THIS gate's lever (a different lever for another remaining gate is fine).
    const gt = gapTypeAfter.get(id);
    const leftLever = gt !== lever;
    if (gateGone && leftLever) closed += 1;
    if ((st?.status ?? '') === 'publishable') nowPublishable += 1;
  }

  return { gatesCleared, closed, nowPublishable, assetWritten, statusAfter };
}

// The ONLY owner_agent values the DB accepts (CHECK catalog_repair_state_owner_agent_check).
// 'Facu' is the human approver and is REJECTED by the constraint — capture him as
// evidence.decided_by, NEVER as owner_agent (that's the executing agent, Job_PM).
export const ALLOWED_OWNER_AGENTS = ['Job_PM', 'Rose_BI', 'Nahua_AI', 'Codex'] as const;
export type OwnerAgent = (typeof ALLOWED_OWNER_AGENTS)[number];
const DEFAULT_OWNER_AGENT: OwnerAgent = 'Job_PM';

export interface RecordLoopLedgerArgs {
  skuId: string; // text from review tables; validated + cast to uuid here
  gateId: string;
  domain: LoopDomain;
  // MUST be in ALLOWED_OWNER_AGENTS; defaults to 'Job_PM' (the executing agent).
  // The DB CHECK rejects anything else (incl. 'Facu'); a bad value is coerced to
  // the default so the insert is never silently rejected.
  ownerAgent?: OwnerAgent;
  targetState: LoopTargetState; // 'verified' (asset closed) | 'landed' (governed handoff)
  routedVia?: string;
  evidence: { fix: unknown; before: unknown; after: unknown };
}

export interface RecordLoopLedgerResult {
  ok: boolean;
  id?: string;
  error?: string;
}

/**
 * Upsert/transition the improvement_loop_state row for (sku_id, gate_id). The
 * partial unique index uq_catalog_repair_state_sku_gate_open (WHERE state<>'verified')
 * means a blind insert on re-approve would collide with an existing open/landed
 * row, so we transition that row instead. Validates the text sku_id is a real uuid
 * and refuses (typed error, NO insert) otherwise — improvement_loop_state.sku_id is
 * UUID and a malformed value would error / silently no-op against the NOT NULL
 * evidence/owner/domain columns.
 */
export async function recordLoopLedger(
  svc: SupabaseClient,
  args: RecordLoopLedgerArgs,
): Promise<RecordLoopLedgerResult> {
  const skuId = typeof args.skuId === 'string' ? args.skuId.trim() : '';
  if (!UUID_RE.test(skuId)) {
    return { ok: false, error: 'invalid_sku_uuid' };
  }
  if (typeof args.gateId !== 'string' || args.gateId.length === 0) {
    return { ok: false, error: 'invalid_gate_id' };
  }

  // Route owner_agent ONLY through the allowed set; coerce any out-of-set value
  // (e.g. a stray 'Facu') to the default so the DB CHECK can never reject the insert.
  const ownerAgent: OwnerAgent =
    args.ownerAgent && (ALLOWED_OWNER_AGENTS as readonly string[]).includes(args.ownerAgent)
      ? args.ownerAgent
      : DEFAULT_OWNER_AGENT;
  const nowIso = new Date().toISOString();
  const isVerified = args.targetState === 'verified';

  // Find an existing OPEN row (state<>'verified') for this (sku, gate) — the seed
  // already has one for our probe SKU. Transition it; otherwise insert fresh.
  const { data: existing } = await svc
    .from('improvement_loop_state')
    .select('id, state, opened_at, routed_at, landed_at')
    .eq('sku_id', skuId)
    .eq('gate_id', args.gateId)
    .neq('state', 'verified')
    .maybeSingle();

  const base = {
    state: args.targetState,
    owner_agent: ownerAgent,
    domain: args.domain,
    routed_via: args.routedVia ?? null,
    evidence: args.evidence,
    routed_at: nowIso,
    landed_at: nowIso, // both 'landed' and 'verified' have landed
    verified_at: isVerified ? nowIso : null,
  };

  if (existing && (existing as { id: string }).id) {
    const ex = existing as { id: string; opened_at: string | null; routed_at: string | null; landed_at: string | null };
    const { data: upd, error: updErr } = await svc
      .from('improvement_loop_state')
      .update({
        ...base,
        routed_at: ex.routed_at ?? nowIso,
        landed_at: ex.landed_at ?? nowIso,
      })
      .eq('id', ex.id)
      .select('id')
      .maybeSingle();
    if (updErr) return { ok: false, error: updErr.message };
    return { ok: true, id: (upd as { id: string } | null)?.id ?? ex.id };
  }

  const { data: ins, error: insErr } = await svc
    .from('improvement_loop_state')
    .insert({
      sku_id: skuId,
      gate_id: args.gateId,
      opened_at: nowIso,
      ...base,
    })
    .select('id')
    .maybeSingle();
  if (insErr) return { ok: false, error: insErr.message };
  return { ok: true, id: (ins as { id: string } | null)?.id };
}

export interface RecordCoverageGapArgs {
  // The gate token for the coverage gap (e.g. 'cost_benchmark_missing'). Used as
  // gate_id; combined with domain it forms the de-dupe key.
  gateId: string;
  // 'benchmark_coverage' for a missing competitor/peer reference. The DB has NO
  // domain CHECK (verified 2026-06-16: only owner_agent + state CHECKs exist), so
  // an arbitrary domain text is accepted.
  domain: LoopDomain;
  // Who fills the gap. Defaults to Rose_BI (owns the reference data). Coerced to
  // the allowed set so the owner_agent CHECK can never reject the insert.
  ownerAgent?: OwnerAgent;
  // Optional real SKU uuid. When the gap has no specific SKU (a variety-level
  // coverage hole), leave undefined -> sku_id NULL (the FK to dim_sku is nullable;
  // ON DELETE CASCADE only matters when set).
  skuId?: string | null;
  routedVia?: string;
  // Provenance + priority. evidence is NOT NULL jsonb; we always pass an object.
  evidence: Record<string, unknown>;
}

/**
 * Record a PRIORITIZED coverage gap (a missing benchmark/peer reference) into the
 * improvement_loop_state spine WITHOUT requiring a SKU uuid. Sibling of
 * recordLoopLedger — it does NOT fork the table; it shares the same row contract,
 * only relaxing the uuid requirement (sku_id NULL allowed) and de-duping on
 * (gate_id, domain) instead of (sku_id, gate_id).
 *
 * WHY a separate de-dupe path: the partial-unique index
 * uq_catalog_repair_state_sku_gate_open is on (sku_id, gate_id) WHERE state<>'verified'.
 * With sku_id NULL, Postgres treats every row as DISTINCT (NULL != NULL), so a blind
 * insert would pile up duplicate coverage rows. We therefore lookup an existing OPEN
 * row matching (gate_id, domain, sku_id IS NULL) and refresh it in place; otherwise
 * insert one. Re-running is idempotent.
 *
 * ALWAYS state='open' (a gap is unresolved until the data lands). owner_agent
 * defaults to Rose_BI. Never blocks the caller — missing data is honest, not fatal.
 */
export async function recordCoverageGap(
  svc: SupabaseClient,
  args: RecordCoverageGapArgs,
): Promise<RecordLoopLedgerResult> {
  if (typeof args.gateId !== 'string' || args.gateId.length === 0) {
    return { ok: false, error: 'invalid_gate_id' };
  }
  // Only a real uuid reaches sku_id; anything else -> NULL (no malformed write,
  // the FK to dim_sku stays satisfied).
  const skuId =
    typeof args.skuId === 'string' && UUID_RE.test(args.skuId.trim())
      ? args.skuId.trim()
      : null;

  const ownerAgent: OwnerAgent =
    args.ownerAgent && (ALLOWED_OWNER_AGENTS as readonly string[]).includes(args.ownerAgent)
      ? args.ownerAgent
      : 'Rose_BI';
  const nowIso = new Date().toISOString();

  // De-dupe on (gate_id, domain) for the no-SKU case; (sku_id, gate_id, domain)
  // when a SKU is present.
  let lookup = svc
    .from('improvement_loop_state')
    .select('id')
    .eq('gate_id', args.gateId)
    .eq('domain', args.domain)
    .neq('state', 'verified');
  lookup = skuId === null ? lookup.is('sku_id', null) : lookup.eq('sku_id', skuId);
  const { data: existing } = await lookup.maybeSingle();

  if (existing && (existing as { id: string }).id) {
    const id = (existing as { id: string }).id;
    const { error: updErr } = await svc
      .from('improvement_loop_state')
      .update({
        state: 'open',
        owner_agent: ownerAgent,
        domain: args.domain,
        routed_via: args.routedVia ?? null,
        evidence: args.evidence,
      })
      .eq('id', id);
    if (updErr) return { ok: false, error: updErr.message };
    return { ok: true, id };
  }

  const { data: ins, error: insErr } = await svc
    .from('improvement_loop_state')
    .insert({
      sku_id: skuId,
      gate_id: args.gateId,
      state: 'open',
      owner_agent: ownerAgent,
      domain: args.domain,
      routed_via: args.routedVia ?? null,
      evidence: args.evidence,
      opened_at: nowIso,
    })
    .select('id')
    .maybeSingle();
  if (insErr) return { ok: false, error: insErr.message };
  return { ok: true, id: (ins as { id: string } | null)?.id };
}
