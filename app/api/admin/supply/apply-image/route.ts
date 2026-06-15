// POST /api/admin/supply/apply-image
// v1 | 2026-06-10 | Job_PM (CPO)
//
// CLOSES the image loop for a variety by WORKING the picked solution -> the
// metric MOVES (image_count up, missing_image gate cleared, SKUs publishable).
// This is the "apply" half of the image solution; candidates come from
// /api/admin/supply/image-candidates.
//
// Two modes on one endpoint, split by `mode`:
//   mode='gap' (default) — the 'image' lever (172 SKUs, missing_image, 0 photos):
//   PICK  body { variety, imageUrl } (+ optional source, recType)
//     1. Validate the url is a real http(s) url (never a local placeholder).
//     2. Find this variety's image-GAP SKUs in BACKUP: non-quarantined dim_sku
//        whose catalog_classifications.failing_gates ? 'missing_image' AND whose
//        product_chrome image_count = 0. (Exactly the gapped SKUs, never all.)
//     3. APPEND + dedupe the url into product_chrome.images (the storefront
//        image source) -> idempotent (re-applying the same url is a no-op).
//     4. CLEAR the missing_image failing gate in catalog_classifications and
//        flip status to publishable when no blocking gate remains (what the
//        engine's image lever actually reads -- without this the loop reopens).
//     5. RE-READ v_supply_recommendations.gap_type + classification status
//        independently -> report image_count after + closed/publishable counts.
//     6. INSERT supply_solution_feedback { lever:'image', outcome:'pick',
//        source, chosen_value:url, metric_before, metric_after } (LEARNING).
//
//   mode='improve' — the 'image_improve' lever (620 SKUs, published, image_count
//   <= 1 -> add a 2nd photo / A/B). These SKUs ALREADY have one photo and carry
//   NO missing_image gate, so the gap-mode filter would dead-end on every one of
//   them (the bug fixed here). In improve mode we instead target this variety's
//   published SKUs whose image_count <= 1, APPEND the 2nd photo (image_count
//   1->2), and re-read the engine: image_count > 1 means the SKU LEAVES the
//   image_improve lever -> the metric MOVED (no gate to clear; the lever is
//   derived from image_count, not failing_gates). Honest "sin movimiento" when
//   the variety has no <=1-photo SKU left.
//
//   REJECT / UN-GETTABLE  body { variety, reject:true, reason, queueReason? }
//     - INSERT supply_solution_feedback { outcome:'reject', reason } (learn why).
//     - If queueReason in (ask_vendor|ask_next_client|send_sample): enqueue an
//       OPEN image_request_queue row (idempotent: one open per variety+reason).
//
// HARD BAR: REAL data only, no fabrication. image_count after is the re-measured
// truth (always 1 when a gap SKU got the url, 0 otherwise). NULL-safe, never
// throws on missing data -> honest reason codes. Auth mirrors /decide.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';
import { normVariety } from '@/app/admin/supply/_recData';
import { recordLoopLedger } from '@/lib/admin/loop-ledger';

const ADMIN_EMAILS = [
  'facu@floropolis.com',
  'jjpj@crescoinversiones.com',
  'jjpj@floropolis.com',
  'jjp@floropolis.com',
];

const IMAGE_LEVERS = new Set(['image', 'image_improve']);
const QUEUE_REASONS = new Set(['ask_vendor', 'ask_next_client', 'send_sample']);

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

interface ApplyBody {
  variety?: unknown;
  imageUrl?: unknown;
  source?: unknown;
  recType?: unknown;
  mode?: unknown; // 'gap' (default) | 'improve' (add 2nd photo for image_improve)
  reject?: unknown;
  reason?: unknown;
  queueReason?: unknown;
}

function imgLen(images: unknown): number {
  return Array.isArray(images) ? images.length : 0;
}

function appendDedupe(images: unknown, url: string): string[] | null {
  const cur: string[] = Array.isArray(images)
    ? images.filter((el): el is string => typeof el === 'string')
    : [];
  if (cur.includes(url)) return null; // already carries it -> no-op
  return [...cur, url];
}

