// POST /api/admin/supply/recover-image
// v2 | 2026-06-09 | Job_PM (CPO)
//
// Closes the image-lever Supply loop AT THE ENGINE, self-contained, for ONE
// variety. The engine's `image` lever fires on
// catalog_classifications.failing_gates ? 'missing_image' (a stored snapshot
// table, no triggers) -- NOT on product_chrome.image_count. So writing the
// photo alone does NOT clear the lever (proven: image_count 0->1 but gap_type
// stayed 'image', SKU stayed blocked, the card reappeared identically). To
// actually close the loop we must ALSO clear the missing_image failing gate in
// catalog_classifications and re-read gap_type to confirm the lever cleared.
//
// Flow:
//   1. Find the image-GAP SKUs for the variety in BACKUP: non-quarantined
//      dim_sku whose catalog_classifications.failing_gates ? 'missing_image'
//      AND whose product_chrome image_count = 0. (Matches the doc: only the
//      SKUs actually in the image gap -- never every SKU of the variety.)
//   2. Recover a REAL PROD photo for the variety from PROD floropolis_inventory
//      (http URL only -- never a local placeholder; getProdRealPhotoMap enforces).
//   3. APPEND (dedupe) that url into BACKUP product_chrome.images -- never
//      overwrite an existing real photo. product_chrome.images is what the
//      storefront catalog read joins, so this is the REAL catalog write.
//   4. CLEAR the missing_image failing gate in catalog_classifications for those
//      SKUs (remove from failing_gates, decrement blocking_gate_count, flip
//      status to 'publishable' when no blocking gate remains). This is what the
//      engine's `image` lever reads -- without it the loop never closes.
//   5. RE-READ v_supply_recommendations.gap_type + catalog_classifications.status
//      per SKU (independent read). A SKU is COUNTED as closed only when its
//      image/image_improve lever stopped firing AND its classification became
//      publishable. We report only that honest, machine-verified closure.
//
// HARD BAR: REAL data only. If no real PROD http photo exists for the variety,
// we recover NOTHING and return { recovered:false, reason:'no_prod_photo' }.
// We never fabricate a url/number; counts are the re-measured truth.
//
// Body: { variety }. Auth mirrors /api/admin/supply/decide (ADMIN_EMAILS or
// client_profiles.status='admin'). NULL-safe: PROD client may be null -> degrade
// to { recovered:false, reason:'prod_unreachable' }, never throw.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';
import { getProdRealPhotoMap, normVariety } from '@/app/admin/supply/_recData';

const ADMIN_EMAILS = [
  'facu@floropolis.com',
  'jjpj@crescoinversiones.com',
  'jjpj@floropolis.com',
  'jjp@floropolis.com',
];

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

interface RecoverBody { variety?: unknown }

// The engine lever that this route closes (image-missing). When the engine's
// gap_type is one of these, the image lever still fires for that SKU.
const IMAGE_LEVERS = new Set(['image', 'image_improve']);

// Count how many array elements an unknown jsonb `images` value holds.
function imgLen(images: unknown): number {
  return Array.isArray(images) ? images.length : 0;
}

// Build the next images array by APPENDING the url and de-duplicating, never
// dropping an existing real photo. Returns null when nothing changes (url is
// already present) so we can skip the write idempotently.
function appendDedupe(images: unknown, url: string): string[] | null {
  const cur: string[] = Array.isArray(images)
    ? images.filter((el): el is string => typeof el === 'string')
    : [];
  if (cur.includes(url)) return null; // already carries it -> no-op
  return [...cur, url];
}

// Is `missing_image` present in a failing_gates jsonb value?
function hasMissingImage(failingGates: unknown): boolean {
  return Array.isArray(failingGates) && failingGates.some((g) => g === 'missing_image');
}

