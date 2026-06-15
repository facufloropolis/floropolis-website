// POST /api/admin/supply/content-review
// v3 | 2026-06-15 | Job_PM (CPO)
//
// Facu Applies / Edits / Rejects an auto-generated content description from /admin/supply.
// supply-card-v2: a card is now ONE VARIETY (all sizes), so an approve closes the content gate for
// ALL of the variety's sku_ids AT ONCE via the canonical closer (lib/admin/loop-ledger.closeAssetGate,
// signature takes skuIds[]). The (possibly edited) text lands in product_chrome.description for every
// size AND the missing_contents_description gate clears in catalog_classifications (status flips
// publishable when no blocker remains). It records the loop ledger (improvement_loop_state -> verified,
// owner_agent='Job_PM') per closed sku, and persists the learning via the SINGLE shared helper
// (lib/admin/supply-feedback.persistSupplyFeedback) — which also writes a supply_solution_feedback row
// on REJECT (outcome='reject'), the row the old code DROPPED, so the ranker/sourcing learn from rejects.
//
// Body (supply-card-v2 grouped): {
//   skuIds?: string[], ids?: number[], id?: number,  // resolve targets (all sizes preferred)
//   text?: string,                                   // edited description to apply
//   variety?: string,
//   decision: 'approve'|'reject',
//   rejectTags?, quality?, findBetter?, priorityDelta?, note?,  // FeedbackPayload
//   feedback?: string                                // back-compat -> note
// }

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';
import { closeAssetGate, recordLoopLedger } from '@/lib/admin/loop-ledger';
import { parseFeedbackPayload, persistSupplyFeedback, type FeedbackPayload } from '@/lib/admin/supply-feedback';

const CONTENT_GATE = 'missing_contents_description';
const CONTENT_LEVER = 'content';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ADMIN_EMAILS = [
  'facu@floropolis.com',
  'jjpj@crescoinversiones.com',
  'jjpj@floropolis.com',
  'jjp@floropolis.com',
];

interface AuthOk { ok: true; email: string }
interface AuthFail { ok: false; response: NextResponse }

async function requireAdmin(): Promise<AuthOk | AuthFail> {
  const userClient = await createUserClient();
  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) return { ok: false, response: NextResponse.json({ error: 'unauthenticated' }, { status: 401 }) };
  const emailLc = (user.email ?? '').toLowerCase();
  if (ADMIN_EMAILS.includes(emailLc)) return { ok: true, email: emailLc };
  const adminClient = getBackupServiceClient();
  const { data: profile } = await adminClient.from('client_profiles').select('status').eq('user_id', user.id).maybeSingle();
  if (profile?.status === 'admin') return { ok: true, email: emailLc };
  return { ok: false, response: NextResponse.json({ error: 'not_admin' }, { status: 403 }) };
}

