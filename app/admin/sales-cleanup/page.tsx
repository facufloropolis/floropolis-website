// /admin/sales-cleanup — orphan transaction resolution queue.
// v2 | 2026-05-22 | Job_PM [V8 SHADOW]
//
// RSC: fetches initial pending list via public.sales_cleanup_list RPC.
// Client component handles refresh, expand, resolve, tab switching.
// Auth: ADMIN_EMAILS (middleware primary; belt-and-suspenders here).

export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getProdReadClient } from '@/lib/supabase/prod-server';
import SalesCleanupClient from './SalesCleanupClient';
import type { OrphanRow } from '@/lib/admin/sales-cleanup-model';

const ADMIN_EMAILS = [
  'facu@floropolis.com',
  'jjpj@crescoinversiones.com',
  'jjpj@floropolis.com',
  'jjp@floropolis.com',
];

export default async function SalesCleanupPage() {
  const userClient = await createUserClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user?.email || !ADMIN_EMAILS.includes(user.email.toLowerCase())) {
    redirect('/auth/login?next=/admin/sales-cleanup');
  }

  const prod = getProdReadClient();

  let rows: OrphanRow[] = [];
  let totalCount = 0;
  let totalPendingUsd = 0;

  if (prod) {
    const { data, error } = await prod.rpc('sales_cleanup_list', {
      p_status: 'pending',
      p_limit: 100,
      p_offset: 0,
    });

    if (error) {
      console.error('[sales-cleanup/page] RPC error:', error);
    } else if (data) {
      const result = data as { rows: OrphanRow[]; total_pending: number; total_pending_usd: number };
      rows = result.rows ?? [];
      totalCount = result.total_pending ?? 0;
      totalPendingUsd = result.total_pending_usd ?? 0;
    }
  } else {
    console.error('[sales-cleanup/page] getProdReadClient() returned null — PROD_SUPABASE_SERVICE_KEY and NEXT_PUBLIC_SUPABASE_ANON_KEY both missing');
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <SalesCleanupClient
        initial={{ rows, total_count: totalCount, total_pending_usd: totalPendingUsd }}
      />
    </div>
  );
}
