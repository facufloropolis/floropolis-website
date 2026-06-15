// POST /api/admin/supply/image-review
// v3 | 2026-06-15 | Job_PM (CPO)
//
// Facu approves/rejects a candidate image from the /admin/supply review queue, WITH the full
// FeedbackPayload (the learning signal). supply-card-v2: a card is now ONE VARIETY (all sizes),
// so an approve closes the gate for ALL of the variety's sku_ids AT ONCE via the canonical closer
// (lib/admin/loop-ledger.closeAssetGate, signature takes skuIds[]). The URL lands in
// product_chrome.images for every size AND the missing_image gate clears in catalog_classifications
// (status flips publishable when no blocker remains). It records the loop ledger
// (improvement_loop_state -> verified, owner_agent='Job_PM') per closed sku, and persists the
// learning via the SINGLE shared helper (lib/admin/supply-feedback.persistSupplyFeedback) — which
// also writes a supply_solution_feedback row on REJECT (outcome='reject'), the row the old code
// DROPPED, so the ranker/sourcing can learn from rejects too. The re-sourcing flag (findBetter /
// low_quality) is encoded in that row's reason for the sourcing area to grep.
//
// Body (supply-card-v2 grouped): {
//   skuIds?: string[],            // ALL sizes of the variety (preferred — closes all at once)
//   ids?: number[],              // the candidate review row ids to resolve (approve target + siblings)
//   id?: number,                 // back-compat: single candidate id
//   url?: string,                // the chosen photo url (required for grouped approve)
//   variety?: string,
//   decision: 'approve'|'reject',
//   rejectTags?, quality?, findBetter?, priorityDelta?, note?  // FeedbackPayload
//   feedback?: string            // back-compat: free-text -> note
// }

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';
import { closeAssetGate, recordLoopLedger } from '@/lib/admin/loop-ledger';
import { parseFeedbackPayload, persistSupplyFeedback, type FeedbackPayload } from '@/lib/admin/supply-feedback';

const IMAGE_GATE = 'missing_image';
const IMAGE_LEVER = 'image';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

interface Body {
  id?: unknown;
  ids?: unknown;
  skuIds?: unknown;
  url?: unknown;
  variety?: unknown;
  decision?: unknown;
  feedback?: unknown;
  rejectTags?: unknown;
  quality?: unknown;
  findBetter?: unknown;
  priorityDelta?: unknown;
  note?: unknown;
}

