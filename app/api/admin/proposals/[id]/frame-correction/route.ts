// POST /api/admin/proposals/[id]/frame-correction
// v1 | 2026-05-26 | Job_PM [V8 SHADOW]
//
// Third decision path: Facu disagrees with the premise of the proposal,
// not just the answer. Captures structured correction so the system learns
// what it got wrong vs what is actually true.
//
// Flow:
//   1. Auth + admin gate.
//   2. Load proposal; refuse if not 'awaiting_facu'.
//   3. Validate { what_is_wrong, what_should_be_true } (min 20 chars each).
//   4. Insert admin_approvals: decision='framing_rejected', correction_data.
//   5. Insert override_audit: before=awaiting_facu, after=framing_rejected + correction.
//   6. UPDATE admin_proposals.status = 'framing_rejected'.
//
// No executor is called. Nothing changes in the target table.
// The correction is the output -- it routes to whoever generates proposals
// so they can re-propose with the correct framing.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';

import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';

const ADMIN_EMAILS = ['facu@floropolis.com', 'jjpj@crescoinversiones.com'];

interface AuthOk { ok: true; userId: string }
interface AuthFail { ok: false; response: NextResponse }

async function requireAdmin(): Promise<AuthOk | AuthFail> {
  const userClient = await createUserClient();
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) {
    return { ok: false, response: NextResponse.json({ error: 'unauthenticated' }, { status: 401 }) };
  }
  const emailLc = (user.email ?? '').toLowerCase();
  if (ADMIN_EMAILS.includes(emailLc)) return { ok: true, userId: user.id };

  const adminClient = getBackupServiceClient();
  const { data: profile } = await adminClient
    .from('client_profiles')
    .select('status')
    .eq('user_id', user.id)
    .maybeSingle();
  if (profile?.status === 'admin') return { ok: true, userId: user.id };

  return { ok: false, response: NextResponse.json({ error: 'not_admin' }, { status: 403 }) };
}

interface FrameCorrectionBody {
  what_is_wrong?: unknown;
  what_should_be_true?: unknown;
}

const MIN_LEN = 20;
const MAX_LEN = 4000;

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  if (typeof id !== 'string' || id.length === 0) {
    return NextResponse.json({ error: 'invalid_proposal_id' }, { status: 400 });
  }

  let body: FrameCorrectionBody = {};
  try {
    const raw = await req.text();
    if (raw.length > 0) body = JSON.parse(raw) as FrameCorrectionBody;
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }

  if (typeof body.what_is_wrong !== 'string' || body.what_is_wrong.trim().length < MIN_LEN) {
    return NextResponse.json({
      error: 'invalid_what_is_wrong',
      detail: `what_is_wrong is required, min ${MIN_LEN} chars`,
    }, { status: 400 });
  }
  if (typeof body.what_should_be_true !== 'string' || body.what_should_be_true.trim().length < MIN_LEN) {
    return NextResponse.json({
      error: 'invalid_what_should_be_true',
      detail: `what_should_be_true is required, min ${MIN_LEN} chars`,
    }, { status: 400 });
  }

  const whatIsWrong = body.what_is_wrong.trim().slice(0, MAX_LEN);
  const whatShouldBeTrue = body.what_should_be_true.trim().slice(0, MAX_LEN);
  const correctionData = { what_is_wrong: whatIsWrong, what_should_be_true: whatShouldBeTrue };
  const facuRationale = `FRAMING WRONG: ${whatIsWrong} | SHOULD BE: ${whatShouldBeTrue}`;

  const service = getBackupServiceClient();

  const { data: proposalRow, error: readErr } = await service
    .from('admin_proposals')
    .select('id, status, type, target_table, target_id')
    .eq('id', id)
    .maybeSingle();
  if (readErr) {
    Sentry.captureException(readErr, { tags: { route: 'admin/proposals/frame-correction', step: 'read' } });
    return NextResponse.json({ error: 'read_failed', detail: readErr.message }, { status: 500 });
  }
  if (!proposalRow) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  if (proposalRow.status !== 'awaiting_facu') {
    return NextResponse.json({
      error: 'invalid_state',
      detail: `proposal status is ${proposalRow.status}`,
    }, { status: 409 });
  }

  // Insert admin_approvals row
  const { error: apprErr } = await service.from('admin_approvals').insert({
    proposal_id: id,
    decision: 'framing_rejected',
    decided_by: auth.userId,
    facu_rationale: facuRationale,
    correction_data: correctionData,
  });
  if (apprErr) {
    Sentry.captureException(apprErr, {
      tags: { route: 'admin/proposals/frame-correction', step: 'approval_insert' },
      extra: { proposal_id: id },
    });
    return NextResponse.json({ error: 'approval_insert_failed', detail: apprErr.message }, { status: 500 });
  }

  // Write override_audit so AuditDrillDown surfaces the correction
  const { error: auditErr } = await service.from('override_audit').insert({
    proposal_id: id,
    target_table: proposalRow.target_table,
    target_id: proposalRow.target_id,
    before_jsonb: { status: 'awaiting_facu' },
    after_jsonb: {
      status: 'framing_rejected',
      correction: correctionData,
    },
    applied_by_function: 'frame_correction',
  });
  if (auditErr) {
    Sentry.captureException(auditErr, {
      tags: { route: 'admin/proposals/frame-correction', step: 'audit_insert' },
      extra: { proposal_id: id },
    });
    // Don't block -- correction is recorded in admin_approvals already
  }

  // Transition proposal status
  const { data: updated, error: updErr } = await service
    .from('admin_proposals')
    .update({ status: 'framing_rejected' })
    .eq('id', id)
    .select('id, status, type, target_table, target_id')
    .maybeSingle();
  if (updErr) {
    Sentry.captureException(updErr, {
      tags: { route: 'admin/proposals/frame-correction', step: 'status_update' },
      extra: { proposal_id: id },
    });
    return NextResponse.json({ error: 'status_update_failed', detail: updErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    proposal: updated,
    correction: correctionData,
  });
}
