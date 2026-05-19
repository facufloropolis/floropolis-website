// POST /api/admin/proposals/[id]/approve
// v1 | 2026-05-18 | Job_PM admin-foundation [V8 SHADOW]
//
// Approves a proposal. The flow:
//   1. Auth + admin gate (email allowlist or client_profiles.status='admin').
//   2. Load proposal; refuse if it's not in 'awaiting_facu'.
//   3. Call executeProposal -- this writes the change to the source table.
//   4. If executor failed -> 500 with the error, proposal stays awaiting_facu.
//   5. If executor succeeded -> insert override_audit rows, insert admin_approvals
//      row, then UPDATE proposal status='approved'.
//
// Body (optional): { reason?: string } -- recorded on admin_approvals.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';

import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';
import {
  executeProposal,
  type AdminProposal,
} from '@/lib/admin/proposal-executors';

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

interface ApproveBody {
  reason?: unknown;
  // Phase C (2026-05-19): Rose contract v1.0 P4 -- facu_rationale is mandatory.
  // urgency_tier drives SLA (routine 72h / urgent 12h / critical 4h).
  facu_rationale?: unknown;
  urgency_tier?: unknown;
}

const VALID_URGENCY_TIERS = ['routine', 'urgent', 'critical'] as const;
type UrgencyTier = (typeof VALID_URGENCY_TIERS)[number];

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

  let body: ApproveBody = {};
  try {
    const raw = await req.text();
    if (raw.length > 0) body = JSON.parse(raw) as ApproveBody;
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

  // facu_rationale (NOT NULL on admin_approvals per Rose contract). Min 5 chars.
  if (
    typeof body.facu_rationale !== 'string' ||
    body.facu_rationale.trim().length < 5
  ) {
    return NextResponse.json(
      {
        error: 'invalid_facu_rationale',
        detail: 'facu_rationale is required, min 5 chars',
      },
      { status: 400 },
    );
  }
  const facuRationale = body.facu_rationale.trim().slice(0, 4000);

  // urgency_tier (admin_approvals NOT NULL DEFAULT 'routine'). Optional in body.
  let urgencyTier: UrgencyTier = 'routine';
  if (body.urgency_tier !== undefined && body.urgency_tier !== null) {
    if (
      typeof body.urgency_tier !== 'string' ||
      !VALID_URGENCY_TIERS.includes(body.urgency_tier as UrgencyTier)
    ) {
      return NextResponse.json(
        {
          error: 'invalid_urgency_tier',
          detail: `must be one of ${VALID_URGENCY_TIERS.join(', ')}`,
        },
        { status: 400 },
      );
    }
    urgencyTier = body.urgency_tier as UrgencyTier;
    // Bumping above routine requires the rationale to specifically justify it.
    if (urgencyTier !== 'routine' && facuRationale.length < 20) {
      return NextResponse.json(
        {
          error: 'invalid_facu_rationale',
          detail: `urgency_tier=${urgencyTier} requires a rationale of at least 20 chars`,
        },
        { status: 400 },
      );
    }
  }

  const service = getBackupServiceClient();

  // 1. Load proposal
  const { data: proposalRow, error: readErr } = await service
    .from('admin_proposals')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (readErr) {
    Sentry.captureException(readErr, { tags: { route: 'admin/proposals/approve', step: 'read' } });
    return NextResponse.json({ error: 'read_failed', detail: readErr.message }, { status: 500 });
  }
  if (!proposalRow) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const proposal = proposalRow as AdminProposal;
  if (proposal.status !== 'awaiting_facu') {
    return NextResponse.json(
      { error: 'invalid_state', detail: `proposal status is ${proposal.status}` },
      { status: 409 },
    );
  }

  // 2. Execute
  const result = await executeProposal(proposal, service);
  if (!result.ok) {
    Sentry.captureMessage('proposal_executor_failed', {
      level: 'error',
      tags: { route: 'admin/proposals/approve', proposal_type: proposal.type },
      extra: { proposal_id: proposal.id, error: result.error },
    });
    return NextResponse.json(
      { error: 'execution_failed', detail: result.error ?? 'unknown' },
      { status: 500 },
    );
  }

  // 3. Write audit rows (best-effort: we already mutated, so log loudly on failure)
  if (result.auditEntries.length > 0) {
    const { error: auditErr } = await service
      .from('override_audit')
      .insert(result.auditEntries);
    if (auditErr) {
      Sentry.captureException(auditErr, {
        tags: { route: 'admin/proposals/approve', step: 'audit_insert' },
        extra: { proposal_id: proposal.id },
      });
      // Don't return -- the change is applied; we still want the approval recorded.
    }
  }

  // 4. Record approval
  const { error: apprErr } = await service.from('admin_approvals').insert({
    proposal_id: proposal.id,
    decision: 'approve',
    decided_by: auth.userId,
    reason,
    facu_rationale: facuRationale,
    urgency_tier: urgencyTier,
  });
  if (apprErr) {
    Sentry.captureException(apprErr, {
      tags: { route: 'admin/proposals/approve', step: 'approval_insert' },
      extra: { proposal_id: proposal.id },
    });
  }

  // 5. Transition proposal status
  const { data: updated, error: updErr } = await service
    .from('admin_proposals')
    .update({ status: 'approved' })
    .eq('id', proposal.id)
    .select('*')
    .maybeSingle();
  if (updErr) {
    Sentry.captureException(updErr, {
      tags: { route: 'admin/proposals/approve', step: 'status_update' },
      extra: { proposal_id: proposal.id },
    });
    return NextResponse.json(
      { error: 'status_update_failed', detail: updErr.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    proposal: updated,
    audit_count: result.auditEntries.length,
  });
}
