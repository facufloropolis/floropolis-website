// POST /api/admin/supply/image-review
// v1 | 2026-06-12 | Job_PM (CPO)
//
// Facu approves/rejects a candidate image from the /admin/supply review queue, WITH reason tags
// (the learning signal). On APPROVE: the candidate's URL propagates to product_chrome.images for
// that SKU (the SKU unblocks — the loop closes, image_count 0->1), and the sibling candidates for
// the same SKU are auto-rejected. On REJECT: just records the decision + reason. Per
// image_engine_spec.md. Zero-variable-cost sourcing happens upstream (a subagent fills image_review).
//
// Body: { id (candidate id), decision: 'approve' | 'reject', feedback? (reason tags) }.

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
    .select('id, sku_id, candidate_url')
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

  // APPROVE: propagate the image to the catalog so the SKU unblocks (the loop closes).
  const skuId = typeof cand.sku_id === 'string' ? cand.sku_id : null;
  const url = typeof cand.candidate_url === 'string' ? cand.candidate_url : null;
  let propagated = false;
  if (skuId && url) {
    try {
      const { error: pcErr } = await svc
        .from('product_chrome')
        .update({ images: [url] })
        .eq('sku_id', skuId);
      propagated = !pcErr;
    } catch {
      propagated = false;
    }
    // Auto-reject sibling candidates for the same SKU (Facu picked this one).
    await svc
      .from('image_review')
      .update({ status: 'rejected', facu_decision: 'superseded', decided_at: now })
      .eq('sku_id', skuId)
      .eq('status', 'pending')
      .neq('id', id);
  }

  const { error } = await svc
    .from('image_review')
    .update({
      status: 'approved',
      facu_decision: 'approve',
      facu_feedback: feedback,
      decided_at: now,
      applied_at: propagated ? now : null,
    })
    .eq('id', id);
  if (error) return NextResponse.json({ error: 'update_failed', detail: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, decision: 'approve', propagated });
}
