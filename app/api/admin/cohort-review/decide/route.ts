// POST /api/admin/cohort-review/decide
// v1 | 2026-06-08 | Job_PM (CPO)
//
// The live twin of the /mockups/cohort-review decision bar. Writes a Facu
// decision on a sample-box cohort lead to public.cohort_decisions, and on
// 'approve' advances the order fulfillment_state 'qualified' -> 'approved'.
//
// Flow:
//   1. Auth + admin gate (email allowlist or client_profiles.status='admin').
//      The authenticated admin's email is the default actor when the body does
//      not pin one; falls back to 'facu' (singular admin) if email is absent.
//   2. Validate body { order_id, cohort_id, actor?, system_suggestion, decision,
//      rationale? }. decision in ('approve'|'challenge'|'differently').
//   3. Load the order; refuse if not found or not in the cohort window.
//   4. Idempotent upsert on cohort_decisions UNIQUE (cohort_id, order_id, actor):
//      if a row exists, UPDATE decision+rationale+system_suggestion; else INSERT.
//      (id is GENERATED ALWAYS identity, so we never supply it; we cannot use a
//      blind PostgREST upsert that would try to write id, so we read-then-write.)
//   5. On 'approve' only: advance orders.fulfillment_state 'qualified'->'approved'.
//      NB v1: there is no actor-setting RPC in the backup project, so the
//      orders fulfillment-log trigger (trg_orders_fulfillment_log) records
//      current_setting('app.actor', true) which is unset here and therefore logs
//      actor='system' on the qualified->approved transition. Acceptable v1; the
//      real decision actor is durably captured on the cohort_decisions row.
//   6. Return the written cohort_decisions row.

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

const VALID_DECISIONS = ['approve', 'challenge', 'differently'] as const;
type Decision = (typeof VALID_DECISIONS)[number];

const COHORT_STATES = ['requested', 'address_confirmed', 'qualified'] as const;

interface AuthOk { ok: true; email: string }
interface AuthFail { ok: false; response: NextResponse }

async function requireAdmin(): Promise<AuthOk | AuthFail> {
  const userClient = await createUserClient();
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) {
    return { ok: false, response: NextResponse.json({ error: 'unauthenticated' }, { status: 401 }) };
  }
  const emailLc = (user.email ?? '').toLowerCase();
  if (ADMIN_EMAILS.includes(emailLc)) return { ok: true, email: emailLc };

  const adminClient = getBackupServiceClient();
  const { data: profile } = await adminClient
    .from('client_profiles')
    .select('status')
    .eq('user_id', user.id)
    .maybeSingle();
  if (profile?.status === 'admin') return { ok: true, email: emailLc };

  return { ok: false, response: NextResponse.json({ error: 'not_admin' }, { status: 403 }) };
}

interface DecideBody {
  order_id?: unknown;
  cohort_id?: unknown;
  actor?: unknown;
  system_suggestion?: unknown;
  decision?: unknown;
  rationale?: unknown;
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

  // order_id (bigint)
  const orderId = Number(body.order_id);
  if (!Number.isFinite(orderId) || orderId <= 0 || !Number.isInteger(orderId)) {
    return NextResponse.json({ error: 'invalid_order_id' }, { status: 400 });
  }

  // cohort_id (text, NOT NULL)
  if (typeof body.cohort_id !== 'string' || body.cohort_id.trim().length === 0) {
    return NextResponse.json({ error: 'invalid_cohort_id' }, { status: 400 });
  }
  const cohortId = body.cohort_id.trim();

  // decision (NOT NULL, validated set)
  if (typeof body.decision !== 'string' || !VALID_DECISIONS.includes(body.decision as Decision)) {
    return NextResponse.json(
      { error: 'invalid_decision', detail: `must be one of ${VALID_DECISIONS.join(', ')}` },
      { status: 400 },
    );
  }
  const decision = body.decision as Decision;

  // system_suggestion (NOT NULL on the table)
  if (typeof body.system_suggestion !== 'string' || body.system_suggestion.trim().length === 0) {
    return NextResponse.json({ error: 'invalid_system_suggestion' }, { status: 400 });
  }
  const systemSuggestion = body.system_suggestion.trim().slice(0, 2000);

