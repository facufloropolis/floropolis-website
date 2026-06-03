// POST /api/admin/catalog/approval-queue/action
// v2 | 2026-06-03 | Job_PM — re-keyed to catalog_classifications uuid schema.
//
// Body: { sku_ids: string[] (uuid), action: 'approve_publish'|'reject_hide'|'forward_to_rose', notes?: string }
//
// Updates catalog_classifications.reviewer_action / reviewer_at /
// reviewer_user_id / reviewer_notes for the given SKU IDs (uuid, FK dim_sku).
// When action is 'approve_publish' or 'reject_hide' the matching status flips to
// the admin_overridden_* terminal state so the /shop filter respects Facu's call.
// 'forward_to_rose' parks the row back on Rose by setting status = 'blocked'
// (the only blocked-equivalent state in the current CHECK; the deprecated
// 'needs_data_fix' status no longer exists) and leaving the reviewer trail.
//
// Admin gate same as the rest of /admin: session user + client_profiles.status='admin'.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';

import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';

type ReviewerAction = 'approve_publish' | 'reject_hide' | 'forward_to_rose';

interface ActionBody {
  sku_ids?: unknown;
  action?: unknown;
  notes?: unknown;
}

const VALID_ACTIONS: readonly ReviewerAction[] = [
  'approve_publish',
  'reject_hide',
  'forward_to_rose',
];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseSkuIds(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v !== 'string' || !UUID_RE.test(v.trim())) return null;
    out.push(v.trim());
  }
  return out;
}

function statusForAction(action: ReviewerAction): string {
  if (action === 'approve_publish') return 'admin_overridden_publish';
  if (action === 'reject_hide') return 'admin_overridden_hide';
  // forward_to_rose: no 'needs_data_fix' status in the current CHECK; a row that
  // needs Rose to fix data is blocked from publish until fixed.
  return 'blocked';
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Auth gate ------------------------------------------------------------
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

  // Body parsing ---------------------------------------------------------
  let body: ActionBody;
  try {
    body = (await req.json()) as ActionBody;
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }

  const skuIds = parseSkuIds(body.sku_ids);
  if (!skuIds || skuIds.length === 0) {
    return NextResponse.json(
      { error: 'invalid_sku_ids', detail: 'must be a non-empty array of sku_id uuids' },
      { status: 400 },
    );
  }
  if (skuIds.length > 500) {
    return NextResponse.json(
      { error: 'too_many_skus', detail: 'max 500 per request' },
      { status: 400 },
    );
  }

  const action = body.action as ReviewerAction;
  if (!VALID_ACTIONS.includes(action)) {
    return NextResponse.json(
      { error: 'invalid_action', detail: `must be one of ${VALID_ACTIONS.join(', ')}` },
      { status: 400 },
    );
  }

  const notesRaw = typeof body.notes === 'string' ? body.notes.trim() : '';
  const notes = notesRaw.length > 0 ? notesRaw.slice(0, 2000) : null;

  // Update --------------------------------------------------------------
  const nowIso = new Date().toISOString();
  const newStatus = statusForAction(action);

  const { data: updated, error: updateErr } = await adminClient
    .from('catalog_classifications')
    .update({
      reviewer_action: action,
      reviewer_at: nowIso,
      reviewer_user_id: user.id,
      reviewer_notes: notes,
      status: newStatus,
      last_changed_at: nowIso,
    })
    .in('sku_id', skuIds)
    .select('sku_id');

  if (updateErr) {
    Sentry.captureException(updateErr, {
      tags: { route: 'admin/catalog/approval-queue/action', step: 'update' },
    });
    return NextResponse.json(
      { error: 'update_failed', detail: updateErr.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    updated_count: updated?.length ?? 0,
    action,
    sku_ids: skuIds,
  });
}
