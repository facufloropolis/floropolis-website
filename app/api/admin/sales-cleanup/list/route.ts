// GET /api/admin/sales-cleanup/list
// v2 | 2026-05-22 | Job_PM [V8 SHADOW]
//
// Calls public.sales_cleanup_list RPC (deployed 2026-05-22).
// Query params: status (pending|resolved|all), limit (1-200), offset (0+)
// Auth: ADMIN_EMAILS gate matches middleware.ts.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getProdReadClient } from '@/lib/supabase/prod-server';

const ADMIN_EMAILS = [
  'facu@floropolis.com',
  'jjpj@crescoinversiones.com',
  'jjpj@floropolis.com',
  'jjp@floropolis.com',
];

const VALID_STATUSES = ['pending', 'deferred', 'resolved', 'auto_resolved', 'all'];

export async function GET(req: NextRequest) {
  const userClient = await createUserClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user?.email || !ADMIN_EMAILS.includes(user.email.toLowerCase())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const prod = getProdReadClient();
  if (!prod) {
    return NextResponse.json({ error: 'Production DB not configured' }, { status: 503 });
  }

  const sp = req.nextUrl.searchParams;
  const status = VALID_STATUSES.includes(sp.get('status') ?? '') ? sp.get('status')! : 'pending';
  const limit = Math.min(Math.max(parseInt(sp.get('limit') ?? '50'), 1), 200);
  const offset = Math.max(parseInt(sp.get('offset') ?? '0'), 0);

  const { data, error } = await prod.rpc('sales_cleanup_list', {
    p_status: status,
    p_limit: limit,
    p_offset: offset,
  });

  if (error) {
    console.error('[sales-cleanup/list]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // RPC returns { rows, total_pending, total_pending_usd }
  const result = data as { rows: unknown[]; total_pending: number; total_pending_usd: number };
  return NextResponse.json({
    rows: result.rows ?? [],
    total_count: result.total_pending ?? 0,
    total_pending_usd: result.total_pending_usd ?? 0,
  });
}