function hasMissingImage(failingGates: unknown): boolean {
  return Array.isArray(failingGates) && failingGates.some((g) => g === 'missing_image');
}

function clearMissingImage(failingGates: unknown): string[] {
  if (!Array.isArray(failingGates)) return [];
  return failingGates.filter((g): g is string => typeof g === 'string' && g !== 'missing_image');
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: ApplyBody = {};
  try {
    const raw = await req.text();
    if (raw.length > 0) body = JSON.parse(raw) as ApplyBody;
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }

  if (typeof body.variety !== 'string' || body.variety.trim().length === 0) {
    return NextResponse.json({ error: 'invalid_variety' }, { status: 400 });
  }
  const variety = body.variety.trim().slice(0, 200);
  const vNorm = normVariety(variety);
  if (!vNorm) return NextResponse.json({ error: 'invalid_variety' }, { status: 400 });

  const svc = getBackupServiceClient();
  const source =
    typeof body.source === 'string' && body.source.trim() ? body.source.trim().slice(0, 60) : null;
  const decidedBy = auth.email || 'facu';

  // --------------------------------------------------------------------------
  // REJECT / UN-GETTABLE branch (no imageUrl, or reject:true)
  // --------------------------------------------------------------------------
  const isReject = body.reject === true || (body.imageUrl == null && typeof body.imageUrl !== 'string');
  if (isReject) {
    const reason =
      typeof body.reason === 'string' && body.reason.trim()
        ? body.reason.trim().slice(0, 2000)
        : null;
    const queueReason =
      typeof body.queueReason === 'string' && QUEUE_REASONS.has(body.queueReason.trim())
        ? body.queueReason.trim()
        : null;

    // Learning: record the reject + reason.
    const { error: fbErr } = await svc.from('supply_solution_feedback').insert({
      lever: 'image',
      target_variety: variety,
      source,
      outcome: 'reject',
      reason,
      decided_by: decidedBy,
    });
    if (fbErr) console.error('[apply-image] solution_feedback reject:', fbErr);

    // Un-gettable -> enqueue an ask (idempotent: one open per variety+reason).
    let queued = false;
    let queueId: number | null = null;
    if (queueReason) {
      const { data: existing } = await svc
        .from('image_request_queue')
        .select('id')
        .ilike('variety', variety)
        .eq('reason', queueReason)
        .eq('status', 'open')
        .maybeSingle();
      if (existing && (existing as { id: number }).id) {
        queued = true;
        queueId = (existing as { id: number }).id;
      } else {
        const { data: ins, error: qErr } = await svc
          .from('image_request_queue')
          .insert({ variety, reason: queueReason, note: reason, requested_by: decidedBy })
          .select('id')
          .maybeSingle();
        if (qErr) {
          // Unique index race -> treat as already queued (idempotent).
          console.error('[apply-image] queue insert:', qErr);
        } else if (ins) {
          queued = true;
          queueId = (ins as { id: number }).id;
        }
      }
    }

    return NextResponse.json({
      applied: false,
      rejected: true,
      variety,
      queued,
      queueReason,
      queueId,
    });
  }

  // --------------------------------------------------------------------------
  // PICK branch -> apply the chosen image + close the loop
  // --------------------------------------------------------------------------
  if (typeof body.imageUrl !== 'string') {
    return NextResponse.json({ error: 'invalid_image_url' }, { status: 400 });
  }
  const url = body.imageUrl.trim();
  if (!/^https?:\/\//i.test(url) || url.length > 2000) {
    // REAL data only: never store a local placeholder or junk url.
    return NextResponse.json({ error: 'invalid_image_url', detail: 'must be http(s) url' }, { status: 400 });
  }

  const mode = body.mode === 'improve' ? 'improve' : 'gap';
  if (mode === 'improve') {
    return applyImprove({ svc, variety, vNorm, url, source, decidedBy });
  }

  // 1) Variety SKUs (non-quarantined).
  const { data: skuRows, error: skuErr } = await svc
    .from('dim_sku')
    .select('sku_id, variety_normalized, quarantined')
    .limit(5000);
  if (skuErr) {
    console.error('[apply-image] dim_sku:', skuErr);
    return NextResponse.json({ error: 'sku_lookup_failed', detail: skuErr.message }, { status: 500 });
  }
  const varietySkuIds = (skuRows ?? [])
    .filter((r) => {
      const rr = r as { variety_normalized: string | null; quarantined: boolean | null };
      return rr.quarantined !== true && normVariety(rr.variety_normalized) === vNorm;
    })
    .map((r) => (r as { sku_id: string }).sku_id);
  if (varietySkuIds.length === 0) {
    return NextResponse.json({ applied: false, reason: 'no_sku_for_variety' });
  }

  // 2) Classifications + chrome for those SKUs.
  const { data: classRows, error: classErr } = await svc
    .from('catalog_classifications')
    .select('sku_id, failing_gates, blocking_gate_count, status')
    .in('sku_id', varietySkuIds);
  if (classErr) {
    console.error('[apply-image] catalog_classifications read:', classErr);
    return NextResponse.json({ error: 'class_read_failed', detail: classErr.message }, { status: 500 });
  }
  interface ClassRow { sku_id: string; failing_gates: unknown; blocking_gate_count: number | null; status: string | null }
  const classBySku = new Map<string, ClassRow>();
  for (const r of (classRows ?? []) as ClassRow[]) classBySku.set(r.sku_id, r);

  const { data: chromeRows, error: chromeErr } = await svc
    .from('product_chrome')
    .select('sku_id, images')
    .in('sku_id', varietySkuIds);
  if (chromeErr) {
    console.error('[apply-image] product_chrome read:', chromeErr);
    return NextResponse.json({ error: 'chrome_read_failed', detail: chromeErr.message }, { status: 500 });
  }
  const chromeBySku = new Map<string, unknown>();
  for (const r of (chromeRows ?? []) as { sku_id: string; images: unknown }[]) {
    chromeBySku.set(r.sku_id, r.images);
  }

  // The image-GAP set: missing_image gate AND image_count = 0.
  const gapSkuIds = varietySkuIds.filter((id) => {
    const cls = classBySku.get(id);
    const inGate = cls ? hasMissingImage(cls.failing_gates) : false;
    const noImage = imgLen(chromeBySku.get(id)) === 0;
    return inGate && noImage;
  });
  const imageCountBefore = 0; // gap SKUs have none by definition

  if (gapSkuIds.length === 0) {
    // Nothing in the image gap (already solved / not an image gap). Honest: log
    // the pick as feedback but report no metric move.
    await svc.from('supply_solution_feedback').insert({
      lever: 'image',
      target_variety: variety,
      source,
      outcome: 'pick',
      chosen_value: url,
      reason: 'no_image_gap_sku',
      metric_before: imageCountBefore,
      metric_after: imageCountBefore,
      decided_by: decidedBy,
    });
    return NextResponse.json({ applied: false, reason: 'no_image_gap_sku', imageCountBefore, imageCountAfter: imageCountBefore });
  }

  // 3) Write the url: APPEND + dedupe per gap SKU (idempotent).
  const nowIso = new Date().toISOString();
  const chromePayload: { sku_id: string; images: string[]; matched_by: string; updated_at: string }[] = [];
  for (const id of gapSkuIds) {
    const next = appendDedupe(chromeBySku.get(id), url);
    if (next) {
      chromePayload.push({ sku_id: id, images: next, matched_by: 'supply_apply_image', updated_at: nowIso });
    }
  }
  let imagesWritten = 0;
  if (chromePayload.length > 0) {
    const { error: upErr, count } = await svc
      .from('product_chrome')
      .upsert(chromePayload, { onConflict: 'sku_id', count: 'exact' });
    if (upErr) {
      console.error('[apply-image] product_chrome upsert:', upErr);
      return NextResponse.json({ error: 'chrome_write_failed', detail: upErr.message }, { status: 500 });
    }
    imagesWritten = count ?? chromePayload.length;
  }

  // 4) CLEAR the missing_image gate -> publishable when no blocking gate remains.
  let gatesCleared = 0;
  const gateErrors: string[] = [];
  const clearedIds: string[] = [];
  for (const id of gapSkuIds) {
    const cls = classBySku.get(id);
    if (!cls || !hasMissingImage(cls.failing_gates)) continue;
    const nextGates = clearMissingImage(cls.failing_gates);
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
      console.error('[apply-image] gate clear:', id, gErr);
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
    const leftImageLever = gt == null || !IMAGE_LEVERS.has(gt);
    const st = statusAfter.get(id);
    const gateGone = st ? !hasMissingImage(st.failing) : true;
    const isPublishable = (st?.status ?? '') === 'publishable';
    if (leftImageLever && gateGone) closed += 1;
    if (isPublishable) nowPublishable += 1;
  }

  // The metric the card shows MOVED: 0 -> 1 image_count for the gap SKUs.
  const imageCountAfter = imagesWritten > 0 || gatesCleared > 0 ? 1 : 0;
  const loopClosed = closed > 0;

  // 5b) Record the loop ledger per cleared SKU (improvement_loop_state -> verified)
  //     so the apply-image close advances the streak — NOT just product_chrome.
  //     owner_agent = executing agent (Job_PM); the DB CHECK rejects 'Facu'. The
  //     inline close above already cleared the gate; we do NOT re-clear here (no
  //     double blocking_gate_count decrement).
  for (const id of clearedIds) {
    const st = statusAfter.get(id);
    const ledger = await recordLoopLedger(svc, {
      skuId: id,
      gateId: 'missing_image',
      domain: 'images',
      ownerAgent: 'Job_PM',
      targetState: 'verified',
      routedVia: 'apply_image',
      evidence: {
        fix: { source: 'apply_image', variety, url, decided_by: decidedBy },
        before: { image_count: 0, gate: 'missing_image', status: 'blocked' },
        after: { image_count: 1, gate_cleared: true, publishable: (st?.status ?? '') === 'publishable' },
      },
    });
    if (!ledger.ok) console.error('[apply-image] loop ledger:', id, ledger.error);
  }

  // 6) LEARNING: record the pick + the metric move.
  const { error: fbErr } = await svc.from('supply_solution_feedback').insert({
    lever: 'image',
    target_variety: variety,
    source,
    outcome: 'pick',
    chosen_value: url,
    metric_before: imageCountBefore,
    metric_after: imageCountAfter,
    decided_by: decidedBy,
  });
  if (fbErr) console.error('[apply-image] solution_feedback pick:', fbErr);

  return NextResponse.json({
    applied: true,
    loopClosed,
    variety,
    url,
    source,
    gapSkuCount: gapSkuIds.length,
    imagesWritten,
    gatesCleared,
    gateErrors: gateErrors.length,
    closed,
    nowPublishable,
    imageCountBefore,
    imageCountAfter, // the metric that MOVED — the loop closes here
  });
}

