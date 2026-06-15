// POST /api/admin/supply/fix-magic-flowers-box
// v1 | 2026-06-15 | Job_PM (CPO)
//
// Fixes Magic Flowers 1/8 box in box_master_mirror:
//   1. legacy_box_type '1/8-MF' -> '1/8' (makes the view join work)
//   2. stems_per_box = <Facu-confirmed value>
// Both values are required. Admin only.
//
// Body: { stemsPerBox: number }
// Returns: { ok: true, updatedRows: number, skusNowPriced: number }

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';

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

interface FixBody {
  stemsPerBox?: unknown;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: FixBody = {};
  try {
    const raw = await req.text();
    if (raw.length > 0) body = JSON.parse(raw) as FixBody;
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }

  const stemsRaw = body.stemsPerBox;
  const stemsPerBox =
    typeof stemsRaw === 'number' && Number.isFinite(stemsRaw)
      ? Math.round(stemsRaw)
      : typeof stemsRaw === 'string'
        ? parseInt(stemsRaw, 10)
        : NaN;

  if (!Number.isFinite(stemsPerBox) || stemsPerBox < 1 || stemsPerBox > 500) {
    return NextResponse.json(
      { error: 'invalid_stems_per_box', detail: 'stemsPerBox must be an integer between 1 and 500' },
      { status: 400 },
    );
  }

  const svc = getBackupServiceClient();

  // 1. Apply the fix: rename legacy_box_type + set confirmed stems_per_box.
  const { data: updated, error: updateErr } = await svc
    .from('box_master_mirror')
    .update({
      legacy_box_type: '1/8',
      stems_per_box: stemsPerBox,
      updated_at: new Date().toISOString(),
    })
    .eq('vendor_canonical_name', 'Magic Flowers')
    .eq('legacy_box_type', '1/8-MF')
    .select('id');

  if (updateErr) {
    console.error('[admin/supply/fix-magic-flowers-box] update error:', updateErr);
    return NextResponse.json(
      { error: 'update_failed', detail: updateErr.message },
      { status: 500 },
    );
  }

  const updatedRows = (updated ?? []).length;

  // 2. Count Magic Flowers SKUs that now have a price (computable_status != 'unpriced').
  const { count: skusNowPriced, error: countErr } = await svc
    .from('v_catalog_admin')
    .select('*', { count: 'exact', head: true })
    .eq('vendor', 'Magic Flowers')
    .neq('computable_status', 'unpriced');

  if (countErr) {
    console.error('[admin/supply/fix-magic-flowers-box] count error:', countErr);
    // Non-fatal: return partial result.
    return NextResponse.json({ ok: true, updatedRows, skusNowPriced: null });
  }

  return NextResponse.json({ ok: true, updatedRows, skusNowPriced: skusNowPriced ?? 0 });
}
