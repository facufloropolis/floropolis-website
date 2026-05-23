// POST /api/admin/proposals/batch-approve
// v1 | 2026-05-23 | Job_PM [V8 SHADOW]
//
// Batch-approves all awaiting_facu proposals from a given source_artifact.
// Used for the formula_deviation_audit_2026-05-23 batch (443 Ecoroses SKUs).
//
// Flow: auth + admin gate → mark all proposals approved → write one
// admin_approvals row recording the batch decision. Does NOT run the
// price update executor here — that is Atlas's job, gated on Rose confirming
// the ingest root cause is fixed.
//
// Body: { source_artifact: string; facu_rationale: string; urgency_tier?: string }

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

const VALID_URGENCY_TIERS = ['routine', 'urgent', 'critical'] as const;
type UrgencyTier = (typeof VALID_URGENCY_TIERS)[number];

export async function POST(req: NextRequest): Promise<NextResponse> {
  const userClient = await createUserClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const service = getBackupServiceClient();
  const emailLc = (user.email ?? '').toLowerCase();
  const isAdmin = ADMIN_EMAILS.includes(emailLc) || await (async () => {
    const { data: p } = await service.from('client_profiles').select('status').eq('user_id', user.id).maybeSingle();
    return p?.status === 'admin';
  })();
  if (!isAdmin) return NextResponse.json({ error: 'not_admin' }, { status: 403 });

  let body: { source_artifact?: unknown; facu_rationale?: unknown; urgency_tier?: unknown } = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad_json' }, { status: 400 }); }

  const artifact = typeof body.source_artifact === 'string' ? body.source_artifact.trim() : '';
  if (!artifact) return NextResponse.json({ error: 'source_artifact required' }, { status: 400 });

  const rationale = typeof body.facu_rationale === 'string' ? body.facu_rationale.trim() : '';
  if (rationale.length < 5) return NextResponse.json({ error: 'facu_rationale required (min 5 chars)' }, { status: 400 });

  const urgencyTier: UrgencyTier =
    typeof body.urgency_tier === 'string' && VALID_URGENCY_TIERS.includes(body.urgency_tier as UrgencyTier)
      ? (body.urgency_tier as UrgencyTier)
      : 'routine';

  // Count before updating
  const { count } = await service
    .from('admin_proposals')
    .select('id', { count: 'exact', head: true })
    .eq('source_artifact', artifact)
    .eq('status', 'awaiting_facu');

  if (!count || count === 0) {
    return NextResponse.json({ error: 'no_awaiting_proposals', detail: `No awaiting proposals for artifact: ${artifact}` }, { status: 404 });
  }

  // Mark all approved
  const { error: updErr } = await service
    .from('admin_proposals')
    .update({ status: 'approved' })
    .eq('source_artifact', artifact)
    .eq('status', 'awaiting_facu');

  if (updErr) return NextResponse.json({ error: 'update_failed', detail: updErr.message }, { status: 500 });

  // Record one batch approval row
  await service.from('admin_approvals').insert({
    decision: 'approve',
    decided_by: user.id,
    reason: `Batch approval of ${count} proposals from ${artifact}`,
    facu_rationale: rationale,
    urgency_tier: urgencyTier,
  });

  return NextResponse.json({ ok: true, approved: count, source_artifact: artifact });
}
