// POST /api/admin/supply/apply-fulfillment
// v1 | 2026-06-10 | Job_PM (CPO)
//
// CLOSES the FULFILLMENT loop at SCALE (vendor x box_type) by WORKING the actual
// gap -> the metric MOVES. On the live data the fulfillment lever is NOT a box-
// dims gap: every fulfillment SKU is Megaflor x EB whose box ALREADY carries
// FedEx dims; the REAL failing gate is missing_units_or_bunch (dim_sku has
// selling_unit but no stems_per_unit). So this executor drives off the real
// failing_gates token and sets the units field, NOT box_master dims.
//
//   missing_units_or_bunch + selling_unit = 'stem'
//       -> stems_per_unit = 1 is FACTUAL (one stem per stem-sold unit), not
//          invented. We set it for the gap SKUs and clear the gate.
//   missing_units_or_bunch + selling_unit != 'stem' (e.g. bunch)
//       -> the units count is NOT derivable; the caller must pass a real
//          stemsPerUnit (>0). Without it we refuse (honest: no fabrication).
//
// Then we clear missing_units_or_bunch in catalog_classifications and flip status
// to publishable when no blocking gate remains, re-read the engine independently,
// and report the real metric move.
//
//   body { vendor, boxType, stemsPerUnit? }       -> apply
//   body { vendor, boxType, reject:true, reason }  -> learn the reject, no write
//
// HARD BAR: REAL data only; loop reported closed ONLY when the gate actually
// cleared. NULL-safe, never throws on missing data. Auth mirrors /apply-image.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';
import { recordLoopLedger } from '@/lib/admin/loop-ledger';

const ADMIN_EMAILS = [
  'facu@floropolis.com',
  'jjpj@crescoinversiones.com',
  'jjpj@floropolis.com',
  'jjp@floropolis.com',
];

const UNITS_GATE = 'missing_units_or_bunch';

interface AuthOk { ok: true; userId: string; email: string }
interface AuthFail { ok: false; response: NextResponse }

async function requireAdmin(): Promise<AuthOk | AuthFail> {
  const userClient = await createUserClient();
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) {
    return { ok: false, response: NextResponse.json({ error: 'unauthenticated' }, { status: 401 }) };
  }
  const emailLc = (user.email ?? '').toLowerCase();
  if (ADMIN_EMAILS.includes(emailLc)) return { ok: true, userId: user.id, email: emailLc };
  const adminClient = getBackupServiceClient();
  const { data: profile } = await adminClient
    .from('client_profiles')
    .select('status')
    .eq('user_id', user.id)
    .maybeSingle();
  if (profile?.status === 'admin') return { ok: true, userId: user.id, email: emailLc };
  return { ok: false, response: NextResponse.json({ error: 'not_admin' }, { status: 403 }) };
}

interface FulfillmentBody {
  vendor?: unknown;
  boxType?: unknown;
  stemsPerUnit?: unknown;
  reject?: unknown;
  reason?: unknown;
}

