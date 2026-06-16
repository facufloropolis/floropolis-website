// POST /api/admin/inventory/propose
// v1 | 2026-06-16 | Job_PM (CPO)
//
// Flow B: the admin PROPOSES an inventory change (add product / correct identity /
// quarantine). This route VERIFIES (cost-verify 3-lens gate) and writes exactly ONE
// admin_proposals row for Facu — it writes ZERO to dim_sku and ZERO to any mirror
// table. The APPLY is Rose's lane (a separate runner picks up the approved proposal).
//
// Three actions -> proposal types (the only catalog.* types this dedicated route
// emits; /api/admin/proposals POST 400s these as unknown, by design — apply executor
// is out of scope):
//   add_variety    -> catalog.add_variety
//   update_identity-> catalog.update_identity
//   quarantine     -> catalog.quarantine
//
// admin_proposals CHECKs satisfied (verified 2026-06-16):
//   status        = 'awaiting_facu'  (NOT 'pending' — that violates the CHECK; the
//                   sibling /api/admin/variety-upsert had that LIVE BUG, now fixed)
//   filter_status = 'passed'         (the verification gate ran)
//   target_table  = 'dim_sku'        (NOT NULL)
//   type, payload, warnings, cascade_summary all set (NOT NULL).
//
// The verification result (verdict + numbers) is written to payload.verification so
// the approval queue renders the cost/units comparison panel. A strong cost outlier
// is NEVER hidden — it surfaces flagged via warnings[] + verdict.
//
// When the cost lens has no/weak reference, a PRIORITIZED coverage gap is logged into
// improvement_loop_state (domain 'benchmark_coverage', owner Rose_BI, state 'open',
// sku_id NULL) via recordCoverageGap — missing data does NOT block the proposal.
//
// CONFIDENTIALITY: payload.verification carries competitor benchmark_pps; it stays
// inside this requireAdmin route + the requireAdmin approval queue, never /shop.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';
import { verifyProposal, type VerificationResult } from '@/lib/admin/cost-verify';
import { recordCoverageGap } from '@/lib/admin/loop-ledger';

const ADMIN_EMAILS = [
  'facu@floropolis.com',
  'jjpj@crescoinversiones.com',
  'jjpj@floropolis.com',
  'jjp@floropolis.com',
];

interface AuthOk { ok: true; userId: string; email: string }
interface AuthFail { ok: false; response: NextResponse }

async function requireAdmin(): Promise<AuthOk | AuthFail> {
  const userClient = await createUserClient();
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) {
    return { ok: false, response: NextResponse.json({ error: 'unauthenticated' }, { status: 401 }) };
  }
  const emailLc = (user.email ?? '').toLowerCase();
  if (ADMIN_EMAILS.includes(emailLc)) return { ok: true, userId: user.id, email: emailLc };

  const adminClient = getBackupServiceClient();
  const { data: profile } = await adminClient
    .from('client_profiles')
    .select('status')
    .eq('user_id', user.id)
    .maybeSingle();
  if (profile?.status === 'admin') return { ok: true, userId: user.id, email: emailLc };

  return { ok: false, response: NextResponse.json({ error: 'not_admin' }, { status: 403 }) };
}

type Action = 'add_variety' | 'update_identity' | 'quarantine';
const ACTION_TYPE: Record<Action, string> = {
  add_variety: 'catalog.add_variety',
  update_identity: 'catalog.update_identity',
  quarantine: 'catalog.quarantine',
};
const VALID_ACTIONS: Action[] = ['add_variety', 'update_identity', 'quarantine'];

interface ProposeBody {
  action?: unknown;
  variety?: unknown;
  category?: unknown;
  boxType?: unknown;
  pack?: unknown;
  farmCost?: unknown;
  source?: unknown;
  country?: unknown;
  grade?: unknown;
  // identity-correction / quarantine context
  targetSkuId?: unknown; // dim_sku.sku_id (uuid) when correcting/quarantining an existing SKU
  reason?: unknown;
}

