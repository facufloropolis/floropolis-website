// POST /api/admin/supply/apply-content
// v1 | 2026-06-10 | Job_PM (CPO)
//
// CLOSES the CONTENT loop at SCALE (category x box_type) by WORKING the solution
// -> the metric MOVES (the missing_contents_description gate clears, SKUs become
// publishable). Mirrors apply-image exactly, but for the content lever and at the
// category x box scale axis (one authored note covers every variety in the group).
//
// The contents description is AUTHORED copy (not derivable factually), so unlike
// dims/units it cannot be auto-filled: Facu provides the note (body.note). We
// write that real note into product_chrome.description for every content-GAP SKU
// in the (category, box_type) group, then clear missing_contents_description in
// catalog_classifications and flip status to publishable when no blocking gate
// remains -- the same gate the engine's content lever reads. We re-read the
// engine + classification independently and report the real metric move.
//
//   body { category, boxType, note }            -> apply (write + clear gate)
//   body { category, boxType, reject:true, reason } -> learn the reject, no write
//
// HARD BAR: REAL data only (the note is Facu's real text, never invented); the
// loop is reported closed ONLY when the gate actually cleared. NULL-safe, never
// throws on missing data -> honest reason codes. Auth mirrors /apply-image.

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

const CONTENT_GATE = 'missing_contents_description';

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

interface ContentBody {
  category?: unknown;
  boxType?: unknown;
  note?: unknown;
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
function boxKey(v: unknown): string {
  return typeof v === 'string' ? v.trim().toLowerCase() : '';
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: ContentBody = {};
  try {
    const raw = await req.text();
    if (raw.length > 0) body = JSON.parse(raw) as ContentBody;
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }

  if (typeof body.category !== 'string' || body.category.trim().length === 0) {
    return NextResponse.json({ error: 'invalid_category' }, { status: 400 });
  }
  if (typeof body.boxType !== 'string' || body.boxType.trim().length === 0) {
    return NextResponse.json({ error: 'invalid_box_type' }, { status: 400 });
  }
  const category = body.category.trim().slice(0, 120);
  const boxType = body.boxType.trim().slice(0, 60);
  const categoryLc = category.toLowerCase();
  const boxTypeLc = boxType.toLowerCase();

  const svc = getBackupServiceClient();
  const decidedBy = auth.email || 'facu';
  const targetLabel = `${category} ${boxType}`;

  // --------------------------------------------------------------------------
  // REJECT branch (learn why this batch was not worked)
  // --------------------------------------------------------------------------
  if (body.reject === true) {
    const reason =
      typeof body.reason === 'string' && body.reason.trim()
        ? body.reason.trim().slice(0, 2000)
        : null;
    const { error: fbErr } = await svc.from('supply_solution_feedback').insert({
      lever: 'content',
      target_variety: targetLabel,
      outcome: 'reject',
      reason,
      decided_by: decidedBy,
    });
    if (fbErr) console.error('[apply-content] solution_feedback reject:', fbErr);
    return NextResponse.json({ applied: false, rejected: true, category, boxType });
  }

  // --------------------------------------------------------------------------
  // APPLY branch -> write the authored note + clear the gate at scale
  // --------------------------------------------------------------------------
  if (typeof body.note !== 'string' || body.note.trim().length < 3) {
    return NextResponse.json(
      { error: 'invalid_note', detail: 'note required (min 3 chars) — the authored contents description' },
      { status: 400 },
    );
  }
  const note = body.note.trim().slice(0, 4000);

  // 1) The content-gap SKUs in this (category, box_type): non-quarantined dim_sku
  //    whose catalog_classifications.failing_gates ? missing_contents_description.
  const { data: skuRows, error: skuErr } = await svc
    .from('dim_sku')
    .select('sku_id, category, box_type, quarantined')
    .ilike('category', category)
    .limit(5000);
  if (skuErr) {
    console.error('[apply-content] dim_sku:', skuErr);
    return NextResponse.json({ error: 'sku_lookup_failed', detail: skuErr.message }, { status: 500 });
  }
  const candidateSkuIds = (skuRows ?? [])
    .filter((r) => {
      const rr = r as { category: string | null; box_type: string | null; quarantined: boolean | null };
      return rr.quarantined !== true && boxKey(rr.box_type) === boxTypeLc;
    })
    .map((r) => (r as { sku_id: string }).sku_id);
  if (candidateSkuIds.length === 0) {
    return NextResponse.json({ applied: false, reason: 'no_sku_for_group' });
  }

  const { data: classRows, error: classErr } = await svc
    .from('catalog_classifications')
    .select('sku_id, failing_gates, blocking_gate_count, status')
    .in('sku_id', candidateSkuIds);
  if (classErr) {
    console.error('[apply-content] catalog_classifications read:', classErr);
    return NextResponse.json({ error: 'class_read_failed', detail: classErr.message }, { status: 500 });
  }
  interface ClassRow { sku_id: string; failing_gates: unknown; blocking_gate_count: number | null; status: string | null }
  const classBySku = new Map<string, ClassRow>();
  for (const r of (classRows ?? []) as ClassRow[]) classBySku.set(r.sku_id, r);

  const gapSkuIds = candidateSkuIds.filter((id) => {
    const cls = classBySku.get(id);
    return cls ? hasGate(cls.failing_gates, CONTENT_GATE) : false;
  });
  if (gapSkuIds.length === 0) {
    await svc.from('supply_solution_feedback').insert({
      lever: 'content',
      target_variety: targetLabel,
      outcome: 'pick', // DB CHECK allows only {'pick','reject'}
      chosen_value: note.slice(0, 200),
      reason: 'no_content_gap_sku',
      metric_before: 0,
      metric_after: 0,
      decided_by: decidedBy,
    });
    return NextResponse.json({ applied: false, reason: 'no_content_gap_sku' });
  }

  // 2) Write the authored note into product_chrome.description (the storefront
  //    copy the gate reads). Upsert per gap SKU (idempotent on re-apply).
  const nowIso = new Date().toISOString();
  const chromePayload = gapSkuIds.map((id) => ({
    sku_id: id,
    description: note,
    matched_by: 'supply_apply_content',
    updated_at: nowIso,
  }));
  const { error: upErr } = await svc
    .from('product_chrome')
    .upsert(chromePayload, { onConflict: 'sku_id' });
  if (upErr) {
    console.error('[apply-content] product_chrome upsert:', upErr);
    return NextResponse.json({ error: 'chrome_write_failed', detail: upErr.message }, { status: 500 });
  }

  // 3) CLEAR the content gate -> publishable when no blocking gate remains.
  let gatesCleared = 0;
  const gateErrors: string[] = [];
  const clearedIds: string[] = [];
  for (const id of gapSkuIds) {
    const cls = classBySku.get(id);
    if (!cls || !hasGate(cls.failing_gates, CONTENT_GATE)) continue;
    const nextGates = clearGate(cls.failing_gates, CONTENT_GATE);
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
      console.error('[apply-content] gate clear:', id, gErr);
      gateErrors.push(id);
    } else {
      gatesCleared += 1;
      clearedIds.push(id);
    }
  }

