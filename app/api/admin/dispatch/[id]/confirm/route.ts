// POST /api/admin/dispatch/[id]/confirm
// v1 | 2026-05-19 | Job_PM Phase F [V8 SHADOW]
//
// Body: { kind: 'driver_pickup' | 'fedex', value: boolean }
// Flips dispatches.driver_pickup_confirmed[_at] or dispatches.fedex_confirmed[_at].
//
// Auth: admin (client_profiles.status='admin'); service-role writes the row.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';

import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';

type ConfirmKind = 'driver_pickup' | 'fedex';
const KINDS: ConfirmKind[] = ['driver_pickup', 'fedex'];

interface ConfirmBody {
  kind?: unknown;
  value?: unknown;
}

export async function POST(
  req: NextRequest,
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

  let body: ConfirmBody;
  try {
    body = (await req.json()) as ConfirmBody;
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }

  if (typeof body.kind !== 'string' || !KINDS.includes(body.kind as ConfirmKind)) {
    return NextResponse.json(
      { error: 'invalid_kind', detail: `must be one of: ${KINDS.join(', ')}` },
      { status: 400 },
    );
  }
  if (typeof body.value !== 'boolean') {
    return NextResponse.json({ error: 'invalid_value', detail: 'must be boolean' }, { status: 400 });
  }

  const { data: existing, error: existingErr } = await adminClient
    .from('dispatches')
    .select('id')
    .eq('id', id)
    .maybeSingle();
  if (existingErr || !existing) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const nowIso = new Date().toISOString();
  const update: Record<string, unknown> = {};
  if (body.kind === 'driver_pickup') {
    update.driver_pickup_confirmed = body.value;
    update.driver_pickup_confirmed_at = body.value ? nowIso : null;
  } else {
    update.fedex_confirmed = body.value;
    update.fedex_confirmed_at = body.value ? nowIso : null;
  }

  const { data: updated, error: updErr } = await adminClient
    .from('dispatches')
    .update(update)
    .eq('id', id)
    .select('id, driver_pickup_confirmed, driver_pickup_confirmed_at, fedex_confirmed, fedex_confirmed_at')
    .maybeSingle();
  if (updErr) {
    Sentry.captureException(updErr, {
      tags: { route: 'admin/dispatch/confirm', step: 'update' },
    });
    return NextResponse.json(
      { error: 'update_failed', detail: updErr.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ dispatch: updated });
}