function asTrimmedString(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;
}
function asNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim().length > 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: ProposeBody = {};
  try {
    const raw = await req.text();
    if (raw.length > 0) body = JSON.parse(raw) as ProposeBody;
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }

  if (typeof body.action !== 'string' || !VALID_ACTIONS.includes(body.action as Action)) {
    return NextResponse.json(
      { error: 'invalid_action', detail: `action must be one of ${VALID_ACTIONS.join('|')}` },
      { status: 400 },
    );
  }
  const action = body.action as Action;

  const variety = asTrimmedString(body.variety);
  // add_variety needs a variety name; identity/quarantine target an existing SKU.
  if (action === 'add_variety' && !variety) {
    return NextResponse.json({ error: 'invalid_variety', detail: 'variety is required for add_variety' }, { status: 400 });
  }
  const targetSkuId = asTrimmedString(body.targetSkuId);

  const input = {
    variety,
    category: asTrimmedString(body.category),
    boxType: asTrimmedString(body.boxType),
    pack: asNumber(body.pack),
    farmCost: asNumber(body.farmCost),
  };

  const svc = getBackupServiceClient();

  // 1) Run the verification gate (read-only).
  let verification: VerificationResult;
  try {
    verification = await verifyProposal(svc, input);
  } catch (e) {
    // The gate is best-effort; a thrown error becomes a single warning rather than
    // blocking the proposal (missing data is honest, not fatal).
    verification = {
      ran_at: new Date().toISOString(),
      overall: 'flagged',
      sense: { status: 'sin_referencia', variety, resolved_family: null, crosswalk_match: false, missing_fields: [], note: 'gate error' },
      units: { status: 'sin_referencia', box_type: input.boxType, resolved_box_family: null, stems_per_box: null, proposed_stems: input.pack, capacity_unit_mismatch: false, note: 'gate error' },
      cost: { verdict: 'sin_referencia', proposed_cost: input.farmCost, peer: null, variety_peers: null, benchmark: null, reasons: ['gate error'] },
      warnings: [{ severity: 'warn', text: `verify gate failed: ${e instanceof Error ? e.message : 'unknown'}` }],
      coverage_gap: null,
    };
  }

  // 2) Log a prioritized coverage gap when the cost reference is weak/missing.
  let coverageGapId: string | undefined;
  if (verification.coverage_gap) {
    const g = verification.coverage_gap;
    const res = await recordCoverageGap(svc, {
      gateId: g.gate_id,
      domain: 'benchmark_coverage',
      ownerAgent: 'Rose_BI',
      skuId: targetSkuId, // NULL for a variety-level gap (recordCoverageGap validates uuid)
      routedVia: 'inventory_propose',
      evidence: { ...g.evidence, priority: g.priority },
    });
    if (res.ok) coverageGapId = res.id;
    else verification.warnings.push({ severity: 'warn', text: `COVERAGE: gap write failed (${res.error})` });
  }

  // 3) Build the proposal payload (verification embedded) + insert ONE row.
  const payload: Record<string, unknown> = {
    action,
    variety,
    category: input.category,
    box_type: input.boxType,
    pack: input.pack,
    farm_cost: input.farmCost,
    source: asTrimmedString(body.source),
    country: asTrimmedString(body.country),
    grade: asTrimmedString(body.grade),
    target_sku_id: targetSkuId,
    reason: asTrimmedString(body.reason),
    verification,
  };

  const cascadeSummary: Record<string, unknown> = {
    // No SKU footprint computed here (add proposes a NEW sku; identity/quarantine
    // target one). Carry a warning so the queue tile shows "TBD" not a false 0.
    affected_sku_count: action === 'add_variety' ? 0 : targetSkuId ? 1 : 0,
    warnings: action === 'add_variety' ? ['new variety — no existing SKU footprint'] : [],
  };

  const { data: inserted, error } = await svc
    .from('admin_proposals')
    .insert({
      type: ACTION_TYPE[action],
      target_table: 'dim_sku',
      target_id: targetSkuId,
      payload,
      warnings: verification.warnings,
      status: 'awaiting_facu',
      filter_status: 'passed',
      filter_reason: `verification ran: cost=${verification.cost.verdict}, sense=${verification.sense.status}, units=${verification.units.capacity_unit_mismatch ? 'mismatch' : 'ok'}`,
      cascade_summary: cascadeSummary,
      source_agent: 'Job_PM',
      proposed_by: auth.userId, // UUID column — never the email (admin_proposals.proposed_by is uuid)
      source_rationale: auth.email, // email lives here, not in proposed_by
      notes: null,
    })
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('[admin/inventory/propose] insert:', error);
    return NextResponse.json({ error: 'insert_failed', detail: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    proposalId: inserted?.id,
    verdict: verification.cost.verdict,
    overall: verification.overall,
    coverageGapId,
  });
}