interface Body {
  id?: unknown;
  ids?: unknown;
  skuIds?: unknown;
  text?: unknown;
  variety?: unknown;
  decision?: unknown;
  feedback?: unknown;
  rejectTags?: unknown;
  quality?: unknown;
  findBetter?: unknown;
  priorityDelta?: unknown;
  note?: unknown;
}

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

  const idList: number[] = Array.isArray(body.ids)
    ? body.ids.map((x) => Number(x)).filter((n) => Number.isFinite(n))
    : Number.isFinite(Number(body.id))
      ? [Number(body.id)]
      : [];

  const editedText = typeof body.text === 'string' ? body.text.trim().slice(0, 2000) : null;

  const svc = getBackupServiceClient();
  const now = new Date().toISOString();
  const warnings: string[] = [];

  let candRows: Array<{ id: number; sku_id: string | null; candidate_text: string | null; variety: string | null }> = [];
  if (idList.length > 0) {
    const { data, error } = await svc
      .from('content_review')
      .select('id, sku_id, candidate_text, variety')
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

  // The text to apply: explicit edit wins, else the first candidate's text.
  const candText = candRows.map((c) => c.candidate_text).find((t): t is string => typeof t === 'string' && t.trim().length >= 3) ?? null;
  const text = editedText && editedText.length >= 3 ? editedText : candText;

  const skuInput: string[] = Array.isArray(body.skuIds)
    ? body.skuIds.filter((s): s is string => typeof s === 'string' && s.trim().length > 0).map((s) => s.trim())
    : candRows.map((c) => c.sku_id).filter((s): s is string => typeof s === 'string' && s.trim().length > 0);
  const skuIds = Array.from(new Set(skuInput));
  const skuUuids = skuIds.filter((s) => UUID_RE.test(s));
  if (skuUuids.length < skuIds.length) {
    warnings.push(`partial_close: ${skuIds.length - skuUuids.length}/${skuIds.length} sku_ids are not uuid and were skipped`);
  }

  // ------------------------------------------------------------------ REJECT
  if (payload.decision === 'reject') {
    if (idList.length > 0) {
      const { error } = await svc
        .from('content_review')
        .update({ status: 'rejected', facu_decision: 'reject', facu_feedback: payload.note ?? null, decided_at: now })
        .in('id', idList);
      if (error) warnings.push(`review_update_failed: ${error.message}`);
    }
    const persisted = await persistSupplyFeedback(svc, {
      payload,
      recType: CONTENT_GATE,
      lever: CONTENT_LEVER,
      variety,
      skuId: skuUuids[0] ?? null,
      decidedBy: auth.email || 'facu',
      chosenValue: text ? text.slice(0, 200) : null,
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
  if (!text) return NextResponse.json({ error: 'no_text_to_apply' }, { status: 400 });
  if (skuUuids.length === 0) return NextResponse.json({ error: 'no_uuid_sku', warnings }, { status: 400 });

  const closeRes = await closeAssetGate(svc, {
    skuIds: skuUuids, // ALL sizes -> ONE close call (loop-ledger.ts:101)
    gate: CONTENT_GATE,
    asset: { description: text },
  });

  if (idList.length > 0) {
    const { error } = await svc
      .from('content_review')
      .update({
        status: 'approved',
        facu_decision: editedText ? 'edited' : 'approve',
        candidate_text: text,
        facu_feedback: payload.note ?? null,
        decided_at: now,
        applied_at: closeRes.assetWritten > 0 ? now : null,
      })
      .in('id', idList);
    if (error) warnings.push(`review_update_failed: ${error.message}`);
  }

  let ledgersWritten = 0;
  if (closeRes.gatesCleared > 0) {
    for (const sku of skuUuids) {
      const publishable = (closeRes.statusAfter.get(sku)?.status ?? '') === 'publishable';
      const ledger = await recordLoopLedger(svc, {
        skuId: sku,
        gateId: CONTENT_GATE,
        domain: 'content',
        ownerAgent: 'Job_PM',
        targetState: 'verified',
        routedVia: 'content_review',
        evidence: {
          fix: { source: 'content_review_approve', edited: !!editedText, text: text.slice(0, 200), sku_count: skuUuids.length, decided_by: 'Facu', decided_by_email: auth.email || null },
          before: { gate: CONTENT_GATE, status: 'blocked' },
          after: { gate_cleared: true, publishable },
        },
      });
      if (ledger.ok) ledgersWritten += 1;
      else warnings.push(`ledger_not_advanced[${sku}]: ${ledger.error}`);
    }
  }

  const persisted = await persistSupplyFeedback(svc, {
    payload,
    recType: CONTENT_GATE,
    lever: CONTENT_LEVER,
    variety,
    skuId: skuUuids[0] ?? null,
    decidedBy: auth.email || 'facu',
    chosenValue: text.slice(0, 200),
    metricBefore: 1,
    metricAfter: closeRes.closed > 0 ? 0 : 1,
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
