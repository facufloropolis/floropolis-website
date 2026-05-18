// POST /api/admin/ingest/manual
// v1 | 2026-05-18 | Job_PM admin-port X4 [V8 SHADOW]
//
// Body: { text: string, vendor_id?: string }
//
// Naively parses the text (split by lines, comma-separated:
//   variety, stem_length, qty, cost
// extra columns ignored) and inserts one row into ingestion_batches with:
//   source            = 'manual_paste'
//   vendor_id         = body.vendor_id (or null)
//   raw_payload       = { text }
//   parsed_rows       = best-effort parse
//   parser_confidence = 0.5 (we don't trust manual entry)
//   status            = 'awaiting_review'
//
// Returns: { id }
//
// Admin gate same as the rest of /api/admin/*: session user + ADMIN_EMAILS or
// client_profiles.status='admin'.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';

import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';

const ADMIN_EMAILS = ['facu@floropolis.com', 'jjpj@crescoinversiones.com'];

interface ManualBody {
  text?: unknown;
  vendor_id?: unknown;
}

interface ParsedRow {
  variety: string | null;
  stem_length: number | null;
  qty: number | null;
  cost: number | null;
  raw_line: string;
}

function parseNumber(s: string | undefined): number | null {
  if (s === undefined) return null;
  const trimmed = s.trim();
  if (trimmed.length === 0) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function parseLines(text: string): ParsedRow[] {
  const out: ParsedRow[] = [];
  const lines = text.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (line.length === 0) continue;
    // Skip likely header rows: starts with 'variety' (case-insensitive) and has commas
    if (/^variety\s*[,;]/i.test(line)) continue;

    const cols = line.split(',').map((c) => c.trim());
    out.push({
      variety: cols[0] && cols[0].length > 0 ? cols[0] : null,
      stem_length: parseNumber(cols[1]),
      qty: parseNumber(cols[2]),
      cost: parseNumber(cols[3]),
      raw_line: line,
    });
  }
  return out;
}

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

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: ManualBody;
  try {
    body = (await req.json()) as ManualBody;
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }

  if (typeof body.text !== 'string') {
    return NextResponse.json(
      { error: 'invalid_text', detail: 'text must be a string' },
      { status: 400 },
    );
  }
  const text = body.text;
  if (text.trim().length === 0) {
    return NextResponse.json(
      { error: 'empty_text', detail: 'text must be non-empty' },
      { status: 400 },
    );
  }
  if (text.length > 200_000) {
    return NextResponse.json(
      { error: 'text_too_long', detail: 'max 200000 chars' },
      { status: 400 },
    );
  }

  let vendorId: string | null = null;
  if (body.vendor_id !== undefined && body.vendor_id !== null) {
    if (typeof body.vendor_id !== 'string') {
      return NextResponse.json(
        { error: 'invalid_vendor_id', detail: 'must be a string' },
        { status: 400 },
      );
    }
    const trimmed = body.vendor_id.trim();
    if (trimmed.length > 256) {
      return NextResponse.json(
        { error: 'vendor_id_too_long', detail: 'max 256 chars' },
        { status: 400 },
      );
    }
    vendorId = trimmed.length > 0 ? trimmed : null;
  }

  const parsed = parseLines(text);

  const service = getBackupServiceClient();
  const { data, error } = await service
    .from('ingestion_batches')
    .insert({
      source: 'manual_paste',
      vendor_id: vendorId,
      raw_payload: { text },
      parsed_rows: parsed,
      parser_confidence: 0.5,
      status: 'awaiting_review',
      created_by: auth.userId,
    })
    .select('id')
    .maybeSingle();

  if (error) {
    Sentry.captureException(error, {
      tags: { route: 'admin/ingest/manual', step: 'insert' },
    });
    return NextResponse.json(
      { error: 'insert_failed', detail: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { id: data?.id, parsed_count: parsed.length },
    { status: 201 },
  );
}
