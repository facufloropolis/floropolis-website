// POST /api/admin/samples/decide
// v1 | 2026-06-09 | Job_PM (CPO)
//
// Facu's decision on a Sample Review loop. Upserts the open sample_review_loop row
// for a lead, transitions its status (yes→aligned, no→rejected, question→question_open),
// and appends a sample_review_event transition record. State lives in BACKUP Supabase.

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

type Decision = 'yes' | 'no' | 'question';
const VALID_DECISIONS: Decision[] = ['yes', 'no', 'question'];

// Decision → loop status transition. yes = composition aligned with Facu;
// no = rejected (capture why); question = open question routed to JJ.
const STATUS_MAP: Record<Decision, string> = {
  yes: 'aligned',
  no: 'rejected',
  question: 'question_open',
};

interface DecideBody {
  leadMasterId?: unknown;
  businessName?: unknown;
  decision?: unknown;
  questionText?: unknown;
  rejectedReason?: unknown;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    let body: DecideBody = {};
    try {
      const raw = await req.text();
      if (raw.length > 0) body = JSON.parse(raw) as DecideBody;
    } catch {
      return NextResponse.json({ error: 'bad_json' }, { status: 400 });
    }

    const leadMasterId =
      typeof body.leadMasterId === 'number'
        ? body.leadMasterId
        : typeof body.leadMasterId === 'string' && body.leadMasterId.trim() !== '' && !Number.isNaN(Number(body.leadMasterId))
        ? Number(body.leadMasterId)
        : null;
    if (leadMasterId === null || !Number.isFinite(leadMasterId)) {
      return NextResponse.json({ error: 'invalid_leadMasterId' }, { status: 400 });
    }

    if (typeof body.decision !== 'string' || !VALID_DECISIONS.includes(body.decision as Decision)) {
      return NextResponse.json(
        { error: 'invalid_decision', detail: `decision must be one of ${VALID_DECISIONS.join('|')}` },
        { status: 400 },
      );
    }
    const decision = body.decision as Decision;
    const newStatus = STATUS_MAP[decision];

    const businessName =
      typeof body.businessName === 'string' && body.businessName.trim().length > 0
        ? body.businessName.trim().slice(0, 300)
        : null;

    let questionText: string | null = null;
    if (decision === 'question') {
      if (typeof body.questionText !== 'string' || body.questionText.trim().length === 0) {
        return NextResponse.json({ error: 'invalid_questionText' }, { status: 400 });
      }
      questionText = body.questionText.trim().slice(0, 2000);
    }

    let rejectedReason: string | null = null;
    if (decision === 'no') {
      rejectedReason =
        typeof body.rejectedReason === 'string' && body.rejectedReason.trim().length > 0
          ? body.rejectedReason.trim().slice(0, 2000)
          : null;
    }

    const svc = getBackupServiceClient();
    const nowIso = new Date().toISOString();

    // Find an existing open loop row for this lead (most recent first).
    const { data: existing, error: findErr } = await svc
      .from('sample_review_loop')
      .select('id, status')
      .eq('lead_master_id', leadMasterId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (findErr) {
      console.error('[admin/samples/decide] find:', findErr);
      return NextResponse.json({ error: 'find_failed', detail: findErr.message }, { status: 500 });
    }

    const note = questionText ?? rejectedReason ?? null;
    let loopId: string;
    let fromStatus: string | null = null;

    if (existing) {
      loopId = existing.id as string;
      fromStatus = (existing.status as string | null) ?? null;
      const update: Record<string, unknown> = {
        status: newStatus,
        facu_decision: decision,
        question_text: questionText,
        rejected_reason: rejectedReason,
        updated_by: auth.email || 'facu',
        updated_at: nowIso,
      };
      if (businessName) update.business_name = businessName;
      const { error: updErr } = await svc
        .from('sample_review_loop')
        .update(update)
        .eq('id', loopId);
      if (updErr) {
        console.error('[admin/samples/decide] update:', updErr);
        return NextResponse.json({ error: 'update_failed', detail: updErr.message }, { status: 500 });
      }
    } else {
      const { data: insertedLoop, error: insErr } = await svc
        .from('sample_review_loop')
        .insert({
          lead_master_id: leadMasterId,
          business_name: businessName,
          cohort_date: nowIso.slice(0, 10),
          status: newStatus,
          facu_decision: decision,
          question_text: questionText,
          rejected_reason: rejectedReason,
          updated_by: auth.email || 'facu',
          updated_at: nowIso,
        })
        .select('id')
        .maybeSingle();
      if (insErr || !insertedLoop) {
        console.error('[admin/samples/decide] insert loop:', insErr);
        return NextResponse.json({ error: 'insert_failed', detail: insErr?.message ?? 'no row' }, { status: 500 });
      }
      loopId = insertedLoop.id as string;
      fromStatus = null;
    }

    const { error: evtErr } = await svc.from('sample_review_event').insert({
      loop_id: loopId,
      from_status: fromStatus,
      to_status: newStatus,
      // REAL actor: the authenticated admin who decided. JJ admins (jjpj@...) can approve,
      // so hardcoding 'facu' would mis-log their actions in the event timeline.
      actor: auth.email || 'facu',
      note,
    });
    if (evtErr) {
      console.error('[admin/samples/decide] event:', evtErr);
      return NextResponse.json({ error: 'event_failed', detail: evtErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, status: newStatus, loopId });
  } catch (err) {
    console.error('[admin/samples/decide] unexpected:', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
