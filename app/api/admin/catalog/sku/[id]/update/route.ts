// POST /api/admin/catalog/sku/[id]/update
// v1 | 2026-05-18 | Job_PM CAT-S4 [V8 SHADOW]
//
// Body: { field: string, value: unknown }
//
// Single-field write to floropolis_inventory_mirror. After write, re-runs the
// 16-gate classifier on JUST this row and UPSERTs catalog_classifications so the
// detail page reflects the new state on router.refresh().
//
// Whitelist (only these fields are writable from the admin SKU editor):
//   price                 numeric  (>= 0)
//   deal_price            numeric  (>= 0, nullable)
//   deal_label            text     (<=120 chars, nullable)
//   deal_expiry           date     (YYYY-MM-DD, nullable)
//   is_on_deal            boolean
//   is_best_seller        boolean
//   is_featured           boolean
//   has_open_price_alert  boolean
//   cost_verified_at      date     (sentinel "__now__" -> today)
//   cost_source           text     (<=240 chars, nullable)
//   arrival_date          date     (nullable)
//   contents_note         text     (<=2000 chars, nullable)
//   images                jsonb    (string[] of URLs, max 12)
//   live                  boolean
//   active                boolean
//   margin_status         text     (TRACKED|PENDING|UNKNOWN|OVERRIDE)
//   vendor                text     (<=240 chars)
//   unit                  text     (Stem|Bunch|Box)
//
// Schema TODO fields rejected with structured error so the UI can surface a
// migration link:
//   last_harvested_date   -> error: 'schema_missing'
//   vase_life_days        -> error: 'schema_missing'

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';

import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';
import {
  classifySingleSku,
  type MirrorRow,
} from '@/lib/catalog-classifier';

interface UpdateBody {
  field?: unknown;
  value?: unknown;
}

const ALLOWED_FIELDS = new Set([
  'price',
  'deal_price',
  'deal_label',
  'deal_expiry',
  'is_on_deal',
  'is_best_seller',
  'is_featured',
  'has_open_price_alert',
  'cost_verified_at',
  'cost_source',
  'arrival_date',
  'contents_note',
  'images',
  'live',
  'active',
  'margin_status',
  'vendor',
  'unit',
]);

const SCHEMA_TODO_FIELDS = new Set(['last_harvested_date', 'vase_life_days']);

const MARGIN_STATUSES = new Set(['TRACKED', 'PENDING', 'UNKNOWN', 'OVERRIDE']);
const UNIT_VALUES = new Set(['Stem', 'Bunch', 'Box']);

function isIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isFinite(d.getTime());
}

