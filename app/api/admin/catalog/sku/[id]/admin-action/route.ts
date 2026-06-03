// POST /api/admin/catalog/sku/[id]/admin-action
// v2 | 2026-06-03 | Job_PM — re-keyed to catalog_classifications uuid schema.
//
// [id] is the sku_id uuid (FK dim_sku). Body: { action: 'force_publish' |
// 'force_hide' | 'forward_to_rose' | 'reset', notes?: string }
//
// Per-SKU twin of /api/admin/catalog/approval-queue/action (which handles
// bulk lists). This route only touches catalog_classifications.
//
//   force_publish   -> status='admin_overridden_publish', reviewer_action='approve_publish'
//   force_hide      -> status='admin_overridden_hide',    reviewer_action='reject_hide'
//   forward_to_rose -> status='blocked',                  reviewer_action='forward_to_rose'
//   reset           -> clears reviewer_*; status -> 'blocked' (safe default) so the
//                      next validator/recompute run reclassifies cleanly. (We do
//                      not eagerly re-run the gates here.)
// Note: the deprecated 'needs_data_fix' status is gone from the CHECK; a row
// that needs Rose to fix data is 'blocked' until the recompute clears it.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';

import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';

type AdminAction = 'force_publish' | 'force_hide' | 'forward_to_rose' | 'reset';

const VALID_ACTIONS: readonly AdminAction[] = [
  'force_publish',
  'force_hide',
  'forward_to_rose',
  'reset',
];

interface ActionBody {
  action?: unknown;
  notes?: unknown;
}

function mapAction(action: AdminAction): {
  status: string;
  reviewer_action: string | null;
} {
  switch (action) {
    case 'force_publish':
      return { status: 'admin_overridden_publish', reviewer_action: 'approve_publish' };
    case 'force_hide':
      return { status: 'admin_overridden_hide', reviewer_action: 'reject_hide' };
    case 'forward_to_rose':
      return { status: 'blocked', reviewer_action: 'forward_to_rose' };
    case 'reset':
      return { status: 'blocked', reviewer_action: null };
  }
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const userClient = await createUserClient();
  const {
    data: { user },
    error: authErr,
  } = await userClient.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  const adminClient = getBackupServiceClient();
  const { data: profile } = await adminClient
    .from('client_profiles')
    .select('status')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!profile || profile.status !== 'admin') {
    return NextResponse.json({ error: 'not_admin' }, { status: 403 });
  }

  const { id } = await ctx.params;
  const skuId = (id ?? '').trim();
  if (!UUID_RE.test(skuId)) {
    return NextResponse.json({ error: 'invalid_sku_id', detail: 'sku_id must be a uuid' }, { status: 400 });
  }

  let body: ActionBody;
  try {
    body = (await req.json()) as ActionBody;
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }

  const action = body.action as AdminAction;
  if (!VALID_ACTIONS.includes(action)) {
    return NextResponse.json(
      { error: 'invalid_action', detail: `must be one of ${VALID_ACTIONS.join(', ')}` },
      { status: 400 },
    );
  }
  const notesRaw = typeof body.notes === 'string' ? body.notes.trim() : '';
  const notes = notesRaw.length > 0 ? notesRaw.slice(0, 2000) : null;

  const { status: newStatus, reviewer_action } = mapAction(action);
  const nowIso = new Date().toISOString();

  const update: Record<string, unknown> = {
    sku_id: skuId,
    status: newStatus,
    last_changed_at: nowIso,
  };
  if (action === 'reset') {
    update.reviewer_action = null;
    update.reviewer_at = null;
    update.reviewer_user_id = null;
    update.reviewer_notes = notes; // operator can still leave a note explaining the reset
  } else {
    update.reviewer_action = reviewer_action;
    update.reviewer_at = nowIso;
    update.reviewer_user_id = user.id;
    update.reviewer_notes = notes;
  }

  const backup = getBackupServiceClient();
  const { data: updated, error: updErr } = await backup
    .from('catalog_classifications')
    .upsert(update, { onConflict: 'sku_id' })
    .select('sku_id, status, reviewer_action, reviewer_at, reviewer_notes')
    .maybeSingle();
  if (updErr) {
    Sentry.captureException(updErr, {
      tags: { route: 'admin/catalog/sku/admin-action', action },
    });
    return NextResponse.json(
      { error: 'update_failed', detail: updErr.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, action, row: updated });
}
