// Admin dispatch manifest.
// v1 | 2026-05-18 | Job_PM admin-port DISP [V8 SHADOW]
//
// Lists orders that need fulfillment, joined with their dispatches row.
// Groups by target ship date (requested_delivery_date - lead_time_days).
// Tabs: Today / Tomorrow / This week / Late.
//
// Access:
//   - Middleware guards /admin and restricts to facu@floropolis.com.
//   - Server-side belt-and-suspenders: re-check session + client_profiles.status='admin'.
//   - Non-admin -> redirect('/').
//
// Style: emerald-600 primary, Plus Jakarta Sans (inherited), ASCII-clean copy.

export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';

import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';
import Navigation from '@/components/Navigation';
import TopBanner from '@/components/TopBanner';
import Footer from '@/components/Footer';

import DispatchRowActions from './DispatchRowActions';

type DispatchStatus =
  | 'awaiting_pack'
  | 'packed'
  | 'label_printed'
  | 'picked_up'
  | 'in_transit'
  | 'delivered'
  | 'exception';

type DispatchTab = 'today' | 'tomorrow' | 'week' | 'late';

interface AddressSnapshot {
  recipient_name?: string | null;
  business_name?: string | null;
  city?: string | null;
  state?: string | null;
}

interface OrderRow {
  id: number;
  order_number: string;
  status: string;
  lead_time_days: number;
  requested_delivery_date: string;
  shipping_address_snapshot: AddressSnapshot | null;
  paid_at: string | null;
  created_at: string;
  order_lines?: { quantity: number }[] | null;
}

interface DispatchRow {
  id: string;
  order_id: number;
  status: DispatchStatus;
  carrier: string;
  tracking_number: string | null;
  label_url: string | null;
  packed_at: string | null;
  picked_up_at: string | null;
  in_transit_at: string | null;
  delivered_at: string | null;
  exception_note: string | null;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
}

interface ManifestRow {
  order: OrderRow;
  dispatch: DispatchRow | null;
  targetShipDate: string; // YYYY-MM-DD in UTC
  boxesCount: number;
  totalQty: number;
  businessName: string;
}

// Orders eligible for fulfillment. 'paid' = D1 status after charge has cleared
// and the order is awaiting pack/ship. 'fulfilled' is included so finished
// dispatches still appear under "This week" until they age off.
const FULFILLABLE_STATUSES = ['paid', 'fulfilled'];

const STATUS_BADGE: Record<DispatchStatus, { cls: string; label: string }> = {
  awaiting_pack:  { cls: 'bg-slate-100 text-slate-700 border-slate-200', label: 'Awaiting pack' },
  packed:         { cls: 'bg-blue-50 text-blue-800 border-blue-200',     label: 'Packed' },
  label_printed:  { cls: 'bg-violet-50 text-violet-800 border-violet-200', label: 'Label printed' },
  picked_up:      { cls: 'bg-amber-50 text-amber-800 border-amber-200',  label: 'Picked up' },
  in_transit:     { cls: 'bg-indigo-50 text-indigo-800 border-indigo-200', label: 'In transit' },
  delivered:      { cls: 'bg-emerald-50 text-emerald-800 border-emerald-200', label: 'Delivered' },
  exception:      { cls: 'bg-red-50 text-red-800 border-red-200',        label: 'Exception' },
};

function todayUtcIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function shipDateFromOrder(o: OrderRow): string {
  const delivery = o.requested_delivery_date;
  if (!delivery) return o.paid_at?.slice(0, 10) ?? o.created_at.slice(0, 10);
  return addDaysIso(delivery, -Math.max(0, o.lead_time_days ?? 0));
}

function tabForRow(targetIso: string, todayIso: string, weekEndIso: string, dispatched: boolean): DispatchTab {
  if (targetIso < todayIso && !dispatched) return 'late';
  if (targetIso === todayIso) return 'today';
  if (targetIso === addDaysIso(todayIso, 1)) return 'tomorrow';
  if (targetIso >= todayIso && targetIso <= weekEndIso) return 'week';
  return 'week';
}

function fmtDate(iso: string | null): string {
  if (!iso) return '-';
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    weekday: 'short',
    timeZone: 'UTC',
  });
}

export const metadata = {
  title: 'Dispatch | Floropolis Admin',
  robots: { index: false, follow: false },
};

interface PageProps {
  searchParams: Promise<{ tab?: string }>;
}

