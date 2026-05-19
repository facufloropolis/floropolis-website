// /api/admin/proposals
// v1 | 2026-05-18 | Job_PM admin-foundation [V8 SHADOW]
//
// GET  -- list proposals. Query params (all optional):
//          status        = awaiting_facu | approved | rejected | withdrawn
//          type          = e.g. box_master.update
//          target_table  = e.g. box_master
//          limit         = 1..200 (default 100)
//
// POST -- create a proposal. Admin only.
//          Body: { type, target_table, target_id?, payload, warnings?, notes? }
//          The route sets proposed_by = session user and status = 'awaiting_facu'.
//
// Both methods enforce: session user + email in ADMIN_EMAILS (matches middleware.ts).

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';

import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';
import { KNOWN_PROPOSAL_TYPES } from '@/lib/admin/proposal-executors';
import { computeCascadeSummary } from '@/lib/admin/proposal-cascade';

const ADMIN_EMAILS = ['facu@floropolis.com', 'jjpj@crescoinversiones.com'];

const VALID_STATUSES = ['awaiting_facu', 'approved', 'rejected', 'withdrawn'] as const;
type ProposalStatus = (typeof VALID_STATUSES)[number];

interface AuthOk {
  ok: true;
  userId: string;
}
interface AuthFail {
  ok: false;
  response: NextResponse;
}

async function requireAdmin(): Promise<AuthOk | AuthFail> {
  const userClient = await createUserClient();
  const {
    data: { user },
    error: authErr,
  } = await userClient.auth.getUser();
  if (authErr || !user) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'unauthenticated' }, { status: 401 }),
    };
  }

  const emailLc = (user.email ?? '').toLowerCase();
  if (ADMIN_EMAILS.includes(emailLc)) {
    return { ok: true, userId: user.id };
  }

  // Secondary check: client_profiles.status='admin' (matches middleware.ts secondary path).
  const adminClient = getBackupServiceClient();
  const { data: profile } = await adminClient
    .from('client_profiles')
    .select('status')
    .eq('user_id', user.id)
    .maybeSingle();
  if (profile?.status === 'admin') {
    return { ok: true, userId: user.id };
  }

  return {
    ok: false,
    response: NextResponse.json({ error: 'not_admin' }, { status: 403 }),
  };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const statusParam = url.searchParams.get('status');
  const typeParam = url.searchParams.get('type');
  const targetTableParam = url.searchParams.get('target_table');
  const limitParam = url.searchParams.get('limit');

  if (statusParam && !VALID_STATUSES.includes(statusParam as ProposalStatus)) {
    return NextResponse.json(
      { error: 'invalid_status', detail: `must be one of ${VALID_STATUSES.join(', ')}` },
      { status: 400 },
    );
  }

  let limit = 100;
  if (limitParam !== null) {
    const n = Number.parseInt(limitParam, 10);
    if (!Number.isFinite(n) || n <= 0 || n > 200) {
      return NextResponse.json(
        { error: 'invalid_limit', detail: 'must be 1..200' },
        { status: 400 },
      );
    }
    limit = n;
  }

  const service = getBackupServiceClient();
  let q = service
    .from('admin_proposals')
    .select('*')
    .order('proposed_at', { ascending: false })
    .limit(limit);

  if (statusParam) q = q.eq('status', statusParam);
  if (typeParam) q = q.eq('type', typeParam);
  if (targetTableParam) q = q.eq('target_table', targetTableParam);

  const { data, error } = await q;
  if (error) {
    Sentry.captureException(error, {
      tags: { route: 'admin/proposals', method: 'GET' },
    });
    return NextResponse.json(
      { error: 'query_failed', detail: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ proposals: data ?? [] });
}

