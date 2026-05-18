// POST /api/admin/catalog/config/update - admin edits to catalog config.
// v1 | 2026-05-18 | Job_PM CAT-S7 [V8 SHADOW]
//
// Body: { table: 'pricing_constants' | 'box_master', key: string,
//         value?: number, active?: boolean }
//
// Validates admin role server-side (user-context auth check + service-role
// client_profiles lookup to bypass RLS) and writes via the service-role
// client. Returns the updated row.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';

import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';

interface UpdateBody {
  table?: unknown;
  key?: unknown;
  value?: unknown;
  active?: unknown;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Auth ------------------------------------------------------------------
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

  // Body ------------------------------------------------------------------
  let body: UpdateBody;
  try {
    body = (await req.json()) as UpdateBody;
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }

  const table = body.table;
  const key = body.key;
  if (table !== 'pricing_constants' && table !== 'box_master') {
    return NextResponse.json(
      { error: 'invalid_table', detail: 'must be "pricing_constants" or "box_master"' },
      { status: 400 },
    );
  }
  if (typeof key !== 'string' || key.length === 0 || key.length > 64) {
    return NextResponse.json(
      { error: 'invalid_key', detail: 'must be a non-empty string up to 64 chars' },
      { status: 400 },
    );
  }

  const hasValue = body.value !== undefined;
  const hasActive = body.active !== undefined;
  if (!hasValue && !hasActive) {
    return NextResponse.json(
      { error: 'no_change', detail: 'must include "value" or "active"' },
      { status: 400 },
    );
  }

  let valueNum: number | null = null;
  if (hasValue) {
    const v = Number(body.value);
    if (!Number.isFinite(v)) {
      return NextResponse.json(
        { error: 'invalid_value', detail: 'value must be a finite number' },
        { status: 400 },
      );
    }
    valueNum = v;
  }

  let activeBool: boolean | null = null;
  if (hasActive) {
    if (typeof body.active !== 'boolean') {
      return NextResponse.json(
        { error: 'invalid_active', detail: 'active must be boolean' },
        { status: 400 },
      );
    }
    activeBool = body.active;
  }

  const nowIso = new Date().toISOString();
  const backup = getBackupServiceClient();

  // Update pricing_constants ---------------------------------------------
  if (table === 'pricing_constants') {
    if (valueNum === null) {
      return NextResponse.json(
        { error: 'invalid_value', detail: 'pricing_constants requires "value"' },
        { status: 400 },
      );
    }
    const update: Record<string, unknown> = {
      value_numeric: valueNum,
      updated_at: nowIso,
      updated_by: user.id,
    };
    const { data: updated, error: updErr } = await backup
      .from('pricing_constants')
      .update(update)
      .eq('id', key)
      .select('*')
      .maybeSingle();
    if (updErr) {
      Sentry.captureException(updErr, {
        tags: { route: 'admin/catalog/config/update', table: 'pricing_constants' },
      });
      return NextResponse.json(
        { error: 'update_failed', detail: updErr.message },
        { status: 500 },
      );
    }
    if (!updated) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    return NextResponse.json({ row: updated });
  }

  // Update box_master -----------------------------------------------------
  const update: Record<string, unknown> = { updated_at: nowIso };
  if (valueNum !== null) {
    if (valueNum <= 0) {
      return NextResponse.json(
        { error: 'invalid_value', detail: 'weight_kg must be > 0' },
        { status: 400 },
      );
    }
    update.weight_kg = valueNum;
    update.validated_at = nowIso;
  }
  if (activeBool !== null) {
    update.active = activeBool;
  }

  const { data: updated, error: updErr } = await backup
    .from('box_master')
    .update(update)
    .eq('box_type', key)
    .select('*')
    .maybeSingle();
  if (updErr) {
    Sentry.captureException(updErr, {
      tags: { route: 'admin/catalog/config/update', table: 'box_master' },
    });
    return NextResponse.json(
      { error: 'update_failed', detail: updErr.message },
      { status: 500 },
    );
  }
  if (!updated) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json({ row: updated });
}
