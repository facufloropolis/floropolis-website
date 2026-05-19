// /api/admin/rose-queue
// v1 | 2026-05-19 | Job_PM admin-port Phase B [V8 SHADOW]
//
// POST — insert a row in rose_queue. Used by admin UI to "Flag to CEO" / "Flag to Rose"
// when an issue cannot be expressed as an admin_proposals row (per Rose contract v1.0,
// box_master is READ-ONLY for Job — discrepancies escalate via rose_queue, not proposal).
//
// Body: { sku_id, reason_code, reason_text, flagged_by? }
//   reason_code must match the rose_queue CHECK constraint:
//     'cost_unverified','no_box_dims','no_image','below_min_qty','no_quality_family',
//     'price_below_formula','price_above_formula','vendor_unverified','copy_violation',
//     'seo_missing','country_not_accepted','delivery_below_tier_minimum',
//     'beyond_catalog_horizon','other'
//
// GET — list rose_queue rows for a sku (admin only). Optional ?sku_id= filter.
//
// Auth: admin only.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';

const ADMIN_EMAILS = ['facu@floropolis.com', 'jjpj@crescoinversiones.com'];

const VALID_REASON_CODES = [
  'cost_unverified',
  'no_box_dims',
  'no_image',
  'below_min_qty',
  'no_quality_family',
  'price_below_formula',
  'price_above_formula',
  'vendor_unverified',
  'copy_violation',
  'seo_missing',
  'country_not_accepted',
  'delivery_below_tier_minimum',
  'beyond_catalog_horizon',
  'other',
] as const;

interface AuthOk { ok: true; userId: string; email: string }
interface AuthFail { ok: false; response: NextResponse }

async function requireAdmin(): Promise<AuthOk | AuthFail> {
  const userClient = await createUserClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'unauthenticated' }, { status: 401 }),
    };
  }
  const emailLc = (user.email ?? '').toLowerCase();
  if (ADMIN_EMAILS.includes(emailLc)) return { ok: true, userId: user.id, email: emailLc };
  const service = getBackupServiceClient();
  const { data: profile } = await service
    .from('client_profiles')
    .select('status')
    .eq('user_id', user.id)
    .maybeSingle();
  if (profile?.status === 'admin') return { ok: true, userId: user.id, email: emailLc };
  return {
    ok: false,
    response: NextResponse.json({ error: 'not_admin' }, { status: 403 }),
  };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const url = new URL(req.url);
  const skuId = url.searchParams.get('sku_id');
  const status = url.searchParams.get('status');
  const service = getBackupServiceClient();
  let q = service
    .from('rose_queue')
    .select('*')
    .order('flagged_at', { ascending: false })
    .limit(100);
  if (skuId) q = q.eq('sku_id', skuId);
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) {
    return NextResponse.json(
      { error: 'query_failed', detail: error.message },
      { status: 500 },
    );
  }
  return NextResponse.json({ items: data ?? [] });
}

interface PostBody {
  sku_id?: unknown;
  reason_code?: unknown;
  reason_text?: unknown;
  flagged_by?: unknown;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }

  let skuId: string;
  if (typeof body.sku_id === 'string' && body.sku_id.length > 0) skuId = body.sku_id;
  else if (typeof body.sku_id === 'number') skuId = String(body.sku_id);
  else
    return NextResponse.json(
      { error: 'invalid_sku_id', detail: 'string or number required' },
      { status: 400 },
    );

  const reasonCode = body.reason_code;
  if (typeof reasonCode !== 'string' || !VALID_REASON_CODES.includes(reasonCode as typeof VALID_REASON_CODES[number])) {
    return NextResponse.json(
      {
        error: 'invalid_reason_code',
        detail: `must be one of ${VALID_REASON_CODES.join(', ')}`,
      },
      { status: 400 },
    );
  }

  const reasonText = body.reason_text;
  if (typeof reasonText !== 'string' || reasonText.trim().length < 5) {
    return NextResponse.json(
      {
        error: 'invalid_reason_text',
        detail: 'must be a string with >= 5 chars',
      },
      { status: 400 },
    );
  }

  let flaggedBy = 'admin_ui';
  if (typeof body.flagged_by === 'string' && body.flagged_by.trim().length > 0) {
    flaggedBy = body.flagged_by.trim().slice(0, 64);
  }

  const service = getBackupServiceClient();
  const { data, error } = await service
    .from('rose_queue')
    .insert({
      sku_id: skuId,
      reason_code: reasonCode,
      reason_text: reasonText.trim().slice(0, 2000),
      flagged_by: flaggedBy,
    })
    .select('*')
    .maybeSingle();
  if (error) {
    return NextResponse.json(
      { error: 'insert_failed', detail: error.message },
      { status: 500 },
    );
  }
  return NextResponse.json({ item: data }, { status: 201 });
}
