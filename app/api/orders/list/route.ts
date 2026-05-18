// GET /api/orders/list — returns the current user's order summaries.
// v1 | 2026-05-17 | Job_PM W4-S12 [V8 SHADOW]
//
// Auth: user-context Supabase session (cookie). Anonymous -> 401.
// Read: supabase-backup via service-role; explicit WHERE user_id = <session uid>.
//   (FK on orders.user_id is being dropped per W4-S11 cross-project workaround,
//    so RLS isn't usable here — we just filter explicitly.)
//
// Limit: 50 orders, newest first (covers single-page UI on /account/orders).

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';

import { createBackupServerClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';

const RESPONSE_LIMIT = 50;

export async function GET(): Promise<NextResponse> {
  // ---- Auth (BACKUP session -- Phase 4 SEGURISIMA) ----
  let userId: string;
  try {
    const userClient = await createBackupServerClient();
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
    }
    userId = user.id;
  } catch (err) {
    Sentry.captureException(err, { tags: { route: 'orders/list', step: 'auth' } });
    return NextResponse.json({ error: 'auth_failed' }, { status: 500 });
  }

  // ---- Fetch ----
  const backup = getBackupServiceClient();
  const { data, error } = await backup
    .from('orders')
    .select(
      'id, order_number, status, requested_delivery_date, grand_total, currency, created_at',
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(RESPONSE_LIMIT);

  if (error) {
    Sentry.captureException(error, { tags: { route: 'orders/list', step: 'select' } });
    return NextResponse.json(
      { error: 'orders_fetch_failed', detail: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ orders: data ?? [] });
}
