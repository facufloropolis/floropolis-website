// POST /api/admin/dispatch/[id]/arrival-confirm
// v1 | 2026-05-28 | Job_PM dispatch-v1-refactor [V8 SHADOW]
//
// Body: {} (no body required)
// Marks a dispatch as customer-confirmed-arrived. The Yesterday's Arrivals
// card in DispatchTodayPanel calls this when Facu clicks "Mark arrived ✓".
//
// Persistence strategy (belt-and-suspenders):
//   1. Insert a dispatch_communications row (channel='phone_note',
//      direction='inbound') as the durable arrival event log — this table
//      exists in Phase F migration and is guaranteed present.
//   2. Best-effort UPDATE dispatches.customer_arrival_confirmed_at = now().
//      If the column does not exist yet (migration pending), the update
//      is logged and ignored, since the comm row is already durable.
//
// Auth: admin (client_profiles.status='admin'); service-role writes.
// Same gate as /api/admin/dispatch/[id]/confirm.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';

import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // Auth
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

  // Verify the dispatch exists
  const { data: existing, error: existingErr } = await adminClient
    .from('dispatches')
    .select('id, status, delivered_at')
    .eq('id', id)
    .maybeSingle();
  if (existingErr || !existing) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const nowIso = new Date().toISOString();

  // 1. Durable comm row — guaranteed to land regardless of dispatches schema.
  const { error: commErr } = await adminClient
    .from('dispatch_communications')
    .insert({
      dispatch_id: id,
      channel: 'phone_note',
      direction: 'inbound',
      subject: 'Customer arrival confirmed',
      body: 'Admin marked customer arrival via Yesterday\'s Arrivals card.',
      sent_by: user.id,
      sent_at: nowIso,
      notes: 'arrival_confirmed',
    });
  if (commErr) {
    Sentry.captureException(commErr, {
      tags: { route: 'admin/dispatch/arrival-confirm', step: 'comm_insert' },
    });
    return NextResponse.json(
      { error: 'log_failed', detail: commErr.message },
      { status: 500 },
    );
  }

  // 2. Best-effort column update. If the column does not exist (migration
  // pending), this fails silently — the comm row remains as the source of truth.
  let columnUpdated = false;
  try {
    const { error: updErr } = await adminClient
      .from('dispatches')
      .update({ customer_arrival_confirmed_at: nowIso })
      .eq('id', id);
    if (!updErr) columnUpdated = true;
  } catch {
    // swallow — column may not exist yet
  }

  return NextResponse.json({ ok: true, columnUpdated });
}
