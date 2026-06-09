// Admin Orders queue -- /admin/orders
// v4 | 2026-06-09 | Job_PM order-visibility #3 (mockup-match rebuild)
//
// Capability #3 = ORDER VISIBILITY, now matched to the approved mockup
// (app/mockups/admin-orders). Server component: auth gate + fetch the combined
// orders view, then hand rows to the client surface (OrdersClient) which
// reproduces the mockup layout (KPI tiles, tabs, date filter, day-grouped
// table, per-row inline detail).
//
// DATA (PROD, read-only via getProdReadClient):
//   - public.v_unified_orders  -- THE combined source: every order across both
//     channels (A = web/quote funnel; B = K2K prebooks/invoices we closed).
//   - public.v_customer_360     -- client dimension for the row detail.
//   Wiring lives in ./unified-orders.ts. If PROD is unconfigured or the view
//   errors -> honest empty state, never fabricated orders.
//
// AUTH: unchanged -- ADMIN_EMAILS allowlist OR client_profiles.status='admin'
// (belt-and-suspenders behind the /admin middleware).
//
// Style: emerald-600 / slate house style, ASCII-clean Spanish-leaning copy.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { redirect } from 'next/navigation';

import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';
import OrdersClient from './OrdersClient';
import { getUnifiedOrders } from './unified-orders';

export const metadata = {
  title: 'Pedidos | Floropolis Admin',
  robots: { index: false, follow: false },
};

const ADMIN_EMAILS = ['facu@floropolis.com', 'jjpj@crescoinversiones.com'];

async function gateAdmin(): Promise<void> {
  const userClient = await createUserClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user || !user.email) redirect('/');

  if (ADMIN_EMAILS.includes(user.email.toLowerCase())) return;

  const svc = getBackupServiceClient();
  const { data: profile } = await svc
    .from('client_profiles')
    .select('status')
    .eq('user_id', user.id)
    .maybeSingle();
  if (profile?.status === 'admin') return;

  redirect('/');
}

export default async function AdminOrdersPage() {
  await gateAdmin();

  const { rows, total, bucketCounts, error } = await getUnifiedOrders();

  return <OrdersClient rows={rows} total={total} bucketCounts={bucketCounts} error={error} />;
}
