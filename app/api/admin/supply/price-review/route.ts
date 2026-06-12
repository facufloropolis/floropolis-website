// POST /api/admin/supply/price-review
// v1 | 2026-06-12 | Job_PM (CPO)
//
// Facu approves / corrects / rejects a SUGGESTED price (price = farm_cost/(1-gpm)+delivery).
// Job VALIDATES/proposes price — it does NOT own the canonical price. This route captures the
// proposal (approved/corrected); applying it to the canonical catalog is routed internally
// (Job's plumbing), never surfaced to Facu. Body: { id, decision, price?, feedback? }.

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
  const { error } = await svc
    .from('price_review')
    .update({
      status,
      facu_decision: decision,
      corrected_price: correctedPrice,
      facu_feedback: feedback,
      decided_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) return NextResponse.json({ error: 'update_failed', detail: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, decision });
}