  // rationale (nullable)
  let rationale: string | null = null;
  if (body.rationale !== undefined && body.rationale !== null) {
    if (typeof body.rationale !== 'string') {
      return NextResponse.json({ error: 'invalid_rationale' }, { status: 400 });
    }
    const t = body.rationale.trim();
    rationale = t.length > 0 ? t.slice(0, 4000) : null;
  }
  // 'differently' carries the real signal in the rationale -- require it.
  if (decision === 'differently' && (!rationale || rationale.length < 5)) {
    return NextResponse.json(
      { error: 'invalid_rationale', detail: "decision 'differently' requires a rationale (min 5 chars)" },
      { status: 400 },
    );
  }

  // actor: body wins (e.g. a named reviewer); else authenticated admin email;
  // else 'facu' (singular admin).
  let actor: string;
  if (typeof body.actor === 'string' && body.actor.trim().length > 0) {
    actor = body.actor.trim().slice(0, 200);
  } else {
    actor = auth.email && auth.email.length > 0 ? auth.email : 'facu';
  }

  const svc = getBackupServiceClient();

  // Load the order; it must exist and be a cohort lead.
  const { data: order, error: orderErr } = await svc
    .from('orders')
    .select('id, source, fulfillment_state, is_test, cohort_id')
    .eq('id', orderId)
    .maybeSingle();
  if (orderErr) {
    console.error('[cohort-review/decide] order read:', orderErr);
    return NextResponse.json({ error: 'order_read_failed', detail: orderErr.message }, { status: 500 });
  }
  if (!order) {
    return NextResponse.json({ error: 'order_not_found' }, { status: 404 });
  }
  if (order.source !== 'sample' || order.is_test === true) {
    return NextResponse.json({ error: 'not_a_cohort_order' }, { status: 422 });
  }
  if (!COHORT_STATES.includes(order.fulfillment_state)) {
    return NextResponse.json(
      { error: 'order_not_in_cohort_window', detail: `fulfillment_state is ${order.fulfillment_state}` },
      { status: 422 },
    );
  }

  // divergence: the reviewer's decision contradicts the system's send/nurture rec.
  // 'challenge'/'differently' diverge; 'approve' agrees.
  const divergence = decision !== 'approve';

  // Idempotent write on UNIQUE (cohort_id, order_id, actor). id is GENERATED
  // ALWAYS, so read-then-write rather than a PostgREST upsert (which would try
  // to write id on conflict).
  const { data: existing, error: existErr } = await svc
    .from('cohort_decisions')
    .select('id')
    .eq('cohort_id', cohortId)
    .eq('order_id', orderId)
    .eq('actor', actor)
    .maybeSingle();
  if (existErr) {
    console.error('[cohort-review/decide] existing read:', existErr);
    return NextResponse.json({ error: 'decision_read_failed', detail: existErr.message }, { status: 500 });
  }

  let writtenRow: unknown;
  if (existing) {
    const { data: updated, error: updErr } = await svc
      .from('cohort_decisions')
      .update({
        decision,
        rationale,
        system_suggestion: systemSuggestion,
        divergence,
        decided_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select('*')
      .maybeSingle();
    if (updErr) {
      console.error('[cohort-review/decide] update:', updErr);
      return NextResponse.json({ error: 'decision_update_failed', detail: updErr.message }, { status: 500 });
    }
    writtenRow = updated;
  } else {
    const { data: inserted, error: insErr } = await svc
      .from('cohort_decisions')
      .insert({
        cohort_id: cohortId,
        order_id: orderId,
        actor,
        system_suggestion: systemSuggestion,
        decision,
        rationale,
        divergence,
      })
      .select('*')
      .maybeSingle();
    if (insErr) {
      console.error('[cohort-review/decide] insert:', insErr);
      return NextResponse.json({ error: 'decision_insert_failed', detail: insErr.message }, { status: 500 });
    }
    writtenRow = inserted;
  }

  // On approve: advance qualified -> approved. Only from 'qualified' (the gate
  // that precedes approval); other states stay put (the decision is still logged).
  let advanced = false;
  if (decision === 'approve' && order.fulfillment_state === 'qualified') {
    const { error: advErr } = await svc
      .from('orders')
      .update({ fulfillment_state: 'approved' })
      .eq('id', orderId)
      .eq('fulfillment_state', 'qualified'); // guard against a concurrent transition
    if (advErr) {
      // The decision is already durably written; surface the advance failure but
      // do not roll back the recorded decision.
      console.error('[cohort-review/decide] advance:', advErr);
      return NextResponse.json(
        { error: 'advance_failed', detail: advErr.message, decision: writtenRow },
        { status: 500 },
      );
    }
    advanced = true;
  }

  return NextResponse.json({ ok: true, decision: writtenRow, advanced });
}