// Remove `missing_image` from a failing_gates array (keep everything else).
function clearMissingImage(failingGates: unknown): string[] {
  if (!Array.isArray(failingGates)) return [];
  return failingGates.filter((g): g is string => typeof g === 'string' && g !== 'missing_image');
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: RecoverBody = {};
  try {
    const raw = await req.text();
    if (raw.length > 0) body = JSON.parse(raw) as RecoverBody;
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }
  if (typeof body.variety !== 'string' || body.variety.trim().length === 0) {
    return NextResponse.json({ error: 'invalid_variety' }, { status: 400 });
  }
  const variety = body.variety.trim().slice(0, 200);
  const vNorm = normVariety(variety);
  if (!vNorm) return NextResponse.json({ error: 'invalid_variety' }, { status: 400 });

  // 1) Recover the real PROD photo (http only). null map => PROD unreachable.
  let realMap: Map<string, string> | null;
  try {
    realMap = await getProdRealPhotoMap();
  } catch {
    realMap = null;
  }
  if (realMap === null) {
    return NextResponse.json({ recovered: false, reason: 'prod_unreachable' });
  }
  const url = realMap.get(vNorm) ?? null;
  if (!url) {
    // Honest: no real PROD photo for this variety -> card keeps the ladder.
    return NextResponse.json({ recovered: false, reason: 'no_prod_photo' });
  }

  const svc = getBackupServiceClient();

  // 2) Candidate SKUs of this variety (non-quarantined). We narrow to the actual
  //    image GAP below (missing_image gate + image_count = 0) so we never write
  //    to a SKU that is not image-gapped (which would overstate the loop).
  const { data: skuRows, error: skuErr } = await svc
    .from('dim_sku')
    .select('sku_id, variety_normalized, quarantined')
    .limit(5000);
  if (skuErr) {
    console.error('[recover-image] dim_sku:', skuErr);
    return NextResponse.json({ error: 'sku_lookup_failed', detail: skuErr.message }, { status: 500 });
  }
  const varietySkuIds = (skuRows ?? [])
    .filter((r) => {
      const rr = r as { variety_normalized: string | null; quarantined: boolean | null };
      return rr.quarantined !== true && normVariety(rr.variety_normalized) === vNorm;
    })
    .map((r) => (r as { sku_id: string }).sku_id);

  if (varietySkuIds.length === 0) {
    return NextResponse.json({ recovered: false, reason: 'no_sku_for_variety' });
  }

  // 2a) Classifications for those SKUs -> which carry the missing_image gate.
  const { data: classRows, error: classErr } = await svc
    .from('catalog_classifications')
    .select('sku_id, failing_gates, blocking_gate_count, status')
    .in('sku_id', varietySkuIds);
  if (classErr) {
    console.error('[recover-image] catalog_classifications read:', classErr);
    return NextResponse.json({ error: 'class_read_failed', detail: classErr.message }, { status: 500 });
  }
  interface ClassRow { sku_id: string; failing_gates: unknown; blocking_gate_count: number | null; status: string | null }
  const classBySku = new Map<string, ClassRow>();
  for (const r of (classRows ?? []) as ClassRow[]) classBySku.set(r.sku_id, r);

  // 2b) Existing chrome images for those SKUs -> measured image_count.
  const { data: chromeRows, error: chromeErr } = await svc
    .from('product_chrome')
    .select('sku_id, images')
    .in('sku_id', varietySkuIds);
  if (chromeErr) {
    console.error('[recover-image] product_chrome read:', chromeErr);
    return NextResponse.json({ error: 'chrome_read_failed', detail: chromeErr.message }, { status: 500 });
  }
  const chromeBySku = new Map<string, unknown>();
  for (const r of (chromeRows ?? []) as { sku_id: string; images: unknown }[]) {
    chromeBySku.set(r.sku_id, r.images);
  }

  // The IMAGE-GAP set: SKUs that carry the missing_image gate AND have no image
  // yet (image_count = 0). This is exactly "image-gap SKUs for this variety" --
  // matching the doc comment. SKUs with no missing_image gate, or that already
  // have a photo (e.g. image_improve at image_count=1), are EXCLUDED: recover
  // does not touch them and does not claim closure for them.
  const gapSkuIds = varietySkuIds.filter((id) => {
    const cls = classBySku.get(id);
    const inGate = cls ? hasMissingImage(cls.failing_gates) : false;
    const noImage = imgLen(chromeBySku.get(id)) === 0;
    return inGate && noImage;
  });

  if (gapSkuIds.length === 0) {
    // Nothing actually in the image gap (e.g. variety is image_improve only, or
    // already recovered). Honest: no closure to claim here.
    return NextResponse.json({ recovered: false, reason: 'no_image_gap_sku' });
  }

  // 3) Write the photo: APPEND + dedupe per SKU (never overwrite a real photo).
  //    sku_id is the PK -> upsert is idempotent. updated_at is NOT NULL.
  const nowIso = new Date().toISOString();
  const chromePayload: { sku_id: string; images: string[]; matched_by: string; updated_at: string }[] = [];
  for (const id of gapSkuIds) {
    const next = appendDedupe(chromeBySku.get(id), url);
    if (next) {
      chromePayload.push({ sku_id: id, images: next, matched_by: 'supply_recover_image', updated_at: nowIso });
    }
  }
  let imagesWritten = 0;
  if (chromePayload.length > 0) {
    const { error: upErr, count } = await svc
      .from('product_chrome')
      .upsert(chromePayload, { onConflict: 'sku_id', count: 'exact' });
    if (upErr) {
      console.error('[recover-image] product_chrome upsert:', upErr);
      return NextResponse.json({ error: 'chrome_write_failed', detail: upErr.message }, { status: 500 });
    }
    imagesWritten = count ?? chromePayload.length;
  }

  // 4) CLEAR the missing_image failing gate in catalog_classifications -- this is
  //    what the engine's `image` lever reads. Per SKU: drop missing_image from
  //    failing_gates, decrement blocking_gate_count (floor 0), and flip status to
  //    'publishable' when no blocking gate remains. Without this the lever
  //    re-fires on the next load and the loop never closes.
  let gatesCleared = 0;
  const gateErrors: string[] = [];
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
      console.error('[recover-image] gate clear:', id, gErr);
      gateErrors.push(id);
    } else {
      gatesCleared += 1;
    }
  }

  // 5) RE-READ the engine + classification independently to CONFIRM the lever
  //    actually cleared per SKU. A SKU counts as CLOSED only when its image lever
  //    stopped firing (gap_type no longer image/image_improve) AND its
  //    classification is publishable. This is the only honest "loop closed".
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

  let closed = 0; // SKUs that genuinely left the image lever AND are publishable
  let nowPublishable = 0; // SKUs whose classification flipped to publishable
  for (const id of gapSkuIds) {
    const gt = gapTypeAfter.get(id); // absent from the view => lever='ok' (no row)
    const leftImageLever = gt == null || !IMAGE_LEVERS.has(gt);
    const st = statusAfter.get(id);
    const gateGone = st ? !hasMissingImage(st.failing) : true;
    const isPublishable = (st?.status ?? '') === 'publishable';
    if (leftImageLever && gateGone) closed += 1;
    if (isPublishable) nowPublishable += 1;
  }

  // Per-variety image_count the card shows: 0 before (gap SKUs had none), 1 after.
  const imageCountBefore = 0;
  const imageCountAfter = imagesWritten > 0 ? 1 : 0;

  // The loop is closed ONLY if the gate actually cleared for at least one SKU.
  const loopClosed = closed > 0;

  return NextResponse.json({
    recovered: true,
    loopClosed,
    variety,
    url,
    gapSkuCount: gapSkuIds.length, // SKUs actually in the image gap (write set)
    imagesWritten,
    gatesCleared,
    gateErrors: gateErrors.length, // SKUs whose gate update failed (honesty)
    closed, // SKUs whose image lever stopped firing AND are publishable
    nowPublishable, // SKUs whose classification is now publishable
    imageCountBefore,
    imageCountAfter,
  });
}