interface CreateBody {
  type?: unknown;
  target_table?: unknown;
  target_id?: unknown;
  payload?: unknown;
  warnings?: unknown;
  notes?: unknown;
  // 2026-05-19 v0.4 (Phase B) — Rose contract v1.0 P3 requirements:
  // every proposal must carry source_rationale + (where applicable) source_artifact.
  source_rationale?: unknown;
  source_artifact?: unknown;
  source_table?: unknown;
  source_id?: unknown;
  source_agent?: unknown;
  before_value?: unknown;
  after_value?: unknown;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }

  const type = body.type;
  const targetTable = body.target_table;
  if (typeof type !== 'string' || type.length === 0 || type.length > 128) {
    return NextResponse.json(
      { error: 'invalid_type', detail: 'non-empty string up to 128 chars' },
      { status: 400 },
    );
  }
  if (!KNOWN_PROPOSAL_TYPES.includes(type)) {
    return NextResponse.json(
      {
        error: 'unknown_type',
        detail: `must be one of ${KNOWN_PROPOSAL_TYPES.join(', ')}`,
      },
      { status: 400 },
    );
  }
  if (
    typeof targetTable !== 'string' ||
    targetTable.length === 0 ||
    targetTable.length > 128
  ) {
    return NextResponse.json(
      { error: 'invalid_target_table' },
      { status: 400 },
    );
  }

  let targetId: string | null = null;
  if (body.target_id !== undefined && body.target_id !== null) {
    if (typeof body.target_id !== 'string' && typeof body.target_id !== 'number') {
      return NextResponse.json(
        { error: 'invalid_target_id', detail: 'must be string or number' },
        { status: 400 },
      );
    }
    targetId = String(body.target_id);
    if (targetId.length === 0 || targetId.length > 256) {
      return NextResponse.json(
        { error: 'invalid_target_id' },
        { status: 400 },
      );
    }
  }

  if (
    body.payload === undefined ||
    body.payload === null ||
    typeof body.payload !== 'object' ||
    Array.isArray(body.payload)
  ) {
    return NextResponse.json(
      { error: 'invalid_payload', detail: 'must be a JSON object' },
      { status: 400 },
    );
  }

  let warnings: unknown[] = [];
  if (body.warnings !== undefined && body.warnings !== null) {
    if (!Array.isArray(body.warnings)) {
      return NextResponse.json(
        { error: 'invalid_warnings', detail: 'must be an array' },
        { status: 400 },
      );
    }
    warnings = body.warnings;
  }

  let notes: string | null = null;
  if (body.notes !== undefined && body.notes !== null) {
    if (typeof body.notes !== 'string') {
      return NextResponse.json(
        { error: 'invalid_notes', detail: 'must be a string' },
        { status: 400 },
      );
    }
    const trimmed = body.notes.trim();
    notes = trimmed.length > 0 ? trimmed.slice(0, 4000) : null;
  }

  // Optional Phase-B fields (Rose contract v1.0).
  // source_rationale is REQUIRED for any proposal touching a Rose-owned table.
  // Catalog UI clients are required to send it; we default to notes if missing
  // but log a soft warning so we can audit which surfaces still need wiring.
  let sourceRationale: string | null = null;
  if (typeof body.source_rationale === 'string' && body.source_rationale.trim().length > 0) {
    sourceRationale = body.source_rationale.trim().slice(0, 4000);
  } else if (notes) {
    sourceRationale = notes;
  }

  let sourceArtifact: string | null = null;
  if (typeof body.source_artifact === 'string' && body.source_artifact.trim().length > 0) {
    sourceArtifact = body.source_artifact.trim().slice(0, 1024);
  }

  let sourceTable: string | null = null;
  if (typeof body.source_table === 'string' && body.source_table.trim().length > 0) {
    sourceTable = body.source_table.trim().slice(0, 128);
  } else {
    // Fall back to target_table for traceability — every UI today already
    // submits target_table, so source_table mirrors it unless explicitly set.
    sourceTable = targetTable;
  }

  let sourceId: string | null = null;
  if (typeof body.source_id === 'string' && body.source_id.length > 0) {
    sourceId = body.source_id.slice(0, 256);
  } else if (typeof body.source_id === 'number') {
    sourceId = String(body.source_id);
  } else {
    sourceId = targetId;
  }

  let sourceAgent: string = 'job';
  if (typeof body.source_agent === 'string' && body.source_agent.length > 0) {
    sourceAgent = body.source_agent.trim().slice(0, 32);
  }

  const beforeValue =
    body.before_value !== undefined && body.before_value !== null
      ? body.before_value
      : null;
  const afterValue =
    body.after_value !== undefined && body.after_value !== null
      ? body.after_value
      : null;

  const service = getBackupServiceClient();

  // Phase C / BRD UC-D-128: cascade impact (N SKUs affected) is computed AT
  // proposal-creation time and stored on the row in admin_proposals.cascade_summary.
  // The approval queue read-side then renders directly with zero recomputation.
  // computeCascadeSummary is best-effort: failures are caught + logged but the
  // proposal still inserts (with an empty cascade) so the UI can fall back.
  let cascadeSummary: Record<string, unknown> = {};
  try {
    cascadeSummary = (await computeCascadeSummary(
      {
        type,
        target_table: targetTable,
        target_id: targetId,
        payload: body.payload as Record<string, unknown>,
      },
      service,
    )) as unknown as Record<string, unknown>;
  } catch (e) {
    Sentry.captureException(e, {
      tags: { route: 'admin/proposals', step: 'cascade_compute' },
    });
    cascadeSummary = {
      affected_sku_count: 0,
      affected_skus_sample: [],
      warnings: ['cascade_compute_threw'],
      computed_at: new Date().toISOString(),
      computed_by: 'api/admin/proposals POST (Phase C, errored)',
    };
  }

  const { data, error } = await service
    .from('admin_proposals')
    .insert({
      type,
      target_table: targetTable,
      target_id: targetId,
      payload: body.payload,
      warnings,
      status: 'awaiting_facu',
      proposed_by: auth.userId,
      notes,
      source_agent: sourceAgent,
      source_table: sourceTable,
      source_id: sourceId,
      source_rationale: sourceRationale,
      source_artifact: sourceArtifact,
      before_value: beforeValue,
      after_value: afterValue,
      filter_status: 'passed',
      cascade_summary: cascadeSummary,
    })
    .select('*')
    .maybeSingle();

  if (error) {
    Sentry.captureException(error, {
      tags: { route: 'admin/proposals', method: 'POST' },
    });
    return NextResponse.json(
      { error: 'insert_failed', detail: error.message },
      { status: 500 },
    );
  }

  // TODO: Brevo email to CEO + Co-Admin on insert (Phase G -- deferred per CEO
  // directive 2026-05-19). When wired, send transactional template with
  // proposal.id, type, target_table, source_agent, source_rationale,
  // cascade_summary.affected_sku_count, and a deep link to
  // /admin/catalog/approval-queue. Recipient list = ADMIN_EMAILS (+ BCC
  // facu@floropolis.com per the BCC standing rule). Trigger is right here,
  // post-insert, before returning the response.

  return NextResponse.json({ proposal: data }, { status: 201 });
}
