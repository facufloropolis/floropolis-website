// Admin dispatch manifest — v1 refactor: 3-tab structure (Today / Queued / Historical).
// v4 | 2026-05-28 | Job_PM dispatch-v1-refactor [V8 SHADOW]
//
// BRD: catalog_BRD_PRD_v0.3 §5.3 Block 4 (UC-O-181..195) and Block 5
// (UC-O-196..203). v4 refactor (Facu directive 2026-05-28):
//   - 4-tab top-nav (Web / Upcoming / Recent / Farm shipments) collapsed to
//     3-tab structure: Today (default), Queued (next 7 days), Historical
//     (date-range picker).
//   - FedEx clarification banner + DispatchDateNav moved into the page header
//     so they're visible on all 3 tabs.
//   - Yesterday's Arrivals card (mockup lines 294-305) added to the middle
//     column of DispatchTodayPanel via the new YesterdayArrivalsCard server
//     component.
//
// Rose-data tabs (Upcoming, Recent, Farm shipments) are deferred from the v1
// surface. The fetch functions are preserved — see TODO block below for the
// restore path.
//
// Phase F (per-day body) keeps:
//   - 3-column layout per /mockups/admin-dispatch (DispatchTodayPanel)
//   - Date filtering (?date=YYYY-MM-DD)
//   - Stage filter via DispatchPipelineWidget (?stage=quote..shipped)
//
// Constraints (rose_table_audit_v1.md section 4):
//   - n8n_dispatch_queue : HARD READ-ONLY. No write paths, no buttons.
//   - dispatch_batches / events / tracking / farm_shipments : JOB_READ_OK.
//   - All Rose reads go through lib/supabase/prod-server.ts service-role client.
//   - D1 writes still go through getBackupServiceClient() (supabase-backup).
//
// Access: middleware guards /admin to facu@floropolis.com. Server-side belt-
// and-suspenders re-checks session + client_profiles.status='admin'.

export const dynamic = 'force-dynamic';

import Link from 'next/link';
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

import DispatchTodayPanel, { TodayRow } from './DispatchTodayPanel';
import YesterdayArrivalsCard from './YesterdayArrivalsCard';
import QueuedView, { type DayBlock as QueuedDayBlock } from './QueuedView';
import HistoricalView, { type DayBlock as HistoricalDayBlock } from './HistoricalView';

// TODO (Rose tabs deferred 2026-05-28): the Upcoming (Rose n8n_dispatch_queue),
// Recent (Rose dispatch_batches), and Farm shipments tabs were dropped from the
// v1 nav to focus the surface on the daily-dispatch loop. The data fetches
// (RoseDispatchData.ts) are still imported and exercised so the fetch paths
// don't bit-rot — see kb/projects/t1_tabs_perfect_spec.md for the restore path
// (likely as a side-panel callout inside Queued, or a separate /admin/dispatch/rose
// sub-route).
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

type DispatchView = 'today' | 'queued' | 'historical';

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

function fmtDate(iso: string | null): string {
  if (!iso) return '-';
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    weekday: 'short',
    timeZone: 'UTC',
  });
}

function fmtDayHeading(iso: string, todayIso: string): string {
  const tomorrowIso = addDaysIso(todayIso, 1);
  const dt = new Date(iso + 'T00:00:00Z');
  const weekday = dt.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
  const monthDay = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  if (iso === todayIso) return `Today · ${monthDay}`;
  if (iso === tomorrowIso) return `Tomorrow · ${monthDay}`;
  return `${weekday} · ${monthDay}`;
}

function stageForRow(r: ManifestRow): PipelineStage {
  const d = r.dispatch;
  if (!d) {
    if (r.order.status === 'paid' || r.order.status === 'fulfilled') return 'cost_confirmed';
    return 'quote';
  }
  if (d.status === 'in_transit' || d.status === 'delivered') return 'shipped';
  if (d.status === 'packed' || d.status === 'label_printed' || d.status === 'picked_up') return 'packed';
  return 'procured';
}

