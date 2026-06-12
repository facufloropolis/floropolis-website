// POST /api/admin/desk/dedup-decide
// v1 | 2026-06-11 | Job_PM (CPO)
//
// Captures Facu's decision on a doubtful dedup group (from the Desk dedup-review queue) and
// writes it to BACKUP public.dedup_decisions (Job's plane — Job is READ-ONLY on PROD). Rose
// ingests these to PROD meta.dedup_decisions + executes the reversible soft-merge on
// lead_master. Decisions: MERGE_ALL | KEEP_CHAIN | KEEP_SEPARATE | SURVIVOR.
//
// Body: { group_key, decision, survivor_lead_id?, note? }.

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

const VALID_DECISIONS = new Set(['MERGE_ALL', 'KEEP_CHAIN', 'KEEP_SEPARATE', 'SURVIVOR']);

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

interface DecideBody {
  group_key?: unknown;
  decision?: unknown;
  survivor_lead_id?: unknown;
  note?: unknown;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: DecideBody = {};
  try {
    const raw = await req.text();
    if (raw.length > 0) body = JSON.parse(raw) as DecideBody;
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }

  if (typeof body.group_key !== 'string' || body.group_key.trim().length === 0) {
    return NextResponse.json({ error: 'invalid_group_key' }, { status: 400 });
  }
  if (typeof body.decision !== 'string' || !VALID_DECISIONS.has(body.decision)) {
    return NextResponse.json({ error: 'invalid_decision', detail: `decision must be one of ${[...VALID_DECISIONS].join(', ')}` }, { status: 400 });
  }
  const groupKey = body.group_key.trim().slice(0, 300);
  const decision = body.decision;
  const survivorLeadId =
    typeof body.survivor_lead_id === 'number' && Number.isFinite(body.survivor_lead_id)
      ? Math.round(body.survivor_lead_id)
      : null;
  // SURVIVOR / MERGE_ALL keep a survivor; require one for SURVIVOR.
  if (decision === 'SURVIVOR' && survivorLeadId == null) {
    return NextResponse.json({ error: 'survivor_required', detail: 'SURVIVOR needs survivor_lead_id' }, { status: 400 });
  }
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 2000) : null;

  const svc = getBackupServiceClient();
  const { data: inserted, error } = await svc
    .from('dedup_decisions')
    .insert({
      group_key: groupKey,
      decision,
      survivor_lead_id: survivorLeadId,
      decided_by: auth.email,
      note,
    })
    .select('id, group_key, decision, survivor_lead_id, decided_at')
    .maybeSingle();

  if (error) {
    console.error('[admin/desk/dedup-decide] insert:', error);
    return NextResponse.json({ error: 'insert_failed', detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, decision: inserted, executor: 'Rose ingests BACKUP dedup_decisions -> PROD soft-merge' });
}
