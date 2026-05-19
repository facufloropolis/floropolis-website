// AdminKPITiles -- right-rail counter tiles for /admin.
// v1 | 2026-05-19 | Job_PM SHELL-V2 [V8 SHADOW]
//
// Reuses the existing counter queries from the previous app/admin/page.tsx
// VERBATIM (per W3 spec: do not rewrite the logic, just move it). Counters:
//   - catalog_classifications total / publishable
//   - admin_proposals awaiting_facu
//   - orders open (payment_authorized + payment_captured + pending)
//   - refund_approvals pending
//   - client_profiles pending

import type { ReactNode } from 'react';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';

interface KpiRowProps {
  label: string;
  value: string;
  change?: string;
  emphasis?: boolean;
}

function KpiRow({ label, value, change, emphasis }: KpiRowProps) {
  return (
    <div className="flex items-baseline justify-between text-xs">
      <span className="text-slate-500">{label}</span>
      <div className="text-right">
        <span className={`font-semibold ${emphasis ? 'text-emerald-700' : 'text-slate-900'}`}>
          {value}
        </span>
        {change ? <span className="ml-2 text-slate-500">{change}</span> : null}
      </div>
    </div>
  );
}

export default async function AdminKPITiles(): Promise<ReactNode> {
  const svc = getBackupServiceClient();

  // Pull live counters in parallel -- copied verbatim from the previous
  // app/admin/page.tsx (W2). DO NOT REWRITE per spec.
  const [
    { count: catalogTotal },
    { count: publishable },
    { count: awaitingApproval },
    { count: ordersOpen },
    { count: refundsPending },
    { count: clientsPending },
  ] = await Promise.all([
    svc.from('catalog_classifications').select('*', { count: 'exact', head: true }),
    // Publishable = catalog_classifications.status='publishable' (text column, not a boolean).
    // Fix 2026-05-19: was .eq('publishable', true) which crashed prod with "column does not exist".
    svc.from('catalog_classifications').select('*', { count: 'exact', head: true }).eq('status', 'publishable'),
    svc.from('admin_proposals').select('*', { count: 'exact', head: true }).eq('status', 'awaiting_facu').then(
      (r) => ({ count: r.count }),
      () => ({ count: null }),
    ),
    svc.from('orders').select('*', { count: 'exact', head: true }).in('status', ['payment_authorized', 'payment_captured', 'pending']),
    svc.from('refund_approvals').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    svc.from('client_profiles').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
  ]);

  const publishablePct = catalogTotal ? Math.round((publishable ?? 0) * 100 / catalogTotal) : 0;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <h2 className="text-sm font-bold text-slate-900 mb-3">Today&apos;s numbers</h2>
      <div className="space-y-2">
        <KpiRow
          label="Publishable SKUs"
          value={`${publishable ?? 0} / ${catalogTotal ?? 0}`}
          change={`${publishablePct}%`}
          emphasis
        />
        <KpiRow
          label="Awaiting your approval"
          value={awaitingApproval != null ? String(awaitingApproval) : 'n/a'}
        />
        <KpiRow label="Orders open" value={String(ordersOpen ?? 0)} />
        <KpiRow label="Refunds pending" value={String(refundsPending ?? 0)} />
        <KpiRow label="Clients pending" value={String(clientsPending ?? 0)} />
      </div>
    </div>
  );
}
