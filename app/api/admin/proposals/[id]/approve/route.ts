// POST /api/admin/proposals/[id]/approve
// v4 | 2026-05-27 | Job_PM [V8 SHADOW]
//
// Approves a proposal. The flow:
//   1. Auth + admin gate (email allowlist or client_profiles.status='admin').
//   2. Load proposal; refuse if it's not in 'awaiting_facu'.
//   3. Stale guard: if proposal.payload.source_snapshot exists, compare
//      current floropolis_inventory_mirror fields against the snapshot.
//      If any watched field changed, return 409 stale_source.
//   4. Call executeProposal -- this writes the change to the source table.
//   5. If executor failed -> 500 with the error, proposal stays awaiting_facu.
//   6. If executor succeeded -> insert override_audit rows, insert admin_approvals
//      row, then UPDATE proposal status='approved'.
//
// Body (optional): { reason?: string } -- recorded on admin_approvals.
//
// v4 removed the post-approval execSync agent-fire block: it shelled out to
// `python3 /Users/facu/Claude_MA_v8/...` which does not exist on Vercel (no
// Python runtime, no local Mac path). It was dead code in production, silently
// swallowed by try/catch. Cross-process agent firing, if reintroduced, belongs
// in a Supabase Edge Function or webhook, not a Next.js route handler.

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

const ADMIN_EMAILS = [
  'facu@floropolis.com',
  'jjpj@crescoinversiones.com',
  'jjpj@floropolis.com',
  'jjp@floropolis.com',
];

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

  // 2. Stale guard (only for proposals that carry a source_snapshot in payload)
  // Recommendation proposals created by the generator embed a snapshot of the
  // mirror fields they were based on. If Rose updated those fields since the
  // proposal was created, executing it would act on stale data.
  const proposalPayload = proposal.payload as Record<string, unknown> | null ?? {};
  const sourceSnapshot = proposalPayload.source_snapshot;
  if (
    sourceSnapshot !== null &&
    typeof sourceSnapshot === 'object' &&
    typeof proposalPayload.sku_id === 'number'
  ) {
    const snap = sourceSnapshot as Record<string, unknown>;
    const { data: currentMirrorRow } = await service
      .from('floropolis_inventory_mirror')
      .select('price, has_open_price_alert, contents_note')
      .eq('id', proposalPayload.sku_id)
      .maybeSingle();

    if (currentMirrorRow) {
      const staleFields: string[] = [];

      if ('price' in snap) {
        const snapPrice = Number(snap.price);
        const nowPrice = Number(currentMirrorRow.price);
        if (!Number.isNaN(snapPrice) && !Number.isNaN(nowPrice) && Math.abs(nowPrice - snapPrice) > 0.005) {
          staleFields.push(`price: was ${snap.price}, now ${currentMirrorRow.price}`);
        }
      }
      if ('has_open_price_alert' in snap && currentMirrorRow.has_open_price_alert !== snap.has_open_price_alert) {
        staleFields.push(`open_price_alert: was ${snap.has_open_price_alert}, now ${currentMirrorRow.has_open_price_alert}`);
      }
      if ('contents_note' in snap) {
        const snapHasNote = snap.contents_note != null && String(snap.contents_note).trim().length > 0;
        const nowHasNote = currentMirrorRow.contents_note != null && String(currentMirrorRow.contents_note).trim().length > 0;
        if (snapHasNote !== nowHasNote) {
          staleFields.push(`contents_note: was ${snapHasNote ? 'present' : 'null'}, now ${nowHasNote ? 'present' : 'null'}`);
        }
      }

      if (staleFields.length > 0) {
        return NextResponse.json(
          {
            error: 'stale_source',
            detail: `Source data changed since this proposal was created: ${staleFields.join('; ')}. Reload the queue to see current data.`,
            stale_fields: staleFields,
          },
          { status: 409 },
        );
      }
    }
  }

  // 3a. Flow B types are applied by Rose's dim_sku_apply_executor.py (Python), NOT the TS
  //     executor — they have no TS handler (would hit unknown_proposal_type -> 500). For these
  //     we ONLY record the approval + flip status='approved'; Rose's executor (Pita-certified)
  //     picks up status='approved' AND applied_at IS NULL and writes dim_sku.
  const ROSE_APPLIED_TYPES = new Set([
    'catalog.add_variety',
    'catalog.update_identity',
    'catalog.quarantine',
  ]);
  if (ROSE_APPLIED_TYPES.has(proposal.type)) {
    await service.from('admin_approvals').insert({
      proposal_id: proposal.id,
      decision: 'approve',
      decided_by: auth.userId,
      reason,
      facu_rationale: facuRationale,
      urgency_tier: urgencyTier,
    });
    const { error: rErr } = await service
      .from('admin_proposals')
      .update({ status: 'approved' })
      .eq('id', proposal.id);
    if (rErr) {
      return NextResponse.json({ error: 'approve_failed', detail: rErr.message }, { status: 500 });
    }
    return NextResponse.json({
      ok: true,
      status: 'approved',
      applied_by: 'rose_executor_async',
      note: 'Aprobado. Queda en cola para el dim_sku apply executor de Rose (escribe dim_sku en su próxima corrida).',
    });
  }

  // 3. Execute
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