function coerceValue(
  field: string,
  value: unknown,
): { ok: true; value: unknown } | { ok: false; detail: string } {
  // Booleans -------------------------------------------------------------
  if (
    field === 'is_on_deal' ||
    field === 'is_best_seller' ||
    field === 'is_featured' ||
    field === 'has_open_price_alert' ||
    field === 'live' ||
    field === 'active'
  ) {
    if (typeof value !== 'boolean') {
      return { ok: false, detail: `${field} must be boolean` };
    }
    return { ok: true, value };
  }

  // Numerics -------------------------------------------------------------
  if (field === 'price' || field === 'deal_price') {
    if (value === null) {
      if (field === 'price') return { ok: false, detail: 'price cannot be null' };
      return { ok: true, value: null };
    }
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) {
      return { ok: false, detail: `${field} must be a non-negative number` };
    }
    return { ok: true, value: Math.round(n * 10000) / 10000 };
  }

  // Dates ---------------------------------------------------------------
  if (
    field === 'deal_expiry' ||
    field === 'arrival_date' ||
    field === 'cost_verified_at'
  ) {
    if (value === null) return { ok: true, value: null };
    if (typeof value !== 'string') {
      return { ok: false, detail: `${field} must be a YYYY-MM-DD string or null` };
    }
    if (field === 'cost_verified_at' && value === '__now__') {
      // Sentinel: stamp with today's date in UTC
      const today = new Date().toISOString().slice(0, 10);
      return { ok: true, value: today };
    }
    if (!isIsoDate(value)) {
      return { ok: false, detail: `${field} must be YYYY-MM-DD` };
    }
    return { ok: true, value };
  }

  // Enumerated text ------------------------------------------------------
  if (field === 'margin_status') {
    if (value === null) return { ok: true, value: null };
    if (typeof value !== 'string' || !MARGIN_STATUSES.has(value)) {
      return {
        ok: false,
        detail: `margin_status must be one of ${Array.from(MARGIN_STATUSES).join(', ')}`,
      };
    }
    return { ok: true, value };
  }
  if (field === 'unit') {
    if (value === null) return { ok: true, value: null };
    if (typeof value !== 'string' || !UNIT_VALUES.has(value)) {
      return {
        ok: false,
        detail: `unit must be one of ${Array.from(UNIT_VALUES).join(', ')}`,
      };
    }
    return { ok: true, value };
  }

  // Free-text -----------------------------------------------------------
  if (field === 'deal_label' || field === 'cost_source' || field === 'vendor') {
    if (value === null) return { ok: true, value: null };
    if (typeof value !== 'string') {
      return { ok: false, detail: `${field} must be a string or null` };
    }
    const trimmed = value.trim();
    if (trimmed.length === 0) return { ok: true, value: null };
    if (trimmed.length > 240) {
      return { ok: false, detail: `${field} max 240 chars` };
    }
    return { ok: true, value: trimmed };
  }
  if (field === 'contents_note') {
    if (value === null) return { ok: true, value: null };
    if (typeof value !== 'string') {
      return { ok: false, detail: 'contents_note must be a string or null' };
    }
    const trimmed = value.trim();
    if (trimmed.length === 0) return { ok: true, value: null };
    if (trimmed.length > 2000) {
      return { ok: false, detail: 'contents_note max 2000 chars' };
    }
    return { ok: true, value: trimmed };
  }

  // images jsonb (string[]) ---------------------------------------------
  if (field === 'images') {
    if (value === null) return { ok: true, value: [] };
    if (!Array.isArray(value)) {
      return { ok: false, detail: 'images must be an array of URL strings' };
    }
    if (value.length > 12) {
      return { ok: false, detail: 'images max 12 entries' };
    }
    const out: string[] = [];
    for (const v of value) {
      if (typeof v !== 'string') {
        return { ok: false, detail: 'images entries must be strings' };
      }
      const t = v.trim();
      if (t.length === 0) continue;
      if (t.length > 600) {
        return { ok: false, detail: 'image url max 600 chars' };
      }
      out.push(t);
    }
    return { ok: true, value: out };
  }

  return { ok: false, detail: `field ${field} has no coercer (internal)` };
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
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

  // Params ---------------------------------------------------------------
  const { id } = await ctx.params;
  const skuId = Number.parseInt(id, 10);
  if (!Number.isFinite(skuId) || skuId <= 0) {
    return NextResponse.json({ error: 'invalid_sku_id' }, { status: 400 });
  }

  // Body -----------------------------------------------------------------
  let body: UpdateBody;
  try {
    body = (await req.json()) as UpdateBody;
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }

  const field = typeof body.field === 'string' ? body.field : '';
  if (!field) {
    return NextResponse.json(
      { error: 'invalid_field', detail: 'field is required' },
      { status: 400 },
    );
  }
  if (SCHEMA_TODO_FIELDS.has(field)) {
    return NextResponse.json(
      {
        error: 'schema_missing',
        detail: `column ${field} does not exist on floropolis_inventory_mirror yet; needs Rose migration`,
      },
      { status: 422 },
    );
  }
  if (!ALLOWED_FIELDS.has(field)) {
    return NextResponse.json(
      { error: 'field_not_allowed', detail: `field ${field} is not editable from this route` },
      { status: 400 },
    );
  }

  const coerced = coerceValue(field, body.value);
  if (!coerced.ok) {
    return NextResponse.json(
      { error: 'invalid_value', detail: coerced.detail },
      { status: 400 },
    );
  }

  // Update mirror --------------------------------------------------------
  const backup = getBackupServiceClient();
  const { error: updErr } = await backup
    .from('floropolis_inventory_mirror')
    .update({ [field]: coerced.value })
    .eq('id', skuId);
  if (updErr) {
    Sentry.captureException(updErr, {
      tags: { route: 'admin/catalog/sku/update', field, sku_id: String(skuId) },
    });
    return NextResponse.json(
      { error: 'update_failed', detail: updErr.message },
      { status: 500 },
    );
  }

  // Re-classify just this row -------------------------------------------
  const { data: freshRow, error: readErr } = await backup
    .from('floropolis_inventory_mirror')
    .select('*')
    .eq('id', skuId)
    .maybeSingle();
  if (readErr || !freshRow) {
    // Update succeeded but re-classify failed -- log + return partial success
    if (readErr) {
      Sentry.captureException(readErr, {
        tags: { route: 'admin/catalog/sku/update', step: 'reread' },
      });
    }
    return NextResponse.json({
      ok: true,
      field,
      value: coerced.value,
      reclassified: false,
      detail: 'row updated but re-read failed; next validator run will sync',
    });
  }

  // Need pricing constants / box weights to evaluate formula_deviation +
  // missing_box_dims gates. Fetch in parallel.
  const [pcRes, bmRes, existingClsRes] = await Promise.all([
    backup
      .from('pricing_constants')
      .select('id, value_numeric')
      .in('id', ['gpm_target', 'fedex_rate_per_kg', 'fuel_surcharge_mult']),
    backup.from('box_master').select('box_type, weight_kg').eq('active', true),
    backup
      .from('catalog_classifications')
      .select('status, last_changed_at, reviewer_action')
      .eq('sku_id', skuId)
      .maybeSingle(),
  ]);

  const pricingConstants: Record<string, number> = {};
  for (const r of pcRes.data ?? []) {
    if (typeof r.id === 'string' && typeof r.value_numeric === 'number') {
      pricingConstants[r.id] = r.value_numeric;
    } else if (typeof r.id === 'string' && r.value_numeric != null) {
      const n = Number(r.value_numeric);
      if (Number.isFinite(n)) pricingConstants[r.id] = n;
    }
  }
  const boxMaster: Record<string, number> = {};
  for (const r of bmRes.data ?? []) {
    if (typeof r.box_type === 'string' && r.weight_kg != null) {
      const n = Number(r.weight_kg);
      if (Number.isFinite(n)) boxMaster[r.box_type.toUpperCase().trim()] = n;
    }
  }

  const classification = classifySingleSku(
    freshRow as unknown as MirrorRow,
    { pricingConstants, boxMaster },
  );

  // Preserve admin overrides: if reviewer_action is set and status is
  // admin_overridden_*, don't clobber it -- only refresh failing_gates +
  // gate_score + last_validated_at. The override stays in force.
  const existingCls = existingClsRes.data;
  const isAdminOverridden =
    typeof existingCls?.status === 'string' &&
    existingCls.status.startsWith('admin_overridden_');

  const nowIso = new Date().toISOString();
  const nextStatus = isAdminOverridden ? existingCls!.status : classification.status;
  const statusChanged =
    !existingCls || existingCls.status !== nextStatus;

  const { error: clsErr } = await backup
    .from('catalog_classifications')
    .upsert(
      {
        sku_id: skuId,
        status: nextStatus,
        failing_gates: classification.failing_gates,
        gate_score: classification.gate_score,
        vendor: classification.vendor,
        tier: classification.tier,
        variety: classification.variety,
        last_validated_at: nowIso,
        last_changed_at: statusChanged ? nowIso : (existingCls?.last_changed_at ?? nowIso),
      },
      { onConflict: 'sku_id' },
    );
  if (clsErr) {
    Sentry.captureException(clsErr, {
      tags: { route: 'admin/catalog/sku/update', step: 'reclassify' },
    });
    return NextResponse.json({
      ok: true,
      field,
      value: coerced.value,
      reclassified: false,
      detail: `mirror updated but reclassify failed: ${clsErr.message}`,
    });
  }

  return NextResponse.json({
    ok: true,
    field,
    value: coerced.value,
    reclassified: true,
    classification: {
      status: nextStatus,
      gate_score: classification.gate_score,
      failing_gates: classification.failing_gates,
    },
  });
}
