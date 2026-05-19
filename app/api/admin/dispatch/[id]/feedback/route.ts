// POST /api/admin/dispatch/[id]/feedback
// v1 | 2026-05-19 | Job_PM Phase F [V8 SHADOW]
//
// Writes a dispatch_feedback row plus per-SKU rows in dispatch_feedback_sku.
// UC-O-198 / UC-O-199 (admin-proxy entry for now; customer-facing form lands
// later behind a token route).
//
// NOTE: AI-Infra (Rose) consumes these tables nightly to populate
// supply_quality_scores - that aggregation belongs to her domain. Job does NOT
// write to supply_quality_scores directly (P1 separation; UC-O-200 handoff).
//
// Body:
//   { condition_score: 1..5,
//     vendor_score?: 1..5,
//     notes?: string,
//     sku_scores?: Array<{ sku_id: string, sku_score: 1..5, sku_notes?: string }> }
//
// Auth: admin (client_profiles.status='admin'); service-role writes both rows.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';

import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';

interface SkuInput {
  sku_id?: unknown;
  sku_score?: unknown;
  sku_notes?: unknown;
}

interface FeedbackBody {
  condition_score?: unknown;
  vendor_score?: unknown;
  notes?: unknown;
  sku_scores?: unknown;
}

function asScore(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const n = Math.trunc(v);
  if (n < 1 || n > 5) return null;
  return n;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // Auth
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

  let body: FeedbackBody;
  try {
    body = (await req.json()) as FeedbackBody;
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }

  const conditionScore = asScore(body.condition_score);
  if (conditionScore === null) {
    return NextResponse.json(
      { error: 'invalid_condition_score', detail: 'must be integer 1..5' },
      { status: 400 },
    );
  }
  const vendorScore = body.vendor_score == null ? null : asScore(body.vendor_score);
  if (body.vendor_score != null && vendorScore === null) {
    return NextResponse.json(
      { error: 'invalid_vendor_score', detail: 'must be integer 1..5 or null' },
      { status: 400 },
    );
  }
  const notes =
    body.notes == null
      ? null
      : typeof body.notes === 'string'
        ? body.notes.trim() || null
        : null;

  // Validate sku_scores ----------------------------------------------------
  const skuRows: { sku_id: string; sku_score: number | null; sku_notes: string | null }[] = [];
  if (body.sku_scores !== undefined && body.sku_scores !== null) {
    if (!Array.isArray(body.sku_scores)) {
      return NextResponse.json(
        { error: 'invalid_sku_scores', detail: 'must be array' },
        { status: 400 },
      );
    }
    for (const raw of body.sku_scores as SkuInput[]) {
      if (!raw || typeof raw !== 'object') continue;
      const skuId = typeof raw.sku_id === 'string' ? raw.sku_id.trim() : '';
      if (!skuId) continue;
      const score = raw.sku_score == null ? null : asScore(raw.sku_score);
      if (raw.sku_score != null && score === null) {
        return NextResponse.json(
          { error: 'invalid_sku_score', detail: `sku ${skuId}: must be 1..5` },
          { status: 400 },
        );
      }
      const sn =
        raw.sku_notes == null
          ? null
          : typeof raw.sku_notes === 'string'
            ? raw.sku_notes.trim() || null
            : null;
      skuRows.push({ sku_id: skuId, sku_score: score, sku_notes: sn });
    }
  }

  // Verify dispatch exists
  const { data: dispatch, error: dispErr } = await adminClient
    .from('dispatches')
    .select('id')
    .eq('id', id)
    .maybeSingle();
  if (dispErr || !dispatch) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // Insert header
  const { data: inserted, error: hdrErr } = await adminClient
    .from('dispatch_feedback')
    .insert({
      dispatch_id: id,
      condition_score: conditionScore,
      vendor_score: vendorScore,
      notes,
      captured_by: user.id,
      source: 'admin_proxy',
    })
    .select('id')
    .single();
  if (hdrErr || !inserted) {
    Sentry.captureException(hdrErr ?? new Error('feedback_header_insert_failed'), {
      tags: { route: 'admin/dispatch/feedback', step: 'insert_header' },
    });
    return NextResponse.json(
      { error: 'insert_failed', detail: hdrErr?.message ?? 'unknown' },
      { status: 500 },
    );
  }

  // Insert sku rows (best-effort: if any fail, we already wrote the header)
  if (skuRows.length > 0) {
    const { error: skuErr } = await adminClient.from('dispatch_feedback_sku').insert(
      skuRows.map((s) => ({
        feedback_id: inserted.id,
        sku_id: s.sku_id,
        sku_score: s.sku_score,
        sku_notes: s.sku_notes,
      })),
    );
    if (skuErr) {
      Sentry.captureException(skuErr, {
        tags: { route: 'admin/dispatch/feedback', step: 'insert_sku' },
      });
      return NextResponse.json(
        {
          error: 'sku_insert_failed',
          detail: skuErr.message,
          feedback_id: inserted.id,
        },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ feedback_id: inserted.id, sku_count: skuRows.length }, { status: 201 });
}
