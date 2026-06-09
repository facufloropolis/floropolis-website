// POST /api/admin/samples/answer
// v1 | 2026-06-09 | Job_PM (CPO)
//
// JJ's answer to an open question on a Sample Review loop. Requires the loop to be
// in status 'question_open', records jj_answer, transitions to 'answered', and
// appends a sample_review_event. State lives in BACKUP Supabase.

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

interface AnswerBody {
  loopId?: unknown;
  answer?: unknown;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    let body: AnswerBody = {};
    try {
      const raw = await req.text();
      if (raw.length > 0) body = JSON.parse(raw) as AnswerBody;
    } catch {
      return NextResponse.json({ error: 'bad_json' }, { status: 400 });
    }

    if (typeof body.loopId !== 'string' || body.loopId.trim().length === 0) {
      return NextResponse.json({ error: 'invalid_loopId' }, { status: 400 });
    }
    const loopId = body.loopId.trim();

    if (typeof body.answer !== 'string' || body.answer.trim().length === 0) {
      return NextResponse.json({ error: 'invalid_answer' }, { status: 400 });
    }
    const answer = body.answer.trim().slice(0, 2000);

    const svc = getBackupServiceClient();

    const { data: loop, error: findErr } = await svc
      .from('sample_review_loop')
      .select('id, status')
      .eq('id', loopId)
      .maybeSingle();
    if (findErr) {
      console.error('[admin/samples/answer] find:', findErr);
      return NextResponse.json({ error: 'find_failed', detail: findErr.message }, { status: 500 });
    }
    if (!loop) {
      return NextResponse.json({ error: 'loop_not_found' }, { status: 404 });
    }
    if ((loop.status as string) !== 'question_open') {
      return NextResponse.json(
        { error: 'invalid_state', detail: `loop is '${loop.status}', expected 'question_open'` },
        { status: 409 },
      );
    }

    const nowIso = new Date().toISOString();
    const { error: updErr } = await svc
      .from('sample_review_loop')
      .update({
        jj_answer: answer,
        status: 'answered',
        updated_by: auth.email || 'jj',
        updated_at: nowIso,
      })
      .eq('id', loopId);
    if (updErr) {
      console.error('[admin/samples/answer] update:', updErr);
      return NextResponse.json({ error: 'update_failed', detail: updErr.message }, { status: 500 });
    }

    const { error: evtErr } = await svc.from('sample_review_event').insert({
      loop_id: loopId,
      from_status: 'question_open',
      to_status: 'answered',
      actor: 'jj',
      note: answer.slice(0, 500),
    });
    if (evtErr) {
      console.error('[admin/samples/answer] event:', evtErr);
      return NextResponse.json({ error: 'event_failed', detail: evtErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, status: 'answered' });
  } catch (err) {
    console.error('[admin/samples/answer] unexpected:', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