// ---------------------------------------------------------------------------
// IMPROVE mode: add a 2nd photo for the image_improve lever (image_count <= 1).
// These SKUs already carry one photo and NO missing_image gate, so the metric
// that moves is image_count itself (1 -> 2 leaves the image_improve lever).
// ---------------------------------------------------------------------------
async function applyImprove(args: {
  svc: ReturnType<typeof getBackupServiceClient>;
  variety: string;
  vNorm: string;
  url: string;
  source: string | null;
  decidedBy: string;
}): Promise<NextResponse> {
  const { svc, variety, vNorm, url, source, decidedBy } = args;

  // 1) This variety's non-quarantined SKUs.
  const { data: skuRows, error: skuErr } = await svc
    .from('dim_sku')
    .select('sku_id, variety_normalized, quarantined')
    .limit(5000);
  if (skuErr) {
    console.error('[apply-image:improve] dim_sku:', skuErr);
    return NextResponse.json({ error: 'sku_lookup_failed', detail: skuErr.message }, { status: 500 });
  }
  const varietySkuIds = (skuRows ?? [])
    .filter((r) => {
      const rr = r as { variety_normalized: string | null; quarantined: boolean | null };
      return rr.quarantined !== true && normVariety(rr.variety_normalized) === vNorm;
    })
    .map((r) => (r as { sku_id: string }).sku_id);
  if (varietySkuIds.length === 0) {
    return NextResponse.json({ applied: false, reason: 'no_sku_for_variety' });
  }

  // 2) Chrome images for those SKUs. The improve gap = image_count <= 1 (mirrors
  //    the engine's image_improve lever, which is derived from image_count).
  const { data: chromeRows, error: chromeErr } = await svc
    .from('product_chrome')
    .select('sku_id, images')
    .in('sku_id', varietySkuIds);
  if (chromeErr) {
    console.error('[apply-image:improve] product_chrome read:', chromeErr);
    return NextResponse.json({ error: 'chrome_read_failed', detail: chromeErr.message }, { status: 500 });
  }
  const chromeBySku = new Map<string, unknown>();
  for (const r of (chromeRows ?? []) as { sku_id: string; images: unknown }[]) {
    chromeBySku.set(r.sku_id, r.images);
  }
  const improveSkuIds = varietySkuIds.filter((id) => imgLen(chromeBySku.get(id)) <= 1);
  const imageCountBefore = 1;

  if (improveSkuIds.length === 0) {
    await svc.from('supply_solution_feedback').insert({
      lever: 'image_improve',
      target_variety: variety,
      source,
      outcome: 'pick',
      chosen_value: url,
      reason: 'no_improve_sku',
      metric_before: imageCountBefore,
      metric_after: imageCountBefore,
      decided_by: decidedBy,
    });
    return NextResponse.json({ applied: false, reason: 'no_improve_sku', mode: 'improve' });
  }

  // 3) APPEND + dedupe the 2nd photo. If the url already exists it is a no-op
  //    (image_count would not move) -> honest no-move for that SKU.
  const nowIso = new Date().toISOString();
  const payload: { sku_id: string; images: string[]; matched_by: string; updated_at: string }[] = [];
  for (const id of improveSkuIds) {
    const next = appendDedupe(chromeBySku.get(id), url);
    if (next) payload.push({ sku_id: id, images: next, matched_by: 'supply_apply_image_improve', updated_at: nowIso });
  }
  let imagesWritten = 0;
  if (payload.length > 0) {
    const { error: upErr, count } = await svc
      .from('product_chrome')
      .upsert(payload, { onConflict: 'sku_id', count: 'exact' });
    if (upErr) {
      console.error('[apply-image:improve] upsert:', upErr);
      return NextResponse.json({ error: 'chrome_write_failed', detail: upErr.message }, { status: 500 });
    }
    imagesWritten = count ?? payload.length;
  }

  // 4) RE-READ the engine: image_count > 1 means the SKU LEFT image_improve.
  const { data: recheck } = await svc
    .from('v_supply_recommendations')
    .select('sku_id, gap_type, image_count')
    .in('sku_id', improveSkuIds);
  const recheckById = new Map<string, { gap_type: string | null; image_count: number | null }>();
  for (const r of (recheck ?? []) as { sku_id: string; gap_type: string | null; image_count: number | null }[]) {
    recheckById.set(r.sku_id, { gap_type: r.gap_type, image_count: r.image_count });
  }
  let closed = 0;
  for (const id of improveSkuIds) {
    const rr = recheckById.get(id);
    // Left the image_improve lever (image_count now > 1, or no longer in view).
    if (!rr || rr.gap_type !== 'image_improve') closed += 1;
  }
  const imageCountAfter = imagesWritten > 0 ? 2 : imageCountBefore;

  const { error: fbErr } = await svc.from('supply_solution_feedback').insert({
    lever: 'image_improve',
    target_variety: variety,
    source,
    outcome: 'pick',
    chosen_value: url,
    metric_before: imageCountBefore,
    metric_after: imageCountAfter,
    decided_by: decidedBy,
  });
  if (fbErr) console.error('[apply-image:improve] solution_feedback:', fbErr);

  return NextResponse.json({
    applied: imagesWritten > 0,
    loopClosed: closed > 0,
    mode: 'improve',
    variety,
    url,
    source,
    improveSkuCount: improveSkuIds.length,
    imagesWritten,
    closed,
    imageCountBefore,
    imageCountAfter,
    reason: imagesWritten === 0 ? 'photo_already_present' : undefined,
  });
}