function hasGate(failingGates: unknown, gate: string): boolean {
  return Array.isArray(failingGates) && failingGates.some((g) => g === gate);
}
function clearGate(failingGates: unknown, gate: string): string[] {
  if (!Array.isArray(failingGates)) return [];
  return failingGates.filter((g): g is string => typeof g === 'string' && g !== gate);
}
function key(v: unknown): string {
  return typeof v === 'string' ? v.trim().toLowerCase() : '';
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: FulfillmentBody = {};
  try {
    const raw = await req.text();
    if (raw.length > 0) body = JSON.parse(raw) as FulfillmentBody;
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }

  if (typeof body.vendor !== 'string' || body.vendor.trim().length === 0) {
    return NextResponse.json({ error: 'invalid_vendor' }, { status: 400 });
  }
  if (typeof body.boxType !== 'string' || body.boxType.trim().length === 0) {
    return NextResponse.json({ error: 'invalid_box_type' }, { status: 400 });
  }
  const vendor = body.vendor.trim().slice(0, 120);
  const boxType = body.boxType.trim().slice(0, 60);
  const vendorLc = vendor.toLowerCase();
  const boxTypeLc = boxType.toLowerCase();

  const svc = getBackupServiceClient();
  const decidedBy = auth.email || 'facu';
  const targetLabel = `${vendor} ${boxType}`;

  // REJECT branch ------------------------------------------------------------
  if (body.reject === true) {
    const reason =
      typeof body.reason === 'string' && body.reason.trim()
        ? body.reason.trim().slice(0, 2000)
        : null;
    const { error: fbErr } = await svc.from('supply_solution_feedback').insert({
      lever: 'fulfillment',
      target_variety: targetLabel,
      outcome: 'reject',
      reason,
      decided_by: decidedBy,
    });
    if (fbErr) console.error('[apply-fulfillment] solution_feedback reject:', fbErr);
    return NextResponse.json({ applied: false, rejected: true, vendor, boxType });
  }

  // APPLY branch -------------------------------------------------------------
  const overrideStems =
    typeof body.stemsPerUnit === 'number' && Number.isFinite(body.stemsPerUnit) && body.stemsPerUnit > 0
      ? Math.round(body.stemsPerUnit)
      : null;

  // 1) The units-gap SKUs in this vendor x box_type.
  const { data: skuRows, error: skuErr } = await svc
    .from('dim_sku')
    .select('sku_id, vendor_canonical_name, box_type, selling_unit, stems_per_unit, quarantined')
    .ilike('vendor_canonical_name', vendor)
    .limit(5000);
  if (skuErr) {
    console.error('[apply-fulfillment] dim_sku:', skuErr);
    return NextResponse.json({ error: 'sku_lookup_failed', detail: skuErr.message }, { status: 500 });
  }
  interface SkuRow {
    sku_id: string;
    vendor_canonical_name: string | null;
    box_type: string | null;
    selling_unit: string | null;
    stems_per_unit: number | null;
    quarantined: boolean | null;
  }
  const groupSkus = (skuRows ?? [])
    .map((r) => r as SkuRow)
    .filter((r) => r.quarantined !== true && key(r.box_type) === boxTypeLc && key(r.vendor_canonical_name) === vendorLc);
  const groupSkuIds = groupSkus.map((r) => r.sku_id);
  if (groupSkuIds.length === 0) {
    return NextResponse.json({ applied: false, reason: 'no_sku_for_group' });
  }
  const skuById = new Map<string, SkuRow>();
  for (const r of groupSkus) skuById.set(r.sku_id, r);

  // 2) Classifications: keep only the SKUs actually carrying the units gate.
  const { data: classRows, error: classErr } = await svc
    .from('catalog_classifications')
    .select('sku_id, failing_gates, blocking_gate_count, status')
    .in('sku_id', groupSkuIds);
  if (classErr) {
    console.error('[apply-fulfillment] catalog_classifications read:', classErr);
    return NextResponse.json({ error: 'class_read_failed', detail: classErr.message }, { status: 500 });
  }
  interface ClassRow { sku_id: string; failing_gates: unknown; blocking_gate_count: number | null; status: string | null }
  const classBySku = new Map<string, ClassRow>();
  for (const r of (classRows ?? []) as ClassRow[]) classBySku.set(r.sku_id, r);

  const gapSkuIds = groupSkuIds.filter((id) => {
    const cls = classBySku.get(id);
    return cls ? hasGate(cls.failing_gates, UNITS_GATE) : false;
  });
  if (gapSkuIds.length === 0) {
    await svc.from('supply_solution_feedback').insert({
      lever: 'fulfillment',
      target_variety: targetLabel,
      outcome: 'pick', // DB CHECK allows only {'pick','reject'}
      reason: 'no_units_gap_sku',
      metric_before: 0,
      metric_after: 0,
      decided_by: decidedBy,
    });
    return NextResponse.json({ applied: false, reason: 'no_units_gap_sku' });
  }

  // 3) Resolve the units value PER SKU. stem-sold -> 1 (factual). Otherwise the
  //    caller must pass a real stemsPerUnit; if they did not, we refuse those
  //    SKUs (no fabrication) and report them as needs_units_value.
  const nowIso = new Date().toISOString();
  const needsValue: string[] = [];
  let unitsWritten = 0;
  const writableIds: string[] = [];
  for (const id of gapSkuIds) {
    const s = skuById.get(id);
    const su = key(s?.selling_unit);
    let value: number | null = null;
    if (su === 'stem') value = 1; // one stem per stem-sold unit (factual)
    else if (overrideStems != null) value = overrideStems;
    if (value == null) {
      needsValue.push(id);
      continue;
    }
    const { error: uErr } = await svc
      .from('dim_sku')
      .update({ stems_per_unit: value })
      .eq('sku_id', id);
    if (uErr) {
      console.error('[apply-fulfillment] dim_sku update:', id, uErr);
      needsValue.push(id);
    } else {
      unitsWritten += 1;
      writableIds.push(id);
    }
  }

  if (writableIds.length === 0) {
    return NextResponse.json({
      applied: false,
      reason: 'needs_units_value',
      detail:
        'estos SKU no se venden por stem: pasa stemsPerUnit real (no se inventa) para cargar units',
      gapSkuCount: gapSkuIds.length,
      needsValue: needsValue.length,
    });
  }

  // 4) CLEAR the units gate for the SKUs we actually filled.
  let gatesCleared = 0;
  const gateErrors: string[] = [];
  const clearedIds: string[] = [];
  for (const id of writableIds) {
    const cls = classBySku.get(id);
    if (!cls || !hasGate(cls.failing_gates, UNITS_GATE)) continue;
    const nextGates = clearGate(cls.failing_gates, UNITS_GATE);
    const nextBlocking = Math.max(0, (cls.blocking_gate_count ?? 0) - 1);
    const nextStatus = nextBlocking === 0 ? 'publishable' : cls.status ?? 'blocked';
    const { error: gErr } = await svc
      .from('catalog_classifications')
      .update({
        failing_gates: nextGates,
        blocking_gate_count: nextBlocking,
        status: nextStatus,
        last_changed_at: nowIso,
        last_validated_at: nowIso,
      })
      .eq('sku_id', id);
    if (gErr) {
      console.error('[apply-fulfillment] gate clear:', id, gErr);
      gateErrors.push(id);
    } else {
      gatesCleared += 1;
      clearedIds.push(id);
    }
  }

  // 5) RE-READ engine + classification independently to confirm closure.
  const { data: recheckRecs } = await svc
    .from('v_supply_recommendations')
    .select('sku_id, gap_type')
    .in('sku_id', writableIds);
  const gapTypeAfter = new Map<string, string | null>();
  for (const r of (recheckRecs ?? []) as { sku_id: string; gap_type: string | null }[]) {
    gapTypeAfter.set(r.sku_id, r.gap_type);
  }
  const { data: recheckClass } = await svc
    .from('catalog_classifications')
    .select('sku_id, status, failing_gates')
    .in('sku_id', writableIds);
  const statusAfter = new Map<string, { status: string | null; failing: unknown }>();
  for (const r of (recheckClass ?? []) as ClassRow[]) {
    statusAfter.set(r.sku_id, { status: r.status, failing: r.failing_gates });
  }

  let closed = 0;
  let nowPublishable = 0;
  for (const id of writableIds) {
    const gt = gapTypeAfter.get(id);
    const leftFulfillment = gt !== 'fulfillment';
    const st = statusAfter.get(id);
    const gateGone = st ? !hasGate(st.failing, UNITS_GATE) : true;
    if (leftFulfillment && gateGone) closed += 1;
    if ((st?.status ?? '') === 'publishable') nowPublishable += 1;
  }

  // 4b) Record the loop ledger per cleared SKU so the apply-fulfillment close
  //     advances the streak. owner_agent = executing agent (Job_PM); the DB CHECK
  //     rejects 'Facu'. The inline close above already cleared the gate — no
  //     re-clear here (no double blocking_gate_count decrement). domain='catalog'
  //     (the units gate is a catalog-completeness gate, not images/content/price).
  for (const id of clearedIds) {
    const st = statusAfter.get(id);
    const ledger = await recordLoopLedger(svc, {
      skuId: id,
      gateId: UNITS_GATE,
      domain: 'catalog',
      ownerAgent: 'Job_PM',
      targetState: 'verified',
      routedVia: 'apply_fulfillment',
      evidence: {
        fix: { source: 'apply_fulfillment', vendor, boxType, stems_per_unit: overrideStems ?? 1, decided_by: decidedBy },
        before: { gate: UNITS_GATE, status: 'blocked' },
        after: { gate_cleared: true, publishable: (st?.status ?? '') === 'publishable' },
      },
    });
    if (!ledger.ok) console.error('[apply-fulfillment] loop ledger:', id, ledger.error);
  }

  const { error: fbErr } = await svc.from('supply_solution_feedback').insert({
    lever: 'fulfillment',
    target_variety: targetLabel,
    outcome: 'pick', // DB CHECK allows only {'pick','reject'}
    chosen_value: overrideStems != null ? `stems_per_unit=${overrideStems}` : 'stems_per_unit=1 (stem)',
    metric_before: gapSkuIds.length,
    metric_after: gapSkuIds.length - closed,
    decided_by: decidedBy,
  });
  if (fbErr) console.error('[apply-fulfillment] solution_feedback apply:', fbErr);

  return NextResponse.json({
    applied: true,
    loopClosed: closed > 0,
    vendor,
    boxType,
    gapSkuCount: gapSkuIds.length,
    unitsWritten,
    gatesCleared,
    gateErrors: gateErrors.length,
    needsValue: needsValue.length,
    closed,
    nowPublishable,
  });
}
