// POST /api/admin/supply/price-review
// v2 | 2026-06-15 | Job_PM (CPO)
//
// Facu approves / corrects / rejects a SUGGESTED price (price = farm_cost/(1-gpm)+delivery).
// Job VALIDATES/proposes price — it does NOT own the canonical price. There is NO price column
// this route may write: the storefront price is DERIVED in v_supply_recommendations from
// canonical_cost.farm_cost (facu_approved, Rose-owned) + pricing_constants.gpm_target. So on
// approve/correct this route (1) updates price_review, (2) inserts an admin_proposals row
// (type='price_correction', target_table='canonical_cost', target_id=sku_id) = the GOVERNED
// handoff to the Rose-owned price path, and (3) records the loop ledger as 'landed' (NOT
// 'verified') routed_via='admin_proposals'. The ledger only advances to 'verified' via a separate
// Rose-confirmed write (out of scope). This route NEVER flips a SKU publishable or writes
// 'verified' — that would be a false close. Body: { id, decision, price?, feedback? }.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';
import { recordLoopLedger } from '@/lib/admin/loop-ledger';

const ADMIN_EMAILS = [
  'facu@floropolis.com',
  'jjpj@crescoinversiones.com',
  'jjpj@floropolis.com',
  'jjp@floropolis.com',
];

interface AuthOk { ok: true; email: string }
interface AuthFail { ok: false; response: NextResponse }

async function requireAdmin(): Promise<AuthOk | AuthFail> {
  const userClient = await createUserClient();
  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) return { ok: false, response: NextResponse.json({ error: 'unauthenticated' }, { status: 401 }) };
  const emailLc = (user.email ?? '').toLowerCase();
  if (ADMIN_EMAILS.includes(emailLc)) return { ok: true, email: emailLc };
  const adminClient = getBackupServiceClient();
  const { data: profile } = await adminClient.from('client_profiles').select('status').eq('user_id', user.id).maybeSingle();
  if (profile?.status === 'admin') return { ok: true, email: emailLc };
  return { ok: false, response: NextResponse.json({ error: 'not_admin' }, { status: 403 }) };
}

interface Body { id?: unknown; decision?: unknown; price?: unknown; feedback?: unknown }

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: Body = {};
  try {
    const raw = await req.text();
    if (raw.length > 0) body = JSON.parse(raw) as Body;
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }

  const id = typeof body.id === 'number' ? body.id : Number(body.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  const decision = ['approve', 'correct', 'reject'].includes(body.decision as string) ? (body.decision as string) : null;
  if (!decision) return NextResponse.json({ error: 'invalid_decision' }, { status: 400 });
  const correctedPrice = typeof body.price === 'number' && Number.isFinite(body.price) ? body.price : null;
  if (decision === 'correct' && correctedPrice == null) {
    return NextResponse.json({ error: 'price_required', detail: 'correct needs a price' }, { status: 400 });
  }
  const feedback = typeof body.feedback === 'string' ? body.feedback.trim().slice(0, 1000) : null;

  const status = decision === 'approve' ? 'approved' : decision === 'correct' ? 'corrected' : 'rejected';
  const svc = getBackupServiceClient();
  const now = new Date().toISOString();

  // Load the row (need sku_id + suggested_price for the governed handoff + ledger).
  const { data: pr, error: prErr } = await svc
    .from('price_review')
    .select('id, sku_id, variety, farm_cost, gpm, suggested_price')
    .eq('id', id)
    .maybeSingle();
  if (prErr || !pr) return NextResponse.json({ error: 'candidate_not_found' }, { status: 404 });

  // (1) Always update price_review with the decision.
  const { error } = await svc
    .from('price_review')
    .update({
      status,
      facu_decision: decision,
      corrected_price: correctedPrice,
      facu_feedback: feedback,
      decided_at: now,
    })
    .eq('id', id);
  if (error) return NextResponse.json({ error: 'update_failed', detail: error.message }, { status: 500 });

  // REJECT: just the decision, no handoff.
  if (decision === 'reject') {
    return NextResponse.json({ ok: true, decision });
  }

  // APPROVE / CORRECT: route via the GOVERNED price path. NO price column here —
  // the canonical price is derived from canonical_cost.farm_cost (Rose-owned).
  const skuId = typeof pr.sku_id === 'string' ? pr.sku_id : null;
  const suggested = typeof pr.suggested_price === 'number' ? pr.suggested_price : null;
  const after = correctedPrice ?? suggested;

  // (2) Governed handoff: insert an admin_proposals row for Rose's price path.
  let proposalId: string | null = null;
  let routed = false;
  if (skuId) {
    const { data: prop, error: propErr } = await svc
      .from('admin_proposals')
      .insert({
        type: 'price_correction',
        target_table: 'canonical_cost',
        target_id: skuId,
        source_agent: 'Job',
        source_table: 'price_review',
        source_id: String(id),
        status: 'awaiting_facu',
        before_value: { suggested_price: suggested, farm_cost: pr.farm_cost ?? null, gpm: pr.gpm ?? null },
        after_value: { decision, corrected_price: correctedPrice, target_price: after },
        source_rationale: feedback,
        payload: { lever: 'price', variety: typeof pr.variety === 'string' ? pr.variety : null },
      })
      .select('id')
      .maybeSingle();
    if (propErr) {
      console.error('[price-review] admin_proposals insert:', propErr);
    } else if (prop) {
      proposalId = (prop as { id: string }).id;
      routed = true;
    }

    // (3) Loop ledger -> 'landed' (NOT 'verified'); only Rose's confirmed write
    //     advances it to verified (out of scope). gate_id = the price gate token.
    if (proposalId) {
      const ledger = await recordLoopLedger(svc, {
        skuId,
        gateId: 'price_zero',
        domain: 'price',
        // owner_agent = the EXECUTING agent (DB CHECK rejects 'Facu'); the human
        // approver is captured as evidence.decided_by below.
        ownerAgent: 'Job_PM',
        targetState: 'landed',
        routedVia: 'admin_proposals',
        evidence: {
          fix: { source: 'price_review_' + decision, proposal_id: proposalId, decided_by: 'Facu', decided_by_email: auth.email || null },
          before: { suggested },
          after: { corrected: correctedPrice, target_price: after },
        },
      });
      if (!ledger.ok) console.error('[price-review] loop ledger:', ledger.error);
    }
  }

  return NextResponse.json({
    ok: true,
    decision,
    routed,
    proposalId,
    // HONEST: routed to the governed (Rose-owned) price path — NOT published/verified.
    note: routed ? 'routed to governed price path' : 'decision recorded; governed route pending',
  });
}
