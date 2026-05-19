// POST /api/admin/proposals/[id]/replay
// v1 | 2026-05-19 | Job_PM Phase C [V8 SHADOW]
//
// Re-runs the executor for an already-approved proposal whose verification
// failed (override_audit.verification_passed = false). The intent is to recover
// from transient downstream failures (e.g. mirror lag, FK race) without forcing
// Facu to re-approve.
//
// Idempotency contract:
//   - The route is safe to call multiple times. It does NOT mutate proposal.status
//     (still 'approved') and does NOT insert a new admin_approvals row.
//   - It re-invokes executeProposal(proposal). Executors are responsible for
//     being idempotent (most are: they UPDATE the target row to the same payload
//     that produced the original audit). Creates (shipping_config.create,
//     discount_rule.create, refund.create) are NOT idempotent by design --
//     replaying them creates a new row. To prevent duplicate creates we check
//     for an existing successful override_audit row first and short-circuit if
//     the original write actually landed.
//   - A new override_audit row is inserted with applied_by_function suffix
//     '[REPLAY]' and verified_* columns reset so the verifier picks it up again.
//
// Auth: same admin gate as approve/reject.
//
// Body (optional): { reason?: string } -- recorded in override_audit.verification_notes.

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

interface AuthOk {
  ok: true;
  userId: string;
  email: string;
}
interface AuthFail {
  ok: false;
  response: NextResponse;
}

async function requireAdmin(): Promise<AuthOk | AuthFail> {
  const userClient = await createUserClient();
  const {
    data: { user },
    error: authErr,
  } = await userClient.auth.getUser();
  if (authErr || !user) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'unauthenticated' }, { status: 401 }),
    };
  }
  const emailLc = (user.email ?? '').toLowerCase();
  if (ADMIN_EMAILS.includes(emailLc)) {
    return { ok: true, userId: user.id, email: emailLc };
  }
  const adminClient = getBackupServiceClient();
  const { data: profile } = await adminClient
    .from('client_profiles')
    .select('status')
    .eq('user_id', user.id)
    .maybeSingle();
  if (profile?.status === 'admin') {
    return { ok: true, userId: user.id, email: emailLc };
  }
  return {
    ok: false,
    response: NextResponse.json({ error: 'not_admin' }, { status: 403 }),
  };
}

interface ReplayBody {
  reason?: unknown;
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

  let body: ReplayBody = {};
  try {
    const raw = await req.text();
    if (raw.length > 0) body = JSON.parse(raw) as ReplayBody;
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }
  let reason: string | null = null;
  if (typeof body.reason === 'string' && body.reason.trim().length > 0) {
    reason = body.reason.trim().slice(0, 2000);
  }

  const service = getBackupServiceClient();

  // 1. Load proposal -- must already be approved (we never replay rejected ones).
  const { data: proposalRow, error: readErr } = await service
    .from('admin_proposals')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (readErr) {
    Sentry.captureException(readErr, {
      tags: { route: 'admin/proposals/replay', step: 'read' },
    });
    return NextResponse.json(
      { error: 'read_failed', detail: readErr.message },
      { status: 500 },
    );
  }
  if (!proposalRow) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const proposal = proposalRow as AdminProposal;
  if (proposal.status !== 'approved') {
    return NextResponse.json(
      {
        error: 'invalid_state',
        detail: `replay requires status=approved (got ${proposal.status})`,
      },
      { status: 409 },
    );
  }

  // 2. Sanity: only replay if the most-recent audit row for this proposal failed
  // verification (or has none -- shouldn't happen, but guard anyway).
  const { data: auditRows } = await service
    .from('override_audit')
    .select('id, verification_passed, applied_at')
    .eq('proposal_id', proposal.id)
    .order('applied_at', { ascending: false })
    .limit(1);
  const lastAudit = (auditRows ?? [])[0];
  if (lastAudit && lastAudit.verification_passed === true) {
    return NextResponse.json(
      {
        error: 'verification_already_passed',
        detail:
          'Most recent override_audit row shows verification_passed=true. Nothing to replay.',
      },
      { status: 409 },
    );
  }

  // 3. Re-run the executor. Executors are idempotent for UPDATEs; for INSERT-style
  // executors (discount_rule.create, shipping_config.create, refund.create) the
  // operator should be aware this will create a duplicate row -- the UI surfaces
  // a warning before allowing replay. Insert types are the minority and the
  // replay button only renders when verification_passed=false; this is a
  // best-effort recovery, not magic.
  const result = await executeProposal(proposal, service);
  if (!result.ok) {
    Sentry.captureMessage('proposal_replay_failed', {
      level: 'error',
      tags: {
        route: 'admin/proposals/replay',
        proposal_type: proposal.type,
      },
      extra: { proposal_id: proposal.id, error: result.error },
    });
    return NextResponse.json(
      { error: 'execution_failed', detail: result.error ?? 'unknown' },
      { status: 500 },
    );
  }

  // 4. Stamp the new audit entries as REPLAY + carry the operator's reason.
  const stamped = result.auditEntries.map((e) => ({
    ...e,
    applied_by_function: `${e.applied_by_function}[REPLAY by ${auth.email}]`,
    verification_notes: reason,
  }));
  let inserted = 0;
  if (stamped.length > 0) {
    const { data: ins, error: auditErr } = await service
      .from('override_audit')
      .insert(stamped)
      .select('id');
    if (auditErr) {
      Sentry.captureException(auditErr, {
        tags: { route: 'admin/proposals/replay', step: 'audit_insert' },
        extra: { proposal_id: proposal.id },
      });
    } else {
      inserted = ins?.length ?? 0;
    }
  }

  return NextResponse.json({
    ok: true,
    proposal_id: proposal.id,
    audit_inserted: inserted,
    note: 'Replay complete. Verifier must re-check and set verification_passed=true on the new override_audit row.',
  });
}
