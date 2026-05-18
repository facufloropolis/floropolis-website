// POST /api/admin/mapping/[id]/reject
// v1 | 2026-05-18 | Job_PM admin-port X5 [V8 SHADOW]
//
// Rejects a sku_mappings row directly. No admin_proposals are created -- the
// rejection is reversible (an admin can flip status back to awaiting_review
// later via a follow-up endpoint or a direct DB edit).
//
// Flow:
//   1. Auth + admin gate (email allowlist or client_profiles.status='admin').
//   2. Load mapping; refuse unless status is awaiting_review or low_confidence.
//   3. UPDATE status='rejected'.
//
// No body required.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';

import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';

const ADMIN_EMAILS = ['facu@floropolis.com', 'jjpj@crescoinversiones.com'];

interface AuthOk {
  ok: true;
  userId: string;
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
  if (ADMIN_EMAILS.includes(emailLc)) return { ok: true, userId: user.id };

  const adminClient = getBackupServiceClient();
  const { data: profile } = await adminClient
    .from('client_profiles')
    .select('status')
    .eq('user_id', user.id)
    .maybeSingle();
  if (profile?.status === 'admin') return { ok: true, userId: user.id };

  return {
    ok: false,
    response: NextResponse.json({ error: 'not_admin' }, { status: 403 }),
  };
}

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  if (typeof id !== 'string' || id.length === 0) {
    return NextResponse.json({ error: 'invalid_mapping_id' }, { status: 400 });
  }

  const service = getBackupServiceClient();

  const { data: mapping, error: readErr } = await service
    .from('sku_mappings')
    .select('id, status')
    .eq('id', id)
    .maybeSingle();
  if (readErr) {
    Sentry.captureException(readErr, {
      tags: { route: 'admin/mapping/reject', step: 'read' },
    });
    return NextResponse.json(
      { error: 'read_failed', detail: readErr.message },
      { status: 500 },
    );
  }
  if (!mapping) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  if (
    mapping.status !== 'awaiting_review' &&
    mapping.status !== 'low_confidence'
  ) {
    return NextResponse.json(
      {
        error: 'invalid_state',
        detail: `mapping status is ${mapping.status}`,
      },
      { status: 409 },
    );
  }

  const { data: updated, error: updErr } = await service
    .from('sku_mappings')
    .update({ status: 'rejected' })
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (updErr) {
    Sentry.captureException(updErr, {
      tags: { route: 'admin/mapping/reject', step: 'status_update' },
      extra: { mapping_id: id },
    });
    return NextResponse.json(
      { error: 'status_update_failed', detail: updErr.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, mapping: updated });
}