// Convert a ManifestRow into a serialisable TodayRow for DispatchTodayPanel.
function manifestToTodayRow(r: ManifestRow): TodayRow {
  return {
    orderId: r.order.id,
    orderNumber: r.order.order_number,
    businessName: r.businessName,
    city: r.order.shipping_address_snapshot?.city ?? null,
    state: r.order.shipping_address_snapshot?.state ?? null,
    farm:
      r.order.order_lines?.find((l) => l.sku_vendor_snapshot)?.sku_vendor_snapshot ??
      'Unknown',
    boxesCount: r.boxesCount,
    totalQty: r.totalQty,
    dispatchId: r.dispatch?.id ?? null,
    status: r.dispatch?.status ?? 'awaiting_pack',
    trackingNumber: r.dispatch?.tracking_number ?? null,
    labelUrl: r.dispatch?.label_url ?? null,
    labelSignedUrl: r.labelSignedUrl,
    driverPickupConfirmed: r.dispatch?.driver_pickup_confirmed ?? false,
    driverPickupAt: r.dispatch?.driver_pickup_confirmed_at ?? null,
    fedexConfirmed: r.dispatch?.fedex_confirmed ?? false,
    fedexAt: r.dispatch?.fedex_confirmed_at ?? null,
    whatsappPhone: r.order.shipping_address_snapshot?.phone ?? null,
    comms: r.comms,
    skus: (r.order.order_lines ?? []).map((l) => ({
      name: l.sku_name_snapshot ?? `SKU ${l.sku_id}`,
      qty: l.quantity ?? 0,
    })),
  };
}

// Derive the active Rose pipeline step from a set of rows on the same day.
// 0:PREP 1:REVIEW 2:DISPATCH 3:LABELS 4:READ 5:EMAILS 6:SEND 7:LOG 8:PRE-ARRIVAL
function derivePipelineStep(rows: ManifestRow[]): number {
  if (rows.length === 0) return 0;
  const dispatches = rows.map((r) => r.dispatch).filter((d): d is DispatchRow => d !== null);
  if (dispatches.length === 0) return 2;
  if (!dispatches.some((d) => d.label_url)) return 3;
  if (!dispatches.some((d) => d.tracking_number)) return 4;
  if (!dispatches.every((d) => d.fedex_confirmed)) return 5;
  if (!dispatches.every((d) => d.driver_pickup_confirmed)) return 6;
  return 7;
}

function totalBoxesForRows(rows: ManifestRow[]): number {
  return rows.reduce((sum, r) => {
    const shipped =
      r.dispatch?.status === 'in_transit' || r.dispatch?.status === 'delivered';
    if (shipped) return sum;
    return sum + (r.boxesCount ?? 0);
  }, 0);
}

export const metadata = {
  title: 'Dispatch | Floropolis Admin',
  robots: { index: false, follow: false },
};

interface PageProps {
  searchParams: Promise<{
    view?: string;      // today | queued | historical
    date?: string;      // anchor date for the date-nav
    from?: string;      // historical range start
    to?: string;        // historical range end
    stage?: string;
  }>;
}

const ADMIN_EMAILS = ['facu@floropolis.com', 'jjpj@crescoinversiones.com', 'jjpj@floropolis.com', 'jjp@floropolis.com'];