  // 4) RE-READ engine + classification independently to confirm closure.
  const { data: recheckRecs } = await svc
    .from('v_supply_recommendations')
    .select('sku_id, gap_type')
    .in('sku_id', gapSkuIds);
  const gapTypeAfter = new Map<string, string | null>();
  for (const r of (recheckRecs ?? []) as { sku_id: string; gap_type: string | null }[]) {
    gapTypeAfter.set(r.sku_id, r.gap_type);
  }
  const { data: recheckClass } = await svc
    .from('catalog_classifications')
    .select('sku_id, status, failing_gates')
    .in('sku_id', gapSkuIds);
  const statusAfter = new Map<string, { status: string | null; failing: unknown }>();
  for (const r of (recheckClass ?? []) as ClassRow[]) {
    statusAfter.set(r.sku_id, { status: r.status, failing: r.failing_gates });
  }

  let closed = 0;
  let nowPublishable = 0;
  for (const id of gapSkuIds) {
    const gt = gapTypeAfter.get(id);
    const leftContentLever = gt !== 'content';
    const st = statusAfter.get(id);
    const gateGone = st ? !hasGate(st.failing, CONTENT_GATE) : true;
    if (leftContentLever && gateGone) closed += 1;
    if ((st?.status ?? '') === 'publishable') nowPublishable += 1;
  }

  // 3b) Record the loop ledger per cleared SKU so the apply-content close advances
  //     the streak. owner_agent = executing agent (Job_PM); the DB CHECK rejects
  //     'Facu'. The inline close above already cleared the gate — no re-clear here
  //     (no double blocking_gate_count decrement). NOTE: most content-gap SKUs also
  //     carry missing_image, so 'publishable'/'left view' may be false for them
  //     while the content gate is verified — the ledger records the gate close.
  for (const id of clearedIds) {
    const st = statusAfter.get(id);
    const ledger = await recordLoopLedger(svc, {
      skuId: id,
      gateId: CONTENT_GATE,
      domain: 'content',
      ownerAgent: 'Job_PM',
      targetState: 'verified',
      routedVia: 'apply_content',
      evidence: {
        fix: { source: 'apply_content', category, boxType, text: note.slice(0, 200), decided_by: decidedBy },
        before: { gate: CONTENT_GATE, status: 'blocked' },
        after: { gate_cleared: true, publishable: (st?.status ?? '') === 'publishable' },
      },
    });
    if (!ledger.ok) console.error('[apply-content] loop ledger:', id, ledger.error);
  }

  const { error: fbErr } = await svc.from('supply_solution_feedback').insert({
    lever: 'content',
    target_variety: targetLabel,
    outcome: 'pick', // DB CHECK allows only {'pick','reject'}
    chosen_value: note.slice(0, 200),
    metric_before: gapSkuIds.length,
    metric_after: gapSkuIds.length - closed,
    decided_by: decidedBy,
  });
  if (fbErr) console.error('[apply-content] solution_feedback apply:', fbErr);

  return NextResponse.json({
    applied: true,
    loopClosed: closed > 0,
    category,
    boxType,
    gapSkuCount: gapSkuIds.length,
    gatesCleared,
    gateErrors: gateErrors.length,
    closed,
    nowPublishable,
  });
}
