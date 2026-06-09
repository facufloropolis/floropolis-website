// POST /api/admin/samples/feedback
// v1 | 2026-06-09 | Job_PM (CPO)
//
// Records a learning signal on a Sample Review hypothesis: was the hypothesis
// correct / wrong / partial, and what is the correction. Append-only into
// sample_review_feedback in BACKUP Supabase.

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

type Verdict = 'correct' | 'wrong' | 'partial';
const VALID_VERDICTS: Verdict[] = ['correct', 'wrong', 'partial'];

interface FeedbackBody {
  leadMasterId?: unknown;
  businessName?: unknown;
  hypothesisType?: unknown;
  hypothesisText?: unknown;
  verdict?: unknown;
  correction?: unknown;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    let body: FeedbackBody = {};
    try {
      const raw = await req.text();
      if (raw.length > 0) body = JSON.parse(raw) as FeedbackBody;
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

    if (typeof body.hypothesisType !== 'string' || body.hypothesisType.trim().length === 0) {
      return NextResponse.json({ error: 'invalid_hypothesisType' }, { status: 400 });
    }
    const hypothesisType = body.hypothesisType.trim().slice(0, 200);

    if (typeof body.verdict !== 'string' || !VALID_VERDICTS.includes(body.verdict as Verdict)) {
      return NextResponse.json(
        { error: 'invalid_verdict', detail: `verdict must be one of ${VALID_VERDICTS.join('|')}` },
        { status: 400 },
      );
    }
    const verdict = body.verdict as Verdict;

    const businessName =
      typeof body.businessName === 'string' && body.businessName.trim().length > 0
        ? body.businessName.trim().slice(0, 300)
        : null;
    const hypothesisText =
      typeof body.hypothesisText === 'string' && body.hypothesisText.trim().length > 0
        ? body.hypothesisText.trim().slice(0, 2000)
        : null;
    const correction =
      typeof body.correction === 'string' && body.correction.trim().length > 0
        ? body.correction.trim().slice(0, 2000)
        : null;

    const svc = getBackupServiceClient();
    const { error } = await svc.from('sample_review_feedback').insert({
      lead_master_id: leadMasterId,
      business_name: businessName,
      hypothesis_type: hypothesisType,
      hypothesis_text: hypothesisText,
      verdict,
      correction,
      decided_by: auth.email || 'facu',
    });
    if (error) {
      console.error('[admin/samples/feedback] insert:', error);
      return NextResponse.json({ error: 'insert_failed', detail: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[admin/samples/feedback] unexpected:', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
