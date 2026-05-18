// POST /api/admin/dispatch/[id]/status - Admin updates a dispatch lifecycle state.
// v1 | 2026-05-18 | Job_PM admin-port DISP [V8 SHADOW]
//
// Body: { status: DispatchStatus, tracking_number?: string, exception_note?: string }
// Validates the status transition, updates the dispatches row, and stamps the
// corresponding timestamp column (packed_at / picked_up_at / in_transit_at /
// delivered_at).
//
// Auth: must be signed in admin (client_profiles.status='admin').
// Returns the updated dispatches row.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';

import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';

type DispatchStatus =
  | 'awaiting_pack'
  | 'packed'
  | 'label_printed'
  | 'picked_up'
  | 'in_transit'
  | 'delivered'
  | 'exception';

const ALL_STATUSES: DispatchStatus[] = [
  'awaiting_pack',
  'packed',
  'label_printed',
  'picked_up',
  'in_transit',
  'delivered',
  'exception',
];

// Allowed forward transitions. exception is reachable from any non-terminal state.
const TRANSITIONS: Record<DispatchStatus, DispatchStatus[]> = {
  awaiting_pack: ['packed', 'exception'],
  packed: ['label_printed', 'exception'],
  label_printed: ['picked_up', 'exception'],
  picked_up: ['in_transit', 'exception'],
  in_transit: ['delivered', 'exception'],
  delivered: [],
  exception: ['awaiting_pack', 'packed', 'label_printed', 'picked_up', 'in_transit'],
};

interface StatusBody {
  status?: unknown;
  tracking_number?: unknown;
  exception_note?: unknown;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // Auth -------------------------------------------------------------------
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

  // Body -------------------------------------------------------------------
  let body: StatusBody;
  try {
    body = (await req.json()) as StatusBody;
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }

  const status = body.status;
  if (typeof status !== 'string' || !ALL_STATUSES.includes(status as DispatchStatus)) {
    return NextResponse.json(
      { error: 'invalid_status', detail: `must be one of: ${ALL_STATUSES.join(', ')}` },
      { status: 400 },
    );
  }
  const nextStatus = status as DispatchStatus;

  const trackingNumber =
    body.tracking_number == null
      ? undefined
      : typeof body.tracking_number === 'string'
        ? body.tracking_number.trim() || null
        : null;
  if (body.tracking_number != null && typeof body.tracking_number !== 'string') {
    return NextResponse.json(
      { error: 'invalid_tracking_number', detail: 'must be string or null' },
      { status: 400 },
    );
  }

  const exceptionNote =
    body.exception_note == null
      ? undefined
      : typeof body.exception_note === 'string'
        ? body.exception_note.trim() || null
        : null;
  if (body.exception_note != null && typeof body.exception_note !== 'string') {
    return NextResponse.json(
      { error: 'invalid_exception_note', detail: 'must be string or null' },
      { status: 400 },
    );
  }
  if (nextStatus === 'exception' && !exceptionNote) {
    return NextResponse.json(
      { error: 'missing_exception_note', detail: 'exception_note required when status=exception' },
      { status: 400 },
    );
  }

  // Look up current row ----------------------------------------------------
  const { data: existing, error: existingErr } = await adminClient
    .from('dispatches')
    .select('id, order_id, status')
    .eq('id', id)
    .maybeSingle();
  if (existingErr) {
    Sentry.captureException(existingErr, {
      tags: { route: 'admin/dispatch/status', step: 'existing_lookup' },
    });
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  if (!existing) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const current = existing.status as DispatchStatus;
  if (current !== nextStatus) {
    const allowed = TRANSITIONS[current];
    if (!allowed.includes(nextStatus)) {
      return NextResponse.json(
        {
          error: 'invalid_transition',
          detail: `cannot move ${current} -> ${nextStatus}`,
          allowed,
        },
        { status: 400 },
      );
    }
  }

  // Build update payload ---------------------------------------------------
  const nowIso = new Date().toISOString();
  const update: Record<string, unknown> = { status: nextStatus };
  if (trackingNumber !== undefined) update.tracking_number = trackingNumber;
  if (exceptionNote !== undefined) update.exception_note = exceptionNote;

  // Stamp timestamp columns on first transition INTO each state.
  if (nextStatus === 'packed') update.packed_at = nowIso;
  if (nextStatus === 'picked_up') update.picked_up_at = nowIso;
  if (nextStatus === 'in_transit') update.in_transit_at = nowIso;
  if (nextStatus === 'delivered') update.delivered_at = nowIso;

  const { data: updated, error: updateErr } = await adminClient
    .from('dispatches')
    .update(update)
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (updateErr) {
    Sentry.captureException(updateErr, {
      tags: { route: 'admin/dispatch/status', step: 'update' },
    });
    return NextResponse.json(
      { error: 'update_failed', detail: updateErr.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ dispatch: updated });
}
