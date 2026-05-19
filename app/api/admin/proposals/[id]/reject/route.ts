// POST /api/admin/proposals/[id]/reject
// v1 | 2026-05-18 | Job_PM admin-foundation [V8 SHADOW]
//
// Rejects a proposal. No executor is invoked; no override_audit row is written.
// Flow:
//   1. Auth + admin gate.
//   2. Load proposal; refuse if not 'awaiting_facu'.
//   3. Insert admin_approvals row with decision='reject'.
//   4. UPDATE proposal status='rejected'.
//
// Body (optional): { reason?: string }

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

interface RejectBody {
  reason?: unknown;
  // Phase C (2026-05-19): Rose contract v1.0 P4 — facu_rationale required.
  facu_rationale?: unknown;
}

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

  let body: RejectBody = {};
  try {
    const raw = await req.text();
    if (raw.length > 0) body = JSON.parse(raw) as RejectBody;
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }
  let reason: string | null = null;
  if (body.reason !== undefined && body.reason !== null) {
    if (typeof body.reason !== 'string') {
      return NextResponse.json({ error: 'invalid_reason' }, { status: 400 });
    }
    const trimmed = body.reason.trim();
    reason = trimmed.length > 0 ? trimmed.slice(0, 2000) : null;
  }

  // facu_rationale is NOT NULL on admin_approvals. Min 5 chars.
  // If client only sent {reason}, accept that as the rationale for back-compat.
  let facuRationale: string | null = null;
  if (
    typeof body.facu_rationale === 'string' &&
    body.facu_rationale.trim().length >= 5
  ) {
    facuRationale = body.facu_rationale.trim().slice(0, 4000);
  } else if (reason && reason.length >= 5) {
    facuRationale = reason;
  } else {
    return NextResponse.json(
      {
        error: 'invalid_facu_rationale',
        detail: 'facu_rationale (or reason) is required, min 5 chars',
      },
      { status: 400 },
    );
  }

  const service = getBackupServiceClient();

  const { data: proposal, error: readErr } = await service
    .from('admin_proposals')
    .select('id, status')
    .eq('id', id)
    .maybeSingle();
  if (readErr) {
    Sentry.captureException(readErr, { tags: { route: 'admin/proposals/reject', step: 'read' } });
    return NextResponse.json({ error: 'read_failed', detail: readErr.message }, { status: 500 });
  }
  if (!proposal) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  if (proposal.status !== 'awaiting_facu') {
    return NextResponse.json(
      { error: 'invalid_state', detail: `proposal status is ${proposal.status}` },
      { status: 409 },
    );
  }

  const { error: apprErr } = await service.from('admin_approvals').insert({
    proposal_id: id,
    decision: 'reject',
    decided_by: auth.userId,
    reason,
    facu_rationale: facuRationale,
  });
  if (apprErr) {
    Sentry.captureException(apprErr, {
      tags: { route: 'admin/proposals/reject', step: 'approval_insert' },
      extra: { proposal_id: id },
    });
    return NextResponse.json(
      { error: 'approval_insert_failed', detail: apprErr.message },
      { status: 500 },
    );
  }

  const { data: updated, error: updErr } = await service
    .from('admin_proposals')
    .update({ status: 'rejected' })
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (updErr) {
    Sentry.captureException(updErr, {
      tags: { route: 'admin/proposals/reject', step: 'status_update' },
      extra: { proposal_id: id },
    });
    return NextResponse.json(
      { error: 'status_update_failed', detail: updErr.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, proposal: updated });
}
