// Admin dispatch manifest + Phase F 4-panel completion + Rose tabs.
// v3 | 2026-05-19 | Job_PM disp-real [V8 SHADOW]
//
// BRD: catalog_BRD_PRD_v0.3 §5.3 Block 4 (UC-O-181..195) and Block 5
// (UC-O-196..203). Top-level tabs added in v3:
//   - Web (D1)         current behavior (D1 dispatches table + Phase F panels)
//   - Upcoming (Rose)  read-only n8n_dispatch_queue (HARD BOUNDARY)
//   - Recent (Rose)    read-only dispatch_batches + dispatch_events (30d)
//   - Farm shipments   read-only farm_shipments (30d)
//
// Phase F (Web tab) keeps:
//   - 4-panel layout per /mockups/admin-dispatch
//   - Date navigation (?date=YYYY-MM-DD)
//   - Stage filter via DispatchPipelineWidget (?stage=quote..shipped)
//   - 4 inner status sub-tabs (today / tomorrow / week / late)
//
// Constraints (rose_table_audit_v1.md section 4):
//   - n8n_dispatch_queue : HARD READ-ONLY. No write paths, no buttons.
//     Cancels go through admin_proposals (type='dispatch_cancel').
//   - dispatch_batches / events / tracking / farm_shipments : JOB_READ_OK.
//   - All Rose reads go through lib/supabase/prod-server.ts service-role client.
//   - D1 writes still go through getBackupServiceClient() (supabase-backup).
//
// Access: middleware guards /admin to facu@floropolis.com. Server-side belt-
// and-suspenders re-checks session + client_profiles.status='admin'.

export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';

import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';
import WiringSection from '@/components/admin/WiringSection';
import MockupLinkBanner from '@/components/admin/MockupLinkBanner';
import { getWiringForPage } from '@/lib/admin/wiring';

import DispatchRowActions from './DispatchRowActions';
import DispatchCommunicationsPanel, { CommRow } from './DispatchCommunicationsPanel';
import DispatchLabelsPanel from './DispatchLabelsPanel';
import DispatchPipelineWidget, { PipelineStage, PipelineCounts } from './DispatchPipelineWidget';
import DispatchSampleBoxButton, { ProspectOption } from './DispatchSampleBoxButton';
import DispatchDateNav from './DispatchDateNav';
import DispatchFeedbackForm from './DispatchFeedbackForm';

import RoseUpcomingTab from './RoseUpcomingTab';
import RoseRecentTab from './RoseRecentTab';
import RoseFarmShipmentsTab from './RoseFarmShipmentsTab';
import {
  fetchRoseQueueUpcoming,
  fetchRoseBatchesRecent,
  fetchFarmShipmentsRecent,
} from './RoseDispatchData';

type DispatchStatus =
  | 'awaiting_pack'
  | 'packed'
  | 'label_printed'
  | 'picked_up'
  | 'in_transit'
  | 'delivered'
  | 'exception';

type DispatchInnerTab = 'today' | 'tomorrow' | 'week' | 'late';
type DispatchTopTab = 'web' | 'upcoming' | 'recent' | 'farms';

interface AddressSnapshot {
  recipient_name?: string | null;
  business_name?: string | null;
  phone?: string | null;
  city?: string | null;
  state?: string | null;
  email?: string | null;
}

interface OrderLineSnap {
  sku_id?: number | null;
  quantity?: number | null;
  sku_name_snapshot?: string | null;
  sku_vendor_snapshot?: string | null;
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
  order_lines?: OrderLineSnap[] | null;
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
  // Phase F additions
  driver_pickup_confirmed: boolean;
  driver_pickup_confirmed_at: string | null;
  fedex_confirmed: boolean;
  fedex_confirmed_at: string | null;
  dispatch_date: string | null;
}

interface ManifestRow {
  order: OrderRow;
  dispatch: DispatchRow | null;
  targetShipDate: string;
  boxesCount: number;
  totalQty: number;
  businessName: string;
  // Phase F: ancillary data per row
  comms: CommRow[];
  feedbackCount: number;
  labelSignedUrl: string | null;
}

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

