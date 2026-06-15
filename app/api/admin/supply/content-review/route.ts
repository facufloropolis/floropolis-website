// POST /api/admin/supply/content-review
// v2 | 2026-06-15 | Job_PM (CPO)
//
// Facu Applies / Edits / Rejects an auto-generated content description from /admin/supply.
// On APPROVE the route now DELEGATES to the shared closer (lib/admin/loop-ledger.closeAssetGate)
// — the SAME closer apply-content uses — so the loop ACTUALLY closes: the (possibly edited) text
// lands in product_chrome.description AND the missing_contents_description gate clears in
// catalog_classifications (status flips publishable when no blocker remains, the SKU leaves the
// content lever). The old shallow product_chrome-only update is GONE. It also records the loop
// ledger (improvement_loop_state -> verified) and a supply_solution_feedback row (learning).
// Body: { id, decision: 'approve' | 'reject', text?, feedback? }.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';
import { closeAssetGate, recordLoopLedger } from '@/lib/admin/loop-ledger';

const CONTENT_GATE = 'missing_contents_description';

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

interface Body { id?: unknown; decision?: unknown; text?: unknown; feedback?: unknown }

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
  const editedText = typeof body.text === 'string' ? body.text.trim().slice(0, 2000) : null;
  const feedback = typeof body.feedback === 'string' ? body.feedback.trim().slice(0, 1000) : null;

  const svc = getBackupServiceClient();
  const { data: cand, error: candErr } = await svc
    .from('content_review')
    .select('id, sku_id, candidate_text, variety')
    .eq('id', id)
    .maybeSingle();
  if (candErr || !cand) return NextResponse.json({ error: 'candidate_not_found' }, { status: 404 });

  const now = new Date().toISOString();

  if (decision === 'reject') {
    const { error } = await svc
      .from('content_review')
      .update({ status: 'rejected', facu_decision: 'reject', facu_feedback: feedback, decided_at: now })
      .eq('id', id);
    if (error) return NextResponse.json({ error: 'update_failed', detail: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, decision: 'reject' });
  }

  // APPROVE: DELEGATE to the shared closer so the loop actually closes (text lands
  // AND the content gate clears), not just product_chrome.
  const skuId = typeof cand.sku_id === 'string' ? cand.sku_id : null;
  const text = editedText && editedText.length >= 3
    ? editedText
    : (typeof cand.candidate_text === 'string' ? cand.candidate_text : null);

  let assetWritten = 0;
  let gatesCleared = 0;
  let closed = 0;
  let nowPublishable = 0;
  let publishable = false;
  const warnings: string[] = [];
  if (skuId && text) {
    const closeRes = await closeAssetGate(svc, {
      skuIds: [skuId],
      gate: CONTENT_GATE,
      asset: { description: text },
    });
    assetWritten = closeRes.assetWritten;
    gatesCleared = closeRes.gatesCleared;
    closed = closeRes.closed;
    nowPublishable = closeRes.nowPublishable;
    publishable = (closeRes.statusAfter.get(skuId)?.status ?? '') === 'publishable';

    if (gatesCleared > 0) {
      const ledger = await recordLoopLedger(svc, {
        skuId,
        gateId: CONTENT_GATE,
        domain: 'content',
        // owner_agent = the EXECUTING agent (DB CHECK rejects 'Facu'); the human
        // approver is captured as evidence.decided_by below.
        ownerAgent: 'Job_PM',
        targetState: 'verified',
        routedVia: 'content_review',
        evidence: {
          fix: { source: 'content_review_approve', candidate_id: id, edited: !!editedText, text: text.slice(0, 200), decided_by: 'Facu', decided_by_email: auth.email || null },
          before: { gate: CONTENT_GATE, status: 'blocked' },
          after: { gate_cleared: true, publishable },
        },
      });
      if (!ledger.ok) { console.error('[content-review] loop ledger:', ledger.error); warnings.push(`ledger_not_advanced: ${ledger.error}`); }
    }

    const { error: fbErr } = await svc.from('supply_solution_feedback').insert({
      lever: 'content',
      target_sku: skuId,
      target_variety: typeof cand.variety === 'string' ? cand.variety : null,
      outcome: 'pick', // DB CHECK supply_solution_feedback_outcome_check allows only {'pick','reject'}
      chosen_value: text.slice(0, 200),
      reason: feedback,
      metric_before: 1,
      metric_after: closed > 0 ? 0 : 1,
      decided_by: auth.email || 'facu',
    });
    if (fbErr) { console.error('[content-review] solution_feedback:', fbErr); warnings.push(`learning_not_written: ${fbErr.message}`); }
  }

  const { error } = await svc
    .from('content_review')
    .update({
      status: 'approved',
      facu_decision: editedText ? 'edited' : 'approve',
      candidate_text: text,
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
