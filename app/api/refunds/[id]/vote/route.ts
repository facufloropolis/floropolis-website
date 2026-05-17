// PATCH /api/refunds/[id]/vote — Admin (JJ or Facu) records approval vote.
// v1 | 2026-05-17 | Job_PM W4-S13 [V8 SHADOW]
//
// Body: { approver: 'jj' | 'facu', approved: boolean }
// Updates jj_approved | facu_approved + *_approved_at + *_user_id on the row.
// The DB trigger compute_refund_quorum() recomputes quorum_met (D1 §refund_approvals).
//
// Auth: must be signed in admin (client_profiles.status='admin').
// Returns the updated refund_approvals row.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';

import { createClient as createUserClient } from '@/lib/supabase/server';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';

interface VoteBody {
  approver?: unknown;
  approved?: unknown;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: idParam } = await params;
  const refundApprovalId = Number(idParam);
  if (!Number.isFinite(refundApprovalId) || refundApprovalId <= 0) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // Auth ------------------------------------------------------------------
  const userClient = await createUserClient();
  const {
    data: { user },
    error: authErr,
  } = await userClient.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const { data: profile } = await userClient
    .from('client_profiles')
    .select('status')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!profile || profile.status !== 'admin') {
    return NextResponse.json({ error: 'not_admin' }, { status: 403 });
  }

  // Body ------------------------------------------------------------------
  let body: VoteBody;
  try {
    body = (await req.json()) as VoteBody;
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }

  const approver = body.approver;
  const approved = body.approved;
  if (approver !== 'jj' && approver !== 'facu') {
    return NextResponse.json(
      { error: 'invalid_approver', detail: 'must be "jj" or "facu"' },
      { status: 400 },
    );
  }
  if (typeof approved !== 'boolean') {
    return NextResponse.json(
      { error: 'invalid_approved', detail: 'must be boolean' },
      { status: 400 },
    );
  }

  // Build update payload ---------------------------------------------------
  const nowIso = new Date().toISOString();
  const update: Record<string, unknown> =
    approver === 'jj'
      ? {
          jj_approved: approved,
          jj_approved_at: nowIso,
          jj_user_id: user.id,
        }
      : {
          facu_approved: approved,
          facu_approved_at: nowIso,
          facu_user_id: user.id,
        };

  const backup = getBackupServiceClient();

  // Ensure row exists + is still pending.
  const { data: existing, error: existingErr } = await backup
    .from('refund_approvals')
    .select('id, status')
    .eq('id', refundApprovalId)
    .maybeSingle();
  if (existingErr) {
    Sentry.captureException(existingErr, {
      tags: { route: 'refunds/vote', step: 'existing_lookup' },
    });
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  if (!existing) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  if (existing.status !== 'pending') {
    return NextResponse.json(
      { error: 'not_pending', detail: `status=${existing.status}` },
      { status: 400 },
    );
  }

  const { data: updated, error: updateErr } = await backup
    .from('refund_approvals')
    .update(update)
    .eq('id', refundApprovalId)
    .select('*')
    .maybeSingle();

  if (updateErr) {
    Sentry.captureException(updateErr, {
      tags: { route: 'refunds/vote', step: 'update' },
    });
    return NextResponse.json(
      { error: 'update_failed', detail: updateErr.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ refund_approval: updated });
}
