// POST /api/admin/catalog/config/flag-rose
// v1 | 2026-05-19 | Job_PM Phase D [V8 SHADOW]
//
// Per Rose audit (Section 1 / box_master): "Box physical dimensions come from
// FedEx labels. Job has no independent data source for dim corrections. If Job
// observes discrepancy, escalate to Facu directly -- not via admin_proposals."
//
// This route writes a row into public.rose_queue. Body:
//   {
//     sku_id: string         // box_type (canonical identity) when flagging a box row
//                            // or floropolis_inventory_mirror.id as text otherwise
//     reason_code: 'box_dim_discrepancy' | 'pricing_question' | 'shipping_question'
//     reason_text: string    // free-form context (CEO will read)
//   }
//
// Admin only. Returns the inserted row.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';

import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';

const ADMIN_EMAILS = ['facu@floropolis.com', 'jjpj@crescoinversiones.com'];

interface AuthOk { ok: true; userId: string; email: string }
interface AuthFail { ok: false; response: NextResponse }

async function requireAdmin(): Promise<AuthOk | AuthFail> {
  const userClient = await createUserClient();
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) {
    return { ok: false, response: NextResponse.json({ error: 'unauthenticated' }, { status: 401 }) };
  }
  const emailLc = (user.email ?? '').toLowerCase();
  if (ADMIN_EMAILS.includes(emailLc)) {
    return { ok: true, userId: user.id, email: emailLc };
  }
  const adminClient = getBackupServiceClient();
  const { data: profile } = await adminClient
    .from('client_profiles')
    .select('status')
    .eq('user_id', user.id)
    .maybeSingle();
  if (profile?.status === 'admin') {
    return { ok: true, userId: user.id, email: emailLc };
  }
  return { ok: false, response: NextResponse.json({ error: 'not_admin' }, { status: 403 }) };
}

const VALID_REASON_CODES = new Set([
  'box_dim_discrepancy',
  'pricing_question',
  'shipping_question',
  'data_quality',
]);

interface FlagBody {
  sku_id?: unknown;
  reason_code?: unknown;
  reason_text?: unknown;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: FlagBody;
  try {
    body = (await req.json()) as FlagBody;
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }

  if (typeof body.sku_id !== 'string' || body.sku_id.trim().length === 0) {
    return NextResponse.json({ error: 'invalid_sku_id' }, { status: 400 });
  }
  if (typeof body.reason_code !== 'string' || !VALID_REASON_CODES.has(body.reason_code)) {
    return NextResponse.json(
      { error: 'invalid_reason_code', detail: `must be one of ${Array.from(VALID_REASON_CODES).join(', ')}` },
      { status: 400 },
    );
  }
  if (typeof body.reason_text !== 'string' || body.reason_text.trim().length < 5) {
    return NextResponse.json(
      { error: 'invalid_reason_text', detail: 'must be at least 5 chars' },
      { status: 400 },
    );
  }

  const service = getBackupServiceClient();
  const { data, error } = await service
    .from('rose_queue')
    .insert({
      sku_id: body.sku_id.trim(),
      reason_code: body.reason_code,
      reason_text: body.reason_text.trim().slice(0, 4000),
      flagged_by: auth.email,
      status: 'pending',
    })
    .select('*')
    .maybeSingle();

  if (error) {
    Sentry.captureException(error, {
      tags: { route: 'admin/catalog/config/flag-rose', method: 'POST' },
    });
    return NextResponse.json(
      { error: 'insert_failed', detail: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ row: data }, { status: 201 });
}
