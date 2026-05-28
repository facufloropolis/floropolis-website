// POST /api/admin/catalog/config/update - admin edits to catalog config.
// v1 | 2026-05-18 | Job_PM CAT-S7 [V8 SHADOW]
//
// Body: { table: 'pricing_constants' | 'box_master', key: string,
//         value?: number | string, active?: boolean }
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
import { ACTIVE_PRICING_MARKET, pricingConstantTargetId } from '@/lib/pricing-constants';

interface UpdateBody {
  table?: unknown;
  key?: unknown;
  market?: unknown;
  value?: unknown;
  active?: unknown;
  note?: unknown;
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
  const market =
    typeof body.market === 'string' && body.market.trim().length > 0
      ? body.market.trim()
      : null;
  const note =
    typeof body.note === 'string' && body.note.trim().length > 0
      ? body.note.trim()
      : null;
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
  if (table === 'pricing_constants' && !market) {
    return NextResponse.json(
      { error: 'invalid_market', detail: 'pricing_constants updates require a market key' },
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
  let valueText: string | null = null;
  if (hasValue) {
    if (table === 'pricing_constants' && key === 'chargeable_weight_rule') {
      if (typeof body.value !== 'string') {
        return NextResponse.json(
          { error: 'invalid_value', detail: 'chargeable_weight_rule must be a string' },
          { status: 400 },
        );
      }
      const allowed = ['dim_only', 'actual_only', 'max_actual_dim', 'verified_label'];
      if (!allowed.includes(body.value)) {
        return NextResponse.json(
          { error: 'invalid_value', detail: `chargeable_weight_rule must be one of ${allowed.join(', ')}` },
          { status: 400 },
        );
      }
      valueText = body.value;
    } else {
      const v = Number(body.value);
      if (!Number.isFinite(v)) {
        return NextResponse.json(
          { error: 'invalid_value', detail: 'value must be a finite number' },
          { status: 400 },
        );
      }
      valueNum = v;
      if (table === 'pricing_constants') {
        if (key === 'gpm_target' && (v <= 0 || v >= 1)) {
          return NextResponse.json(
            { error: 'invalid_value', detail: 'gpm_target must be a fraction between 0 and 1' },
            { status: 400 },
          );
        }
        if (key === 'fedex_rate_per_kg' && (v <= 0 || v >= 50)) {
          return NextResponse.json(
            { error: 'invalid_value', detail: 'fedex_rate_per_kg must be a positive USD/kg rate under $50' },
            { status: 400 },
          );
        }
        if (key === 'fuel_surcharge_mult' && (v <= 0 || v >= 5)) {
          return NextResponse.json(
            { error: 'invalid_value', detail: 'fuel_surcharge_mult must be a positive multiplier under 5x' },
            { status: 400 },
          );
        }
        if (key === 'dim_weight_divisor' && (v < 4000 || v > 7000)) {
          return NextResponse.json(
            {
              error: 'invalid_value',
              detail: 'dim_weight_divisor must be between 4000 and 7000 (FedEx uses 5000 US / 6000 international)',
            },
            { status: 400 },
          );
        }
      }
    }
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
    if (valueNum === null && valueText === null) {
      return NextResponse.json(
        { error: 'invalid_value', detail: 'pricing_constants requires "value"' },
        { status: 400 },
      );
    }
    const update: Record<string, unknown> = {
      updated_at: nowIso,
      updated_by: user.id,
    };
    if (valueNum !== null) update.value_numeric = valueNum;
    if (valueText !== null) update.value_text = valueText;
    const pricingMarket = market ?? ACTIVE_PRICING_MARKET;
    const { data: before, error: beforeErr } = await backup
      .from('pricing_constants')
      .select('*')
      .eq('id', key)
      .eq('market', pricingMarket)
      .maybeSingle();
    if (beforeErr) {
      Sentry.captureException(beforeErr, {
        tags: { route: 'admin/catalog/config/update', table: 'pricing_constants', step: 'read_before' },
      });
      return NextResponse.json(
        { error: 'read_failed', detail: beforeErr.message },
        { status: 500 },
      );
    }
    const { data: updated, error: updErr } = await backup
      .from('pricing_constants')
      .update(update)
      .eq('id', key)
      .eq('market', pricingMarket)
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
    const auditTargetId = pricingConstantTargetId(key, pricingMarket);
    const { error: auditErr } = await backup.from('override_audit').insert({
      proposal_id: null,
      target_table: 'pricing_constants',
      target_id: auditTargetId,
      before_jsonb: before as Record<string, unknown> | null,
      after_jsonb: updated as Record<string, unknown>,
      applied_by_function: 'admin.catalog.config.update',
      verification_notes: note,
    });
    if (auditErr) {
      Sentry.captureException(auditErr, {
        tags: { route: 'admin/catalog/config/update', table: 'pricing_constants', step: 'audit_insert' },
      });
    }
    return NextResponse.json({ row: updated, audit_logged: !auditErr });
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
