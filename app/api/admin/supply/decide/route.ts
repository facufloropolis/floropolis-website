// POST /api/admin/supply/decide
// v1 | 2026-06-08 | Job_PM (CPO)
//
// Captures Facu's decision on a Supply Engine recommendation and writes it to
// public.supply_recommendation_feedback. This is the LEARNING SIGNAL: weight_delta
// re-ranks v_supply_recommendations on the next load (via learned_delta).
//
// Body: { variety, rec_type, decision ∈ approve|reject|defer|correct, reason? }.
// Auth mirrors /api/admin/desk/answer (ADMIN_EMAILS or client_profiles.status='admin').
//
// Write: supply_recommendation_feedback {
//   target_variety = variety, rec_type, decision,
//   reason_tags = reason ? [reason] : [],
//   weight_delta = WEIGHT_DELTA[decision],
//   decided_by = session email else 'facu' }.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';
import { persistSupplyFeedback } from '@/lib/admin/supply-feedback';

const ADMIN_EMAILS = [
  'facu@floropolis.com',
  'jjpj@crescoinversiones.com',
  'jjpj@floropolis.com',
  'jjp@floropolis.com',
];

// Learning signal mapping. Approve reinforces the rec (push importance up),
// reject penalizes it (push down hard — a wrong rec costs more than a right one
// earns), defer is neutral (seen, not decided), correct is neutral on weight and
// just records the reason (the WHY is the signal, not a numeric nudge).
const WEIGHT_DELTA: Record<Decision, number> = {
  approve: 15,
  reject: -40,
  defer: 0,
  correct: 0,
};

type Decision = 'approve' | 'reject' | 'defer' | 'correct';
const VALID_DECISIONS: Decision[] = ['approve', 'reject', 'defer', 'correct'];

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
  variety?: unknown;
  rec_type?: unknown;
  decision?: unknown;
  reason?: unknown;
  // PRIORITIZATION feedback (Facu's early ask): an explicit numeric nudge to the rank when he
  // steers the PRIORITY (subir +, bajar -, no-es-prioridad --), not just the rec content. When
  // present it overrides the decision-derived weight_delta. getLearnedRerank reads weight_delta.
  priority_delta?: unknown;
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

  if (typeof body.variety !== 'string' || body.variety.trim().length === 0) {
    return NextResponse.json({ error: 'invalid_variety' }, { status: 400 });
  }
  if (typeof body.rec_type !== 'string' || body.rec_type.trim().length === 0) {
    return NextResponse.json({ error: 'invalid_rec_type' }, { status: 400 });
  }
  if (typeof body.decision !== 'string' || !VALID_DECISIONS.includes(body.decision as Decision)) {
    return NextResponse.json(
      { error: 'invalid_decision', detail: `decision must be one of ${VALID_DECISIONS.join('|')}` },
      { status: 400 },
    );
  }

  const variety = body.variety.trim().slice(0, 200);
  const recType = body.rec_type.trim().slice(0, 100);
  const decision = body.decision as Decision;
  const reason =
    typeof body.reason === 'string' && body.reason.trim().length > 0
      ? body.reason.trim().slice(0, 2000)
      : null;

  const svc = getBackupServiceClient();
  const priorityDelta =
    typeof body.priority_delta === 'number' && Number.isFinite(body.priority_delta)
      ? body.priority_delta
      : undefined;

  // approve/reject -> the SHARED helper (lib/admin/supply-feedback) so all three
  // supply routes encode + persist identically (recommendation_feedback for the
  // ranker, and a solution_feedback row — incl. the reject outcome the old paths
  // dropped). defer/correct are NOT in the helper's FeedbackPayload contract, so
  // they keep the direct recommendation_feedback insert (the 4-value contract is
  // untouched — defer/correct never reach the helper).
  if (decision === 'approve' || decision === 'reject') {
    const persisted = await persistSupplyFeedback(svc, {
      payload: { decision, priorityDelta, note: reason ?? undefined },
      recType,
      lever: recType,
      variety,
      decidedBy: auth.email || 'facu',
    });
    if (persisted.warnings.length > 0) {
      return NextResponse.json({ error: 'insert_failed', warnings: persisted.warnings }, { status: 500 });
    }
    return NextResponse.json({
      ok: true,
      decision,
      recommendationId: persisted.recommendationId,
      solutionId: persisted.solutionId,
      weightDelta: persisted.weightDelta,
    });
  }

  // defer / correct: neutral framing feedback — direct insert, weight_delta=0
  // unless an explicit priority steer is present.
  const { data: inserted, error } = await svc
    .from('supply_recommendation_feedback')
    .insert({
      target_variety: variety,
      rec_type: recType,
      decision,
      reason_tags: reason ? [reason] : [],
      weight_delta:
        priorityDelta != null
          ? Math.max(-20, Math.min(20, priorityDelta))
          : WEIGHT_DELTA[decision],
      decided_by: auth.email || 'facu',
    })
    .select('id, target_variety, rec_type, decision, reason_tags, weight_delta, decided_by, decided_at')
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: 'insert_failed', detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, feedback: inserted });
}