export default async function AdminDispatchPage({ searchParams }: PageProps) {
  // Re-check admin server-side ----------------------------------------------
  const userClient = await createUserClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user?.email) redirect('/auth/login?next=/admin/dispatch');

  let isAdmin = ADMIN_EMAILS.includes(user.email.toLowerCase());
  if (!isAdmin) {
    const adminClient = getBackupServiceClient();
    const { data: profile } = await adminClient
      .from('client_profiles')
      .select('status')
      .eq('user_id', user.id)
      .maybeSingle();
    if (profile?.status === 'admin') isAdmin = true;
  }
  if (!isAdmin) redirect('/');

  const sp = await searchParams;

  const activeView: DispatchView =
    sp.view === 'queued' || sp.view === 'historical'
      ? (sp.view as DispatchView)
      : 'today';

  const todayIso = todayUtcIso();
  const dateParam =
    sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : null;
  const activeDate = dateParam ?? todayIso;

  // Historical range parsing
  const fromParam =
    sp.from && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) ? sp.from : null;
  const toParam =
    sp.to && /^\d{4}-\d{2}-\d{2}$/.test(sp.to) ? sp.to : null;
  const histFrom = fromParam ?? addDaysIso(todayIso, -7);
  const histTo = toParam ?? (fromParam ?? todayIso);

  const validStages: PipelineStage[] = ['quote', 'cost_confirmed', 'procured', 'packed', 'shipped'];
  const activeStage: PipelineStage | null =
    sp.stage && (validStages as string[]).includes(sp.stage)
      ? (sp.stage as PipelineStage)
      : null;

  // Rose-data fetches preserved (deferred from v1 nav — see TODO above).
  // Run them in parallel so the fetch path stays exercised; we don't render
  // their UI but their existence ensures the underlying queries are validated.
  await Promise.all([
    fetchRoseQueueUpcoming(),
    fetchRoseBatchesRecent(),
    fetchFarmShipmentsRecent(),
  ]);

  // Fetch orders that need dispatch ----------------------------------------
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

  // Signed URLs for uploaded labels ---------------------------------------
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

  // Build manifest rows ----------------------------------------------------
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

  // Apply optional stage filter across the universe.
  const stageFilteredRows = activeStage
    ? rowsAll.filter((r) => stageForRow(r) === activeStage)
    : rowsAll;

  // Group all rows by effective day (dispatch_date or targetShipDate).
  function rowDate(r: ManifestRow): string {
    return r.dispatch?.dispatch_date ?? r.targetShipDate;
  }

  // ── TODAY view ──────────────────────────────────────────────────────────
  // Rows where effective day == activeDate.
  const todayRows = stageFilteredRows.filter((r) => rowDate(r) === activeDate);
  const totalBoxesForActiveDate = totalBoxesForRows(todayRows);
  const activePipelineStep = derivePipelineStep(todayRows);

  // ── QUEUED view ─────────────────────────────────────────────────────────
  // Next 7 days starting from tomorrow (relative to activeDate).
  const queuedBlocks: QueuedDayBlock[] = [];
  for (let i = 1; i <= 7; i++) {
    const iso = addDaysIso(activeDate, i);
    const rowsForDay = stageFilteredRows.filter((r) => rowDate(r) === iso);
    queuedBlocks.push({
      isoDate: iso,
      heading: fmtDayHeading(iso, todayIso),
      rows: rowsForDay.map(manifestToTodayRow),
      totalBoxes: totalBoxesForRows(rowsForDay),
      activePipelineStep: derivePipelineStep(rowsForDay),
    });
  }

  // ── HISTORICAL view ─────────────────────────────────────────────────────
  // All days from histFrom to histTo inclusive.
  const histBlocks: HistoricalDayBlock[] = [];
  if (histFrom && histTo && histFrom <= histTo) {
    let cur = histFrom;
    // Hard cap at 60 days to bound rendering cost.
    let steps = 0;
    while (cur <= histTo && steps < 60) {
      const rowsForDay = stageFilteredRows.filter((r) => rowDate(r) === cur);
      histBlocks.push({
        isoDate: cur,
        heading: fmtDayHeading(cur, todayIso),
        rows: rowsForDay.map(manifestToTodayRow),
        totalBoxes: totalBoxesForRows(rowsForDay),
        activePipelineStep: derivePipelineStep(rowsForDay),
      });
      cur = addDaysIso(cur, 1);
      steps += 1;
    }
  }

  // Load eligible prospects for the sample-box modal ----------------------
  const { data: prospectsRaw } = await backup
    .from('sample_box_prospects')
    .select('id, business_name, contact_name, city, state, status')
    .in('status', ['eligible', 'sent'])
    .order('business_name', { ascending: true })
    .limit(50);
  const prospects = (prospectsRaw ?? []) as unknown as ProspectOption[];

  const defaultDispatchId =
    todayRows.find((r) => r.dispatch != null)?.dispatch?.id ?? null;

  const todayLabel = fmtDate(todayIso);

  // View counts for the top-tab strip.
  const queuedCount = queuedBlocks.reduce((s, b) => s + b.rows.length, 0);
  const histCount = histBlocks.reduce((s, b) => s + b.rows.length, 0);

  const viewTabs: { key: DispatchView; label: string; count: number | null }[] = [
    { key: 'today', label: 'Today', count: todayRows.length },
    { key: 'queued', label: 'Queued (next 7 days)', count: queuedCount },
    { key: 'historical', label: 'Historical', count: activeView === 'historical' ? histCount : null },
  ];

  const viewHref = (k: DispatchView): string => {
    const params = new URLSearchParams();
    params.set('view', k);
    if (k === 'historical') {
      params.set('from', histFrom);
      params.set('to', histTo);
    } else if (dateParam) {
      params.set('date', dateParam);
    }
    if (activeStage) params.set('stage', activeStage);
    return `/admin/dispatch?${params.toString()}`;
  };

  const exportHref = `/api/admin/dispatch/export?date=${activeDate}`;

  const wiringEntry = getWiringForPage('/admin/dispatch');
  const wm = (id: string) =>
    wiringEntry?.sections.find((s) => s.id === id) ?? { level: 'PLAN' as const, note: 'unregistered' };

  return (
    <>
      <main className="max-w-7xl mx-auto px-4 py-10">
        <MockupLinkBanner mockupHref="/mockups/admin-dispatch" pageLabel="/admin/dispatch" />

        {/* Header — visible on all views */}
        <div className="flex items-start justify-between mb-5 flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Dispatch manifest</h1>
            <p className="text-slate-500 text-sm mt-1">
              D1 orders + Phase F dispatch loop. Today, queued (7 days), and historical views.
            </p>
          </div>
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
        </div>

        {/* FedEx clarification banner — visible on all views */}
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 mb-6 flex items-start gap-3">
          <span className="text-blue-500 text-lg shrink-0">📦</span>
          <p className="text-sm text-blue-800">
            <strong>FedEx receives at Quito depot by 10pm ECT.</strong> Driver picks up at the farm in the afternoon —
            confirmation usually arrives via WhatsApp.{' '}
            <span className="text-blue-600 font-medium">→ Contacts: edgar.freire@fedex.com · Dominique Romero (dromero@entregas.ec)</span>
          </p>
        </div>

        {/* Top-level view tabs */}
        <div className="flex gap-2 border-b border-slate-200 mb-6 overflow-x-auto">
          {viewTabs.map((t) => {
            const active = t.key === activeView;
            return (
              <a
                key={t.key}
                href={viewHref(t.key)}
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

        {/* Pipeline widget (kept across views — shows global counts) */}
        <WiringSection level={wm('pipeline-widget').level} note={wm('pipeline-widget').note} id="pipeline-widget">
          <div className="mb-6">
            <DispatchPipelineWidget
              counts={pipelineCounts}
              activeStage={activeStage}
              totalBoxes={totalBoxesForActiveDate}
            />
          </div>
        </WiringSection>

        {/* View body */}
        <WiringSection level={wm('manifest-table').level} note={wm('manifest-table').note} id="manifest-table">
          {activeView === 'today' && (
            todayRows.length === 0 ? (
              <div className="text-center py-20 text-slate-400 border border-dashed border-slate-200 rounded-xl">
                <p className="font-semibold text-slate-600">No orders for {todayLabel}</p>
                <p className="text-sm mt-1">
                  Check Queued for the next 7 days or use the date nav to inspect another day.
                </p>
              </div>
            ) : (
              <DispatchTodayPanel
                rows={todayRows.map(manifestToTodayRow)}
                totalBoxes={totalBoxesForActiveDate}
                todayLabel={todayLabel}
                activePipelineStep={activePipelineStep}
                prospects={prospects.map((p) => ({
                  id: p.id,
                  business_name: p.business_name,
                  contact_name: p.contact_name,
                  city: p.city,
                  state: p.state,
                }))}
                defaultDispatchId={defaultDispatchId}
                yesterdayArrivalsSlot={<YesterdayArrivalsCard />}
              />
            )
          )}

          {activeView === 'queued' && (
            <QueuedView
              blocks={queuedBlocks}
              prospects={prospects.map((p) => ({
                id: p.id,
                business_name: p.business_name,
                contact_name: p.contact_name,
                city: p.city,
                state: p.state,
              }))}
              defaultDispatchId={defaultDispatchId}
              todayLabel={todayLabel}
            />
          )}

          {activeView === 'historical' && (
            <HistoricalView
              fromIso={histFrom}
              toIso={histTo}
              blocks={histBlocks}
              prospects={prospects.map((p) => ({
                id: p.id,
                business_name: p.business_name,
                contact_name: p.contact_name,
                city: p.city,
                state: p.state,
              }))}
              defaultDispatchId={defaultDispatchId}
              todayLabel={todayLabel}
            />
          )}
        </WiringSection>

        {/* Footer note + per-row feedback affordance for delivered orders.
            BRD UC-O-196..203 — kept on the page (not in mockup) because it's
            required for the post-delivery feedback loop. Currently surfaces
            only on the Today view's delivered rows; once Historical shows
            delivered orders, the feedback affordance is inline on each panel. */}
        {activeView === 'today' && todayRows.some((r) => r.dispatch?.status === 'delivered') && (
          <div className="mt-8 space-y-3">
            <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">
              Delivered today — capture feedback
            </h3>
            {todayRows
              .filter((r) => r.dispatch?.status === 'delivered')
              .map((r) => {
                const skus = (r.order.order_lines ?? [])
                  .filter((l) => l.sku_id != null)
                  .map((l) => ({
                    sku_id: String(l.sku_id),
                    sku_name: l.sku_name_snapshot ?? `SKU ${l.sku_id}`,
                  }));
                const badge = STATUS_BADGE[r.dispatch!.status];
                return (
                  <div
                    key={r.order.id}
                    className="bg-white border border-slate-200 rounded-xl p-4 flex items-start justify-between gap-4"
                  >
                    <div className="min-w-0">
                      <Link
                        href={`/admin/orders/${r.order.id}`}
                        className="font-mono text-xs font-semibold text-slate-700 hover:text-emerald-700 hover:underline"
                      >
                        {r.order.order_number}
                      </Link>
                      <p className="text-sm text-slate-700 font-medium mt-0.5">{r.businessName}</p>
                      <span
                        className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${badge.cls}`}
                      >
                        {badge.label}
                      </span>
                    </div>
                    <div className="shrink-0">
                      <DispatchFeedbackForm
                        dispatchId={r.dispatch!.id}
                        existingFeedbackCount={r.feedbackCount}
                        skus={skus}
                      />
                    </div>
                  </div>
                );
              })}
          </div>
        )}

        <p className="text-xs text-slate-400 mt-8">
          Data source: supabase-backup orders + dispatches + dispatch_communications +
          dispatch_feedback + sample_box_prospects. Service-role writes; admin gate on
          every /api/admin/dispatch/* route. To initialize a dispatch for a paid order,
          open the order detail page and click &quot;Initialize dispatch&quot;.
        </p>
      </main>
    </>
  );
}
