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

  const service = getBackupServiceClient();
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

  return NextResponse.json({ proposal: data }, { status: 201 });
}
