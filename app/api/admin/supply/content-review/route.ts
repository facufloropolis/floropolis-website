// POST /api/admin/supply/content-review
// v1 | 2026-06-12 | Job_PM (CPO)
//
// Facu Applies / Edits / Rejects an auto-generated content description from /admin/supply.
// On APPROVE: the (possibly edited) text propagates to product_chrome.description for that SKU
// (the content gate closes). Body: { id, decision: 'approve' | 'reject', text?, feedback? }.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';

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
    .select('id, sku_id, candidate_text')
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

  // APPROVE: propagate the (edited or original) description to the catalog so the gate closes.
  const skuId = typeof cand.sku_id === 'string' ? cand.sku_id : null;
  const text = editedText && editedText.length >= 3
    ? editedText
    : (typeof cand.candidate_text === 'string' ? cand.candidate_text : null);
  let propagated = false;
  if (skuId && text) {
    try {
      const { error: pcErr } = await svc.from('product_chrome').update({ description: text }).eq('sku_id', skuId);
      propagated = !pcErr;
    } catch {
      propagated = false;
    }
  }

  const { error } = await svc
    .from('content_review')
    .update({
      status: 'approved',
      facu_decision: editedText ? 'edited' : 'approve',
      candidate_text: text,
      facu_feedback: feedback,
      decided_at: now,
      applied_at: propagated ? now : null,
    })
    .eq('id', id);
  if (error) return NextResponse.json({ error: 'update_failed', detail: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, decision: 'approve', propagated });
}
