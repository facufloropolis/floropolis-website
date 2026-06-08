// POST /api/admin/desk/answer
// v1 | 2026-06-08 | Job_PM (CPO)
//
// Captures a Zone 3 "Your knowledge" answer from Facu's Desk and routes it to a
// GOVERNED home. The governed path here is public.admin_proposals -- the same
// queue Pita/Job already audit -- as a proposal of type 'facu_knowledge_answer'.
// This is preferred over a new free-standing table because the answer becomes a
// reviewable, auditable artifact in the existing pipeline rather than a parallel
// store. (admin_proposals was confirmed readable/writable; status defaults to
// 'awaiting_facu', target_table is NOT NULL so we set the sentinel
// 'facu_knowledge'.)
//
// Body: { question_key, question, answer }.
// Writes: admin_proposals { type:'facu_knowledge_answer', target_table:'facu_knowledge',
//   target_id:question_key, payload:{question, answer, answered_by}, source_agent:'facu_desk',
//   source_rationale:answer, notes:question }. proposed_by = authenticated admin uuid.

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
  question_key?: unknown;
  question?: unknown;
  answer?: unknown;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: AnswerBody = {};
  try {
    const raw = await req.text();
    if (raw.length > 0) body = JSON.parse(raw) as AnswerBody;
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }

  if (typeof body.question_key !== 'string' || body.question_key.trim().length === 0) {
    return NextResponse.json({ error: 'invalid_question_key' }, { status: 400 });
  }
  if (typeof body.answer !== 'string' || body.answer.trim().length < 1) {
    return NextResponse.json({ error: 'invalid_answer', detail: 'answer is required' }, { status: 400 });
  }
  const questionKey = body.question_key.trim().slice(0, 200);
  const answer = body.answer.trim().slice(0, 4000);
  const question =
    typeof body.question === 'string' && body.question.trim().length > 0
      ? body.question.trim().slice(0, 1000)
      : questionKey;

  const svc = getBackupServiceClient();

  const { data: inserted, error } = await svc
    .from('admin_proposals')
    .insert({
      type: 'facu_knowledge_answer',
      target_table: 'facu_knowledge',
      target_id: questionKey,
      payload: { question_key: questionKey, question, answer, answered_by: auth.email },
      source_agent: 'facu_desk',
      source_rationale: answer,
      notes: question,
      proposed_by: auth.userId,
      // status defaults to 'awaiting_facu' on the table.
    })
    .select('id, type, target_id, status, proposed_at')
    .maybeSingle();

  if (error) {
    console.error('[admin/desk/answer] insert:', error);
    return NextResponse.json({ error: 'insert_failed', detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, proposal: inserted, governed_path: 'admin_proposals' });
}