export default async function AdminDispatchPage({ searchParams }: PageProps) {
  // Re-check admin server-side ----------------------------------------------
  const userClient = await createUserClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) redirect('/');

  const adminClient = getBackupServiceClient();
  const { data: profile } = await adminClient
    .from('client_profiles')
    .select('status')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!profile || profile.status !== 'admin') {
    redirect('/');
  }

  const sp = await searchParams;
  const activeTab: DispatchTab =
    sp.tab === 'tomorrow' || sp.tab === 'week' || sp.tab === 'late'
      ? sp.tab
      : 'today';

  // Fetch orders that need dispatch ----------------------------------------
  const backup = getBackupServiceClient();
  const { data: ordersRaw, error: ordersErr } = await backup
    .from('orders')
    .select(
      'id, order_number, status, lead_time_days, requested_delivery_date, shipping_address_snapshot, paid_at, created_at, order_lines ( quantity )',
    )
    .in('status', FULFILLABLE_STATUSES)
    .order('requested_delivery_date', { ascending: true })
    .limit(500);
  if (ordersErr) {
    console.error('[admin/dispatch] orders fetch error:', ordersErr);
  }
  const orders = (ordersRaw ?? []) as unknown as OrderRow[];

  // Fetch dispatches for those orders --------------------------------------
  const orderIds = orders.map((o) => o.id);
  let dispatchesByOrderId: Record<number, DispatchRow> = {};
  if (orderIds.length > 0) {
    const { data: dispatchesRaw } = await backup
      .from('dispatches')
      .select('*')
      .in('order_id', orderIds);
    dispatchesByOrderId = ((dispatchesRaw ?? []) as unknown as DispatchRow[]).reduce(
      (acc, d) => {
        acc[d.order_id] = d;
        return acc;
      },
      {} as Record<number, DispatchRow>,
    );
  }

  // Build manifest rows ----------------------------------------------------
  const todayIso = todayUtcIso();
  const weekEndIso = addDaysIso(todayIso, 6);

  const rows: ManifestRow[] = orders.map((o) => {
    const dispatch = dispatchesByOrderId[o.id] ?? null;
    const totalQty = (o.order_lines ?? []).reduce((s, l) => s + (l.quantity ?? 0), 0);
    // Boxes is computed in real ops by box_plan; here we approximate as
    // ceil(totalQty / 125) which is the typical Ecuador rose carton fill.
    const boxesCount = totalQty > 0 ? Math.max(1, Math.ceil(totalQty / 125)) : 0;
    const businessName =
      o.shipping_address_snapshot?.business_name ??
      o.shipping_address_snapshot?.recipient_name ??
      '-';
    return {
      order: o,
      dispatch,
      targetShipDate: shipDateFromOrder(o),
      boxesCount,
      totalQty,
      businessName,
    };
  });

  // Group + filter ---------------------------------------------------------
  const counts: Record<DispatchTab, number> = { today: 0, tomorrow: 0, week: 0, late: 0 };
  for (const r of rows) {
    const dispatched =
      r.dispatch != null && r.dispatch.status !== 'awaiting_pack' && r.dispatch.status !== 'exception';
    const t = tabForRow(r.targetShipDate, todayIso, weekEndIso, dispatched);
    counts[t] += 1;
  }

  const visible = rows.filter((r) => {
    const dispatched =
      r.dispatch != null && r.dispatch.status !== 'awaiting_pack' && r.dispatch.status !== 'exception';
    return tabForRow(r.targetShipDate, todayIso, weekEndIso, dispatched) === activeTab;
  });

  // Group visible rows by date for display.
  const byDate = visible.reduce(
    (acc, r) => {
      const k = r.targetShipDate;
      (acc[k] ??= []).push(r);
      return acc;
    },
    {} as Record<string, ManifestRow[]>,
  );
  const sortedDates = Object.keys(byDate).sort();

  const tabs: { key: DispatchTab; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: 'tomorrow', label: 'Tomorrow' },
    { key: 'week', label: 'This week' },
    { key: 'late', label: 'Late' },
  ];

  return (
    <div className="min-h-screen bg-white">
      <TopBanner />
      <Navigation />

      <main className="max-w-7xl mx-auto px-4 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Dispatch manifest</h1>
          <p className="text-slate-500 text-sm mt-1">
            Orders awaiting pack, pickup, or carrier handoff. Target ship date =
            requested delivery - lead time. Late = target date passed without a
            dispatch leaving awaiting_pack.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-slate-200 mb-6 overflow-x-auto">
          {tabs.map((t) => {
            const active = t.key === activeTab;
            return (
              <a
                key={t.key}
                href={`/admin/dispatch?tab=${t.key}`}
                className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors whitespace-nowrap ${
                  active
                    ? 'border-emerald-600 text-emerald-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                {t.label}
                <span
                  className={`ml-2 text-xs ${active ? 'text-emerald-700' : 'text-slate-400'}`}
                >
                  ({counts[t.key]})
                </span>
              </a>
            );
          })}
        </div>

        {visible.length === 0 ? (
          <div className="text-center py-20 text-slate-400 border border-dashed border-slate-200 rounded-xl">
            <p className="font-semibold text-slate-600">
              No orders in this bucket
            </p>
            <p className="text-sm mt-1">
              New orders move into Today once requested delivery minus lead time = today.
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {sortedDates.map((d) => (
              <section key={d}>
                <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-3">
                  {fmtDate(d)}{' '}
                  <span className="text-slate-400 font-normal normal-case">
                    - {byDate[d].length} order{byDate[d].length === 1 ? '' : 's'}
                  </span>
                </h2>

                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="text-left px-4 py-2.5 font-semibold text-slate-500 text-xs uppercase tracking-wide">
                          Order
                        </th>
                        <th className="text-left px-4 py-2.5 font-semibold text-slate-500 text-xs uppercase tracking-wide">
                          Customer
                        </th>
                        <th className="text-left px-4 py-2.5 font-semibold text-slate-500 text-xs uppercase tracking-wide">
                          Boxes
                        </th>
                        <th className="text-left px-4 py-2.5 font-semibold text-slate-500 text-xs uppercase tracking-wide">
                          Stems
                        </th>
                        <th className="text-left px-4 py-2.5 font-semibold text-slate-500 text-xs uppercase tracking-wide">
                          Status
                        </th>
                        <th className="text-left px-4 py-2.5 font-semibold text-slate-500 text-xs uppercase tracking-wide">
                          Carrier / tracking
                        </th>
                        <th className="text-left px-4 py-2.5 font-semibold text-slate-500 text-xs uppercase tracking-wide">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {byDate[d].map((r) => {
                        const status: DispatchStatus = r.dispatch?.status ?? 'awaiting_pack';
                        const badge = STATUS_BADGE[status];
                        return (
                          <tr key={r.order.id} className="hover:bg-slate-50">
                            <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-700">
                              {r.order.order_number}
                            </td>
                            <td className="px-4 py-3 text-slate-700">
                              <div className="font-medium">{r.businessName}</div>
                              {r.order.shipping_address_snapshot?.city && (
                                <div className="text-xs text-slate-400">
                                  {r.order.shipping_address_snapshot.city},{' '}
                                  {r.order.shipping_address_snapshot.state ?? ''}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3 text-slate-700 font-mono">
                              {r.boxesCount}
                            </td>
                            <td className="px-4 py-3 text-slate-500 font-mono">
                              {r.totalQty}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold border ${badge.cls}`}
                              >
                                {badge.label}
                              </span>
                              {r.dispatch?.exception_note && (
                                <div className="text-xs text-red-600 mt-1 max-w-[200px]">
                                  {r.dispatch.exception_note}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-500">
                              {r.dispatch ? (
                                <>
                                  <div className="uppercase">
                                    {r.dispatch.carrier}
                                  </div>
                                  <div className="font-mono text-slate-700">
                                    {r.dispatch.tracking_number ?? '-'}
                                  </div>
                                </>
                              ) : (
                                <span className="italic text-slate-400">
                                  Not initialized
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {r.dispatch ? (
                                <DispatchRowActions
                                  dispatchId={r.dispatch.id}
                                  status={status}
                                  trackingNumber={r.dispatch.tracking_number}
                                />
                              ) : (
                                <span className="text-xs text-slate-400 italic">
                                  Initialize from /admin/orders/{r.order.id}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>
        )}

        <p className="text-xs text-slate-400 mt-8">
          Data source: supabase-backup orders + dispatches. Status updates POST to
          /api/admin/dispatch/[id]/status with allowed forward transitions and
          timestamp stamping. To initialize a dispatch for a paid order, open the
          order detail page and click &quot;Initialize dispatch&quot; (TODO: button
          lives on /admin/orders/[id]).
        </p>
      </main>

      <Footer />
    </div>
  );
}