function tabForRow(
  targetIso: string,
  todayIso: string,
  weekEndIso: string,
  dispatched: boolean,
): DispatchInnerTab {
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

function stageForRow(r: ManifestRow): PipelineStage {
  const d = r.dispatch;
  if (!d) {
    // No dispatch row yet -> Quote (or Cost confirmed if order is paid/fulfilled).
    if (r.order.status === 'paid' || r.order.status === 'fulfilled') return 'cost_confirmed';
    return 'quote';
  }
  if (d.status === 'in_transit' || d.status === 'delivered') return 'shipped';
  if (d.status === 'packed' || d.status === 'label_printed' || d.status === 'picked_up') return 'packed';
  return 'procured';
}

export const metadata = {
  title: 'Dispatch | Floropolis Admin',
  robots: { index: false, follow: false },
};

interface PageProps {
  searchParams: Promise<{
    tab?: string;       // Web inner tab (today/tomorrow/week/late)
    top?: string;       // Top-level tab (web/upcoming/recent/farms)
    date?: string;
    stage?: string;
  }>;
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

  const topTab: DispatchTopTab =
    sp.top === 'upcoming' || sp.top === 'recent' || sp.top === 'farms'
      ? (sp.top as DispatchTopTab)
      : 'web';

  // Fan-out Rose reads in parallel (only when we'll actually render them).
  // Always run the fetches: they short-circuit fast when env is missing, and
  // we use the configured/lastSyncedAt fields to render the tab strip badges.
  const [upcomingData, recentData, farmsData] = await Promise.all([
    fetchRoseQueueUpcoming(),
    fetchRoseBatchesRecent(),
    fetchFarmShipmentsRecent(),
  ]);

  // The Web (D1) tab does its full data fetch regardless of which top tab is
  // active, because the top-tab strip needs to show the D1 count too.
  const todayIso = todayUtcIso();
  const dateParam =
    sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : null;
  const activeDate = dateParam ?? todayIso;

  const activeInnerTab: DispatchInnerTab =
    sp.tab === 'tomorrow' || sp.tab === 'week' || sp.tab === 'late'
      ? (sp.tab as DispatchInnerTab)
      : 'today';

  const validStages: PipelineStage[] = ['quote', 'cost_confirmed', 'procured', 'packed', 'shipped'];
  const activeStage: PipelineStage | null =
    sp.stage && (validStages as string[]).includes(sp.stage)
      ? (sp.stage as PipelineStage)
      : null;

  // Fetch orders that need dispatch (D1 tab) -------------------------------
  const backup = getBackupServiceClient();
  const { data: ordersRaw, error: ordersErr } = await backup
    .from('orders')
    .select(
      'id, order_number, status, lead_time_days, requested_delivery_date, shipping_address_snapshot, paid_at, created_at, order_lines ( sku_id, quantity, sku_name_snapshot, sku_vendor_snapshot )',
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
  const dispatchIds = Object.values(dispatchesByOrderId).map((d) => d.id);

  // Fetch communications + feedback counts for those dispatches -----------
  let commsByDispatchId: Record<string, CommRow[]> = {};
  let feedbackCountByDispatchId: Record<string, number> = {};
  if (dispatchIds.length > 0) {
    const { data: commsRaw } = await backup
      .from('dispatch_communications')
      .select('id, dispatch_id, channel, direction, subject, recipient, sent_at, notes')
      .in('dispatch_id', dispatchIds)
      .order('sent_at', { ascending: false });
    commsByDispatchId = ((commsRaw ?? []) as unknown as (CommRow & { dispatch_id: string })[]).reduce(
      (acc, c) => {
        (acc[c.dispatch_id] ??= []).push({
          id: c.id,
          channel: c.channel,
          direction: c.direction,
          subject: c.subject,
          recipient: c.recipient,
          sent_at: c.sent_at,
          notes: c.notes,
        });
        return acc;
      },
      {} as Record<string, CommRow[]>,
    );

    const { data: fbRaw } = await backup
      .from('dispatch_feedback')
      .select('dispatch_id')
      .in('dispatch_id', dispatchIds);
    feedbackCountByDispatchId = ((fbRaw ?? []) as { dispatch_id: string }[]).reduce(
      (acc, r) => {
        acc[r.dispatch_id] = (acc[r.dispatch_id] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );
  }

  // Signed URLs for uploaded labels --------------------------------------
  const labelSignedUrlByDispatchId: Record<string, string | null> = {};
  const dispatchesWithLabels = Object.values(dispatchesByOrderId).filter((d) => !!d.label_url);
  if (dispatchesWithLabels.length > 0) {
    for (const d of dispatchesWithLabels) {
      const v = d.label_url ?? '';
      if (/^https?:\/\//.test(v)) {
        labelSignedUrlByDispatchId[d.id] = v;
      } else if (v) {
        const { data: signed } = await backup.storage
          .from('dispatch-labels')
          .createSignedUrl(v, 60 * 60); // 1h
        labelSignedUrlByDispatchId[d.id] = signed?.signedUrl ?? null;
      }
    }
  }

  // Build manifest rows --------------------------------------------------
  const weekEndIso = addDaysIso(todayIso, 6);

  const rowsAll: ManifestRow[] = orders.map((o) => {
    const dispatch = dispatchesByOrderId[o.id] ?? null;
    const totalQty = (o.order_lines ?? []).reduce((s, l) => s + (l.quantity ?? 0), 0);
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
      comms: dispatch ? (commsByDispatchId[dispatch.id] ?? []) : [],
      feedbackCount: dispatch ? (feedbackCountByDispatchId[dispatch.id] ?? 0) : 0,
      labelSignedUrl: dispatch ? (labelSignedUrlByDispatchId[dispatch.id] ?? null) : null,
    };
  });

  const pipelineCounts: PipelineCounts = {
    quote: 0,
    cost_confirmed: 0,
    procured: 0,
    packed: 0,
    shipped: 0,
  };
  for (const r of rowsAll) {
    pipelineCounts[stageForRow(r)] += 1;
  }

  // Total boxes scheduled for the active date — drives the 2-box-minimum pill
  // in the pipeline widget header. Counts every row whose dispatch_date (or, if
  // null, derived ship date) matches the active date AND that hasn't already
  // shipped (in_transit / delivered are out of the loading-truck count).
  const totalBoxesForActiveDate = rowsAll.reduce((sum, r) => {
    const rDate = r.dispatch?.dispatch_date ?? r.targetShipDate;
    if (rDate !== activeDate) return sum;
    const shipped =
      r.dispatch?.status === 'in_transit' || r.dispatch?.status === 'delivered';
    if (shipped) return sum;
    return sum + (r.boxesCount ?? 0);
  }, 0);

  const counts: Record<DispatchInnerTab, number> = { today: 0, tomorrow: 0, week: 0, late: 0 };
  for (const r of rowsAll) {
    const dispatched =
      r.dispatch != null && r.dispatch.status !== 'awaiting_pack' && r.dispatch.status !== 'exception';
    const t = tabForRow(r.targetShipDate, todayIso, weekEndIso, dispatched);
    counts[t] += 1;
  }

  let visible: ManifestRow[];
  if (dateParam) {
    visible = rowsAll.filter((r) => {
      const rDate = r.dispatch?.dispatch_date ?? r.targetShipDate;
      return rDate === dateParam;
    });
  } else {
    visible = rowsAll.filter((r) => {
      const dispatched =
        r.dispatch != null && r.dispatch.status !== 'awaiting_pack' && r.dispatch.status !== 'exception';
      return tabForRow(r.targetShipDate, todayIso, weekEndIso, dispatched) === activeInnerTab;
    });
  }
  if (activeStage) {
    visible = visible.filter((r) => stageForRow(r) === activeStage);
  }

  const byDate = visible.reduce(
    (acc, r) => {
      const k = r.dispatch?.dispatch_date ?? r.targetShipDate;
      (acc[k] ??= []).push(r);
      return acc;
    },
    {} as Record<string, ManifestRow[]>,
  );
  const sortedDates = Object.keys(byDate).sort();

  // Load eligible prospects for the sample-box modal ---------------------
  const { data: prospectsRaw } = await backup
    .from('sample_box_prospects')
    .select('id, business_name, contact_name, city, state, status')
    .in('status', ['eligible', 'sent'])
    .order('business_name', { ascending: true })
    .limit(50);
  const prospects = (prospectsRaw ?? []) as unknown as ProspectOption[];

  const defaultDispatchId =
    visible.find((r) => r.dispatch != null)?.dispatch?.id ?? null;

  const innerTabs: { key: DispatchInnerTab; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: 'tomorrow', label: 'Tomorrow' },
    { key: 'week', label: 'This week' },
    { key: 'late', label: 'Late' },
  ];

  const topTabs: { key: DispatchTopTab; label: string; count: number | null }[] = [
    { key: 'web', label: 'Web (D1)', count: rowsAll.length },
    { key: 'upcoming', label: 'Upcoming (Rose)', count: upcomingData.configured ? upcomingData.rows.length : null },
    { key: 'recent', label: 'Recent (Rose)', count: recentData.configured ? recentData.rows.length : null },
    { key: 'farms', label: 'Farm shipments', count: farmsData.configured ? farmsData.rows.length : null },
  ];

  // Preserve filters when navigating Web sub-tabs only; top-tab links reset them.
  const topHref = (key: DispatchTopTab): string => `/admin/dispatch?top=${key}`;

  const exportHref = `/api/admin/dispatch/export?date=${activeDate}`;

  const wiringEntry = getWiringForPage('/admin/dispatch');
  const wm = (id: string) =>
    wiringEntry?.sections.find((s) => s.id === id) ?? { level: 'PLAN' as const, note: 'unregistered' };

  return (
    <>
      <main className="max-w-7xl mx-auto px-4 py-10">
        <MockupLinkBanner mockupHref="/mockups/admin-dispatch" pageLabel="/admin/dispatch" />
        {/* Header */}
        <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Dispatch manifest</h1>
            <p className="text-slate-500 text-sm mt-1">
              D1 orders (Web), Rose-owned dispatch queue + batches + farm shipments.
              Rose tabs are HARD READ-ONLY: cancels go through admin_proposals.
            </p>
          </div>
          {topTab === 'web' && (
            <div className="flex flex-col items-end gap-2">
              <DispatchDateNav date={activeDate} todayIso={todayIso} />
              <div className="flex items-center gap-2">
                <a
                  href={exportHref}
                  className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 border border-emerald-300 hover:border-emerald-500 px-3 py-1.5 rounded-lg"
                >
                  Download FedEx CSV
                </a>
                <DispatchSampleBoxButton
                  prospects={prospects}
                  defaultDispatchId={defaultDispatchId}
                />
              </div>
            </div>
          )}
        </div>

        {/* Top-level tabs */}
        <div className="flex gap-2 border-b border-slate-200 mb-6 overflow-x-auto">
          {topTabs.map((t) => {
            const active = t.key === topTab;
            return (
              <a
                key={t.key}
                href={topHref(t.key)}
                className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors whitespace-nowrap ${
                  active
                    ? 'border-emerald-600 text-emerald-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                {t.label}
                {t.count != null && (
                  <span
                    className={`ml-2 text-xs ${active ? 'text-emerald-700' : 'text-slate-400'}`}
                  >
                    ({t.count})
                  </span>
                )}
              </a>
            );
          })}
        </div>

        {topTab === 'web' && (
          <>
            {/* Pipeline widget (Panel 4) */}
            <WiringSection level={wm('pipeline-widget').level} note={wm('pipeline-widget').note} id="pipeline-widget">
              <div className="mb-6">
                <DispatchPipelineWidget
                  counts={pipelineCounts}
                  activeStage={activeStage}
                  totalBoxes={totalBoxesForActiveDate}
                />
              </div>
            </WiringSection>

            {/* Inner status tabs (hidden when explicit date filter is set) */}
            {!dateParam && (
              <div className="flex gap-2 border-b border-slate-200 mb-6 overflow-x-auto">
                {innerTabs.map((t) => {
                  const active = t.key === activeInnerTab;
                  return (
                    <a
                      key={t.key}
                      href={`/admin/dispatch?top=web&tab=${t.key}`}
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
            )}

            <WiringSection level={wm('manifest-table').level} note={wm('manifest-table').note} id="manifest-table">
            {visible.length === 0 ? (
              <div className="text-center py-20 text-slate-400 border border-dashed border-slate-200 rounded-xl">
                <p className="font-semibold text-slate-600">No orders in this view</p>
                <p className="text-sm mt-1">
                  Try a different date, clear the stage filter, or check the Today tab.
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
                            <th className="text-left px-3 py-2.5 font-semibold text-slate-500 text-xs uppercase tracking-wide">
                              Order
                            </th>
                            <th className="text-left px-3 py-2.5 font-semibold text-slate-500 text-xs uppercase tracking-wide">
                              Customer
                            </th>
                            <th className="text-left px-3 py-2.5 font-semibold text-slate-500 text-xs uppercase tracking-wide">
                              Status
                            </th>
                            <th className="text-left px-3 py-2.5 font-semibold text-slate-500 text-xs uppercase tracking-wide w-64">
                              Communications
                            </th>
                            <th className="text-left px-3 py-2.5 font-semibold text-slate-500 text-xs uppercase tracking-wide w-64">
                              Labels &amp; confirmations
                            </th>
                            <th className="text-left px-3 py-2.5 font-semibold text-slate-500 text-xs uppercase tracking-wide">
                              Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {byDate[d].map((r) => {
                            const status: DispatchStatus = r.dispatch?.status ?? 'awaiting_pack';
                            const badge = STATUS_BADGE[status];
                            const isDelivered = status === 'delivered';
                            const skus = (r.order.order_lines ?? [])
                              .filter((l) => l.sku_id != null)
                              .map((l) => ({
                                sku_id: String(l.sku_id),
                                sku_name: l.sku_name_snapshot ?? `SKU ${l.sku_id}`,
                              }));
                            return (
                              <tr key={r.order.id} className="hover:bg-slate-50 align-top">
                                <td className="px-3 py-3 font-mono text-xs font-semibold text-slate-700">
                                  {r.order.order_number}
                                  <div className="text-slate-400 font-normal mt-0.5">
                                    {r.boxesCount} box{r.boxesCount === 1 ? '' : 'es'} - {r.totalQty} stems
                                  </div>
                                </td>
                                <td className="px-3 py-3 text-slate-700 text-xs">
                                  <div className="font-medium">{r.businessName}</div>
                                  {r.order.shipping_address_snapshot?.city && (
                                    <div className="text-slate-400">
                                      {r.order.shipping_address_snapshot.city},{' '}
                                      {r.order.shipping_address_snapshot.state ?? ''}
                                    </div>
                                  )}
                                </td>
                                <td className="px-3 py-3">
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
                                  {r.dispatch ? (
                                    <div className="text-xs text-slate-500 mt-1">
                                      <div className="uppercase">{r.dispatch.carrier}</div>
                                      <div className="font-mono text-slate-700">
                                        {r.dispatch.tracking_number ?? '-'}
                                      </div>
                                    </div>
                                  ) : null}
                                  {isDelivered && r.dispatch && (
                                    <div className="mt-2">
                                      <DispatchFeedbackForm
                                        dispatchId={r.dispatch.id}
                                        existingFeedbackCount={r.feedbackCount}
                                        skus={skus}
                                      />
                                    </div>
                                  )}
                                </td>
                                <td className="px-3 py-3">
                                  {r.dispatch ? (
                                    <DispatchCommunicationsPanel
                                      dispatchId={r.dispatch.id}
                                      orderNumber={r.order.order_number}
                                      businessName={r.businessName}
                                      recipientEmail={r.order.shipping_address_snapshot?.email ?? null}
                                      comms={r.comms}
                                    />
                                  ) : (
                                    <span className="text-xs text-slate-400 italic">
                                      Initialize dispatch to enable
                                    </span>
                                  )}
                                </td>
                                <td className="px-3 py-3">
                                  {r.dispatch ? (
                                    <DispatchLabelsPanel
                                      dispatchId={r.dispatch.id}
                                      labelStoragePath={r.dispatch.label_url}
                                      labelSignedUrl={r.labelSignedUrl}
                                      driverPickupConfirmed={r.dispatch.driver_pickup_confirmed}
                                      driverPickupAt={r.dispatch.driver_pickup_confirmed_at}
                                      fedexConfirmed={r.dispatch.fedex_confirmed}
                                      fedexAt={r.dispatch.fedex_confirmed_at}
                                      driverWhatsappPhone={r.order.shipping_address_snapshot?.phone ?? null}
                                    />
                                  ) : (
                                    <span className="text-xs text-slate-400 italic">-</span>
                                  )}
                                </td>
                                <td className="px-3 py-3">
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
            </WiringSection>

            <p className="text-xs text-slate-400 mt-8">
              Data source: supabase-backup orders + dispatches + dispatch_communications +
              dispatch_feedback + sample_box_prospects. Service-role writes; admin gate on
              every /api/admin/dispatch/* route. To initialize a dispatch for a paid order,
              open the order detail page and click &quot;Initialize dispatch&quot;.
              {' '}n8n_dispatch_queue is Rose-owned (JOB_READ_OK only); admin cancel of a
              Rose-vendor email is an admin_proposals row of type=&apos;dispatch_cancel&apos;.
            </p>
          </>
        )}

        {topTab === 'upcoming' && <RoseUpcomingTab data={upcomingData} />}
        {topTab === 'recent' && <RoseRecentTab data={recentData} />}
        {topTab === 'farms' && <RoseFarmShipmentsTab data={farmsData} />}
      </main>
    </>
  );
}
