// POST /api/admin/supply/image-review
// v2 | 2026-06-15 | Job_PM (CPO)
//
// Facu approves/rejects a candidate image from the /admin/supply review queue, WITH reason tags
// (the learning signal). On APPROVE the route now DELEGATES to the shared closer
// (lib/admin/loop-ledger.closeAssetGate) — the SAME closer the apply-image route uses — so the
// loop ACTUALLY closes: the URL lands in product_chrome.images AND the missing_image gate clears
// in catalog_classifications (status flips publishable when no blocker remains, the SKU LEAVES the
// image lever). The old shallow product_chrome-only update is GONE (it left the SKU blocked and
// the card reappeared). It also records the loop ledger (improvement_loop_state -> verified) so a
// Facu decision can advance the streak, and a supply_solution_feedback row (learning). Sibling
// candidates for the same SKU are auto-rejected. On REJECT: records the decision + reason.
//
// Body: { id (candidate id), decision: 'approve' | 'reject', feedback? (reason tags) }.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';
import { closeAssetGate, recordLoopLedger } from '@/lib/admin/loop-ledger';

const IMAGE_GATE = 'missing_image';

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

interface Body {
  id?: unknown;
  decision?: unknown;
  feedback?: unknown;
}

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
  const decision = body.decision === 'approve' ? 'approve' : body.decision === 'reject' ? 'reject' : null;
  if (!decision) return NextResponse.json({ error: 'invalid_decision' }, { status: 400 });
  const feedback = typeof body.feedback === 'string' ? body.feedback.trim().slice(0, 1000) : null;

  const svc = getBackupServiceClient();

  // Load the candidate.
  const { data: cand, error: candErr } = await svc
    .from('image_review')
    .select('id, sku_id, candidate_url, variety')
    .eq('id', id)
    .maybeSingle();
  if (candErr || !cand) return NextResponse.json({ error: 'candidate_not_found' }, { status: 404 });

  const now = new Date().toISOString();

  if (decision === 'reject') {
    const { error } = await svc
      .from('image_review')
      .update({ status: 'rejected', facu_decision: 'reject', facu_feedback: feedback, decided_at: now })
      .eq('id', id);
    if (error) return NextResponse.json({ error: 'update_failed', detail: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, decision: 'reject' });
  }

  // APPROVE: DELEGATE to the shared closer so the loop actually closes (asset lands
  // AND the gate clears), not just product_chrome. closeAssetGate validates the
  // text sku_id is a uuid (review tables store it as text) and no-ops otherwise.
  const skuId = typeof cand.sku_id === 'string' ? cand.sku_id : null;
  const url = typeof cand.candidate_url === 'string' ? cand.candidate_url : null;

  let assetWritten = 0;
  let gatesCleared = 0;
  let closed = 0;
  let nowPublishable = 0;
  let publishable = false;
  const warnings: string[] = [];
  if (skuId && url) {
    const closeRes = await closeAssetGate(svc, {
      skuIds: [skuId],
      gate: IMAGE_GATE,
      asset: { images: [url] },
    });
    assetWritten = closeRes.assetWritten;
    gatesCleared = closeRes.gatesCleared;
    closed = closeRes.closed;
    nowPublishable = closeRes.nowPublishable;
    publishable = (closeRes.statusAfter.get(skuId)?.status ?? '') === 'publishable';

    // Auto-reject sibling candidates for the same SKU (Facu picked this one).
    await svc
      .from('image_review')
      .update({ status: 'rejected', facu_decision: 'superseded', decided_at: now })
      .eq('sku_id', skuId)
      .eq('status', 'pending')
      .neq('id', id);

    // Record the loop ledger (improvement_loop_state -> verified) so a Facu decision
    // advances the streak. Idempotent: transitions the existing open row, no dupe.
    if (gatesCleared > 0) {
      const ledger = await recordLoopLedger(svc, {
        skuId,
        gateId: IMAGE_GATE,
        domain: 'images',
        // owner_agent = the EXECUTING agent (DB CHECK rejects 'Facu'); the human
        // approver is captured as evidence.decided_by below.
        ownerAgent: 'Job_PM',
        targetState: 'verified',
        routedVia: 'image_review',
        evidence: {
          fix: { source: 'image_review_approve', candidate_id: id, url, decided_by: 'Facu', decided_by_email: auth.email || null },
          before: { image_count: 0, gate: IMAGE_GATE, status: 'blocked' },
          after: { image_count: assetWritten > 0 ? 1 : 0, gate_cleared: true, publishable },
        },
      });
      if (!ledger.ok) { console.error('[image-review] loop ledger:', ledger.error); warnings.push(`ledger_not_advanced: ${ledger.error}`); }
    }

    // LEARNING: record the approve + the metric move.
    const { error: fbErr } = await svc.from('supply_solution_feedback').insert({
      lever: 'image',
      target_sku: skuId,
      target_variety: typeof cand.variety === 'string' ? cand.variety : null,
      outcome: 'pick', // DB CHECK supply_solution_feedback_outcome_check allows only {'pick','reject'}
      chosen_value: url,
      reason: feedback,
      metric_before: 0,
      metric_after: assetWritten > 0 ? 1 : 0,
      decided_by: auth.email || 'facu',
    });
    if (fbErr) { console.error('[image-review] solution_feedback:', fbErr); warnings.push(`learning_not_written: ${fbErr.message}`); }
  }

  const { error } = await svc
    .from('image_review')
    .update({
      status: 'approved',
      facu_decision: 'approve',
      facu_feedback: feedback,
      decided_at: now,
      applied_at: assetWritten > 0 ? now : null,
    })
    .eq('id', id);
  if (error) return NextResponse.json({ error: 'update_failed', detail: error.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    decision: 'approve',
    propagated: assetWritten > 0,
    loopClosed: closed > 0,
    gatesCleared,
    nowPublishable,
    publishable,
    warnings,
  });
}