// Build the FeedbackPayload from the body, folding the legacy `feedback` string
// into `note` so old callers keep working through the new helper.
function readPayload(body: Body): FeedbackPayload | null {
  const note =
    typeof body.note === 'string' && body.note.trim().length > 0
      ? body.note.trim()
      : typeof body.feedback === 'string' && body.feedback.trim().length > 0
        ? body.feedback.trim()
        : undefined;
  return parseFeedbackPayload({
    decision: body.decision,
    rejectTags: body.rejectTags,
    quality: body.quality,
    findBetter: body.findBetter,
    priorityDelta: body.priorityDelta,
    note,
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: Body = {};
  try {
    const raw = await req.text();
    if (raw.length > 0) body = JSON.parse(raw) as Body;
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }

  const payload = readPayload(body);
  if (!payload) return NextResponse.json({ error: 'invalid_decision' }, { status: 400 });

  // Resolve the candidate review rows: explicit ids[], else single id.
  const idList: number[] = Array.isArray(body.ids)
    ? body.ids.map((x) => Number(x)).filter((n) => Number.isFinite(n))
    : Number.isFinite(Number(body.id))
      ? [Number(body.id)]
      : [];

  const svc = getBackupServiceClient();
  const now = new Date().toISOString();
  const warnings: string[] = [];

  // Load the candidate(s) so we have variety + url + (text) sku_ids.
  let candRows: Array<{ id: number; sku_id: string | null; candidate_url: string | null; variety: string | null }> = [];
  if (idList.length > 0) {
    const { data, error } = await svc
      .from('image_review')
      .select('id, sku_id, candidate_url, variety')
      .in('id', idList);
    if (error) return NextResponse.json({ error: 'candidate_lookup_failed', detail: error.message }, { status: 500 });
    candRows = (data ?? []) as typeof candRows;
  }
  if (candRows.length === 0 && idList.length > 0) {
    return NextResponse.json({ error: 'candidate_not_found' }, { status: 404 });
  }

  const variety =
    (typeof body.variety === 'string' && body.variety.trim()) ||
    candRows.find((c) => typeof c.variety === 'string' && c.variety!.trim())?.variety ||
    null;

  // The chosen url: explicit body.url, else the first candidate's url.
  const chosenUrl =
    (typeof body.url === 'string' && /^https?:\/\//i.test(body.url) ? body.url : null) ??
    candRows.map((c) => c.candidate_url).find((u): u is string => typeof u === 'string' && /^https?:\/\//i.test(u)) ??
    null;

  // The full set of sku_ids to close: explicit skuIds[] (the whole variety),
  // else the candidate rows' sku_ids. closeAssetGate filters to real uuids.
  const skuInput: string[] = Array.isArray(body.skuIds)
    ? body.skuIds.filter((s): s is string => typeof s === 'string' && s.trim().length > 0).map((s) => s.trim())
    : candRows.map((c) => c.sku_id).filter((s): s is string => typeof s === 'string' && s.trim().length > 0);
  const skuIds = Array.from(new Set(skuInput));
  const skuUuids = skuIds.filter((s) => UUID_RE.test(s));
  // Surface a PARTIAL close so a dropped non-uuid size is visible, not silent.
  if (skuUuids.length < skuIds.length) {
    warnings.push(`partial_close: ${skuIds.length - skuUuids.length}/${skuIds.length} sku_ids are not uuid and were skipped`);
  }

  // ------------------------------------------------------------------ REJECT
  if (payload.decision === 'reject') {
    if (idList.length > 0) {
      const { error } = await svc
        .from('image_review')
        .update({ status: 'rejected', facu_decision: 'reject', facu_feedback: payload.note ?? null, decided_at: now })
        .in('id', idList);
      if (error) warnings.push(`review_update_failed: ${error.message}`);
    }
    // LEARNING: persist the reject into BOTH feedback tables (the solution_feedback
    // outcome='reject' row is the one the old code DROPPED). reSource flag is
    // encoded in reason ('find_better'/'low_quality') for the sourcing area.
    const persisted = await persistSupplyFeedback(svc, {
      payload,
      recType: IMAGE_GATE,
      lever: IMAGE_LEVER,
      variety,
      skuId: skuUuids[0] ?? null,
      decidedBy: auth.email || 'facu',
      chosenValue: chosenUrl,
    });
    warnings.push(...persisted.warnings);
    return NextResponse.json({
      ok: warnings.length === 0,
      decision: 'reject',
      reSource: persisted.reSource,
      weightDelta: persisted.weightDelta,
      warnings,
    });
  }

  // ------------------------------------------------------------------ APPROVE
  // A single approve closes the gate for ALL of the variety's sizes at once.
  if (!chosenUrl) return NextResponse.json({ error: 'no_url_to_apply' }, { status: 400 });
  if (skuUuids.length === 0) return NextResponse.json({ error: 'no_uuid_sku', warnings }, { status: 400 });

  const closeRes = await closeAssetGate(svc, {
    skuIds: skuUuids, // ALL sizes -> ONE close call (loop-ledger.ts:101)
    gate: IMAGE_GATE,
    asset: { images: [chosenUrl] },
  });

  // Auto-reject sibling pending candidates for these SKUs (Facu picked one).
  await svc
    .from('image_review')
    .update({ status: 'rejected', facu_decision: 'superseded', decided_at: now })
    .in('sku_id', skuUuids)
    .eq('status', 'pending');

  // Mark the approved candidate row(s) themselves.
  if (idList.length > 0) {
    const { error } = await svc
      .from('image_review')
      .update({
        status: 'approved',
        facu_decision: 'approve',
        facu_feedback: payload.note ?? null,
        decided_at: now,
        applied_at: closeRes.assetWritten > 0 ? now : null,
      })
      .in('id', idList);
    if (error) warnings.push(`review_update_failed: ${error.message}`);
  }

  // Record the loop ledger per closed sku (improvement_loop_state -> verified).
  // owner_agent='Job_PM' (DB CHECK rejects 'Facu'); the human is evidence.decided_by.
  let ledgersWritten = 0;
  if (closeRes.gatesCleared > 0) {
    for (const sku of skuUuids) {
      const publishable = (closeRes.statusAfter.get(sku)?.status ?? '') === 'publishable';
      const ledger = await recordLoopLedger(svc, {
        skuId: sku,
        gateId: IMAGE_GATE,
        domain: 'images',
        ownerAgent: 'Job_PM',
        targetState: 'verified',
        routedVia: 'image_review',
        evidence: {
          fix: { source: 'image_review_approve', url: chosenUrl, sku_count: skuUuids.length, decided_by: 'Facu', decided_by_email: auth.email || null },
          before: { image_count: 0, gate: IMAGE_GATE, status: 'blocked' },
          after: { image_count: closeRes.assetWritten > 0 ? 1 : 0, gate_cleared: true, publishable },
        },
      });
      if (ledger.ok) ledgersWritten += 1;
      else warnings.push(`ledger_not_advanced[${sku}]: ${ledger.error}`);
    }
  }

  // LEARNING: persist the pick (outcome='pick') + priority signal via the helper.
  const persisted = await persistSupplyFeedback(svc, {
    payload,
    recType: IMAGE_GATE,
    lever: IMAGE_LEVER,
    variety,
    skuId: skuUuids[0] ?? null,
    decidedBy: auth.email || 'facu',
    chosenValue: chosenUrl,
    metricBefore: 0,
    metricAfter: closeRes.assetWritten > 0 ? 1 : 0,
  });
  warnings.push(...persisted.warnings);

  return NextResponse.json({
    ok: warnings.length === 0,
    decision: 'approve',
    skusClosed: skuUuids.length,
    propagated: closeRes.assetWritten > 0,
    loopClosed: closeRes.closed > 0,
    gatesCleared: closeRes.gatesCleared,
    nowPublishable: closeRes.nowPublishable,
    ledgersWritten,
    weightDelta: persisted.weightDelta,
    warnings,
  });
}
