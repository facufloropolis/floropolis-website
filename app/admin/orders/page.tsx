// Admin Orders list -- /admin/orders
// v3 | 2026-06-08 | Job_PM order-visibility #3
//
// Capability #3 = ORDER VISIBILITY: one merged surface across EVERY source.
//
// Tabs:
//   0. All orders (unified) -- ?tab=all (DEFAULT)
//        one row per order across both planes (spine + legacy read-channel),
//        merged in this page from app/admin/orders/unified-orders.ts. Filters
//        by source + normalized status. Read-only (visibility), no decisions.
//   1. Web orders (D1)   -- ?tab=d1
//        supabase-backup public.orders + client_profiles + get_client_emails RPC
//   2. Historical K2K    -- ?tab=k2k_orders
//        floropolis-bi public.k2k_orders (READ-ONLY, JOB_READ_OK per Rose audit v1)
//   3. Prebooks K2K      -- ?tab=k2k_prebooks
//        floropolis-bi public.k2k_prebooks (READ-ONLY, JOB_READ_OK per Rose audit v1)
//
// HARD RULE: tabs 2 and 3 are READ-ONLY. No INSERT/UPDATE/DELETE under any
// circumstance. Rose owns these tables; they're scraped from K2K. Rose freshness
// SLA is 1h per `shared/state/rose_table_audit_v1.md` Section 2.
//
// Source clients:
//   - D1: getBackupServiceClient()  (service role, supabase-backup)
//   - K2K: createUserClient() (anon, floropolis-bi -- same client used for the
//     existing catalog read path). K2K RLS policies allow anon SELECT
//     (qual=true), so anon access is sufficient; no BI service role is wired
//     in this app yet.
//
// Style: emerald-600 primary, Plus Jakarta Sans (inherited), ASCII-clean.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import Link from 'next/link';
import { redirect } from 'next/navigation';

import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { createClient as createBiServerClient } from '@/lib/supabase/server';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';
import WiringSection from '@/components/admin/WiringSection';
import MockupLinkBanner from '@/components/admin/MockupLinkBanner';
import { getWiringForPage } from '@/lib/admin/wiring';
import {
  getUnifiedOrders,
  SOURCE_META,
  NORM_STATUS_META,
  ALL_SOURCES,
  ALL_NORM_STATUSES,
  type UnifiedSource,
  type NormStatus,
} from './unified-orders';

// ---------------------------------------------------------------------------
// Tab definitions
// ---------------------------------------------------------------------------

type TabId = 'all' | 'd1' | 'k2k_orders' | 'k2k_prebooks';

const TAB_DEFS: { id: TabId; label: string; sub: string }[] = [
  { id: 'all',          label: 'All orders',       sub: 'unified across all sources' },
  { id: 'd1',           label: 'Web orders (D1)',  sub: 'supabase-backup orders' },
  { id: 'k2k_orders',   label: 'Historical K2K',   sub: 'k2k_orders (Rose, read-only)' },
  { id: 'k2k_prebooks', label: 'Prebooks K2K',     sub: 'k2k_prebooks (Rose, read-only)' },
];

function isTabId(v: string | undefined): v is TabId {
  return v === 'all' || v === 'd1' || v === 'k2k_orders' || v === 'k2k_prebooks';
}

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

type OrderStatus =
  | 'cart'
  | 'pending_payment'
  | 'card_saved'
  | 'preauth_held'
  | 'paid'
  | 'fulfilled'
  | 'cancelled'
  | 'refunded'
  | 'failed';

type PaymentMode = 'mode_a' | 'mode_b' | 'mode_c';

interface ShippingSnap {
  recipient_name?: string;
  business_name?: string | null;
  city?: string;
  state?: string;
}

interface OrderRow {
  id: number;
  user_id: string;
  order_number: string;
  status: OrderStatus;
  payment_mode: PaymentMode;
  lead_time_days: number;
  requested_delivery_date: string;
  currency: string;
  grand_total: number | string;
  shipping_address_snapshot: ShippingSnap | null;
  created_at: string;
}

interface ClientProfileSlim {
  user_id: string;
  business_name: string | null;
}

// Rose's k2k_orders columns (subset we render)
interface K2kOrderRow {
  id: number;
  k2k_order_number: string | null;
  buyer_name: string | null;
  buyer_company: string | null;
  buyer_email: string | null;
  order_status: string | null;
  order_date: string | null;
  delivery_date: string | null;
  total_amount: number | string | null;
  currency: string | null;
  product_count: number | null;
  stem_count: number | null;
  scraped_at: string | null;
  api_synced_at: string | null;
}

// Rose's k2k_prebooks columns (subset we render)
interface K2kPrebookRow {
  id: number;
  komet_prebook_id: number | null;
  prebook_number: number | null;
  customer_name: string | null;
  customer_code: string | null;
  ship_city: string | null;
  ship_state: string | null;
  total_boxes: number | null;
  total_price: number | string | null;
  total_with_surcharges: number | string | null;
  truck_date: string | null;
  dispatch_date: string | null;
  prebook_status: string | null;
  tracking_number: string | null;
  scraped_at: string | null;
  synced_at: string | null;
}

interface PageProps {
  searchParams: Promise<{
    tab?: string;          // all | d1 | k2k_orders | k2k_prebooks (default all)
    status?: string;       // D1: comma-separated OrderStatus list
    mode?: string;         // D1: comma-separated PaymentMode list
    source?: string;       // unified: comma-separated UnifiedSource list
    nstatus?: string;      // unified: comma-separated NormStatus list
    from?: string;         // YYYY-MM-DD (created_at/order_date/truck_date >=)
    to?: string;           // YYYY-MM-DD (inclusive)
    q?: string;            // substring search
  }>;
}

// ---------------------------------------------------------------------------
// Constants / helpers
// ---------------------------------------------------------------------------

const PAGE_SIZE = 200;
const K2K_FRESHNESS_SLA_MS = 60 * 60 * 1000;  // 1h per Rose audit

const ALL_STATUSES: OrderStatus[] = [
  'cart',
  'pending_payment',
  'card_saved',
  'preauth_held',
  'paid',
  'fulfilled',
  'cancelled',
  'refunded',
  'failed',
];

const ALL_MODES: PaymentMode[] = ['mode_a', 'mode_b', 'mode_c'];

const STATUS_META: Record<
  OrderStatus,
  { label: string; cls: string; group: 'open' | 'awaiting' | 'fulfilled' | 'refunded' | 'other' }
> = {
  cart:             { label: 'Cart',            cls: 'bg-slate-100 text-slate-600 border-slate-200',   group: 'other' },
  pending_payment:  { label: 'Pending payment', cls: 'bg-amber-50 text-amber-800 border-amber-200',    group: 'awaiting' },
  card_saved:       { label: 'Card saved',      cls: 'bg-blue-50 text-blue-800 border-blue-200',       group: 'awaiting' },
  preauth_held:     { label: 'Preauth held',    cls: 'bg-blue-50 text-blue-800 border-blue-200',       group: 'awaiting' },
  paid:             { label: 'Paid',            cls: 'bg-emerald-50 text-emerald-800 border-emerald-200', group: 'open' },
  fulfilled:        { label: 'Fulfilled',       cls: 'bg-emerald-50 text-emerald-900 border-emerald-300', group: 'fulfilled' },
  failed:           { label: 'Failed',          cls: 'bg-red-50 text-red-800 border-red-200',          group: 'other' },
  cancelled:        { label: 'Cancelled',       cls: 'bg-slate-100 text-slate-500 border-slate-200',   group: 'other' },
  refunded:         { label: 'Refunded',        cls: 'bg-slate-100 text-slate-500 border-slate-200',   group: 'refunded' },
};

const MODE_META: Record<PaymentMode, { label: string; cls: string; hint: string }> = {
  mode_a: { label: 'Mode A', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', hint: '>=10 days: preauth + charge later' },
  mode_b: { label: 'Mode B', cls: 'bg-blue-50 text-blue-700 border-blue-200',           hint: '3-9 days: $1 verify + charge later' },
  mode_c: { label: 'Mode C', cls: 'bg-amber-50 text-amber-800 border-amber-200',        hint: '<3 days: charged now' },
};

// K2K status labels we have observed: Pending, Confirmed, Void, None.
const K2K_ORDER_STATUS_META: Record<string, string> = {
  pending:   'bg-amber-50 text-amber-800 border-amber-200',
  confirmed: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  void:      'bg-slate-100 text-slate-500 border-slate-200',
  cancelled: 'bg-slate-100 text-slate-500 border-slate-200',
};

function k2kStatusCls(s: string | null): string {
  const k = (s ?? '').toLowerCase();
  return K2K_ORDER_STATUS_META[k] ?? 'bg-slate-100 text-slate-600 border-slate-200';
}

function fmtCurrency(value: number | string | null | undefined, currency = 'USD'): string {
  if (value === null || value === undefined) return '--';
  const n = typeof value === 'string' ? parseFloat(value) : value;
  if (!Number.isFinite(n)) return '--';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n);
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '--';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--';
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  }).format(d);
}

function fmtRelativeAge(iso: string | null | undefined): { label: string; ageMs: number | null } {
  if (!iso) return { label: 'unknown', ageMs: null };
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return { label: 'unknown', ageMs: null };
  const ageMs = Date.now() - t;
  if (ageMs < 0) return { label: 'just now', ageMs: 0 };
  const min = Math.floor(ageMs / 60000);
  if (min < 1) return { label: 'just now', ageMs };
  if (min < 60) return { label: `${min} min ago`, ageMs };
  const hr = Math.floor(min / 60);
  if (hr < 24) return { label: `${hr}h ago`, ageMs };
  const days = Math.floor(hr / 24);
  return { label: `${days}d ago`, ageMs };
}

function parseList<T extends string>(raw: string | undefined, allowed: readonly T[]): T[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((v) => v.trim())
    .filter((v): v is T => (allowed as readonly string[]).includes(v));
}

function isValidDate(s: string | undefined): s is string {
  if (!s) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s);
  return !Number.isNaN(d.getTime());
}

function buildHref(
  base: '/admin/orders',
  params: {
    tab?: TabId;
    status?: OrderStatus[];
    mode?: PaymentMode[];
    from?: string;
    to?: string;
    q?: string;
  },
): string {
  const sp = new URLSearchParams();
  // Default tab is now 'all', so 'd1' MUST be emitted explicitly.
  if (params.tab && params.tab !== 'all') sp.set('tab', params.tab);
  if (params.status && params.status.length) sp.set('status', params.status.join(','));
  if (params.mode && params.mode.length) sp.set('mode', params.mode.join(','));
  if (params.from) sp.set('from', params.from);
  if (params.to) sp.set('to', params.to);
  if (params.q) sp.set('q', params.q);
  const s = sp.toString();
  return s ? `${base}?${s}` : base;
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

const ADMIN_EMAILS = ['facu@floropolis.com', 'jjpj@crescoinversiones.com'];

async function gateAdmin(): Promise<{ userId: string; email: string }> {
  const userClient = await createUserClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user || !user.email) redirect('/');

  if (ADMIN_EMAILS.includes(user.email.toLowerCase())) {
    return { userId: user.id, email: user.email };
  }

  const svc = getBackupServiceClient();
  const { data: profile } = await svc
    .from('client_profiles')
    .select('status')
    .eq('user_id', user.id)
    .maybeSingle();
  if (profile?.status === 'admin') {
    return { userId: user.id, email: user.email };
  }
  redirect('/');
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export const metadata = {
  title: 'Orders | Floropolis Admin',
  robots: { index: false, follow: false },
};

export default async function AdminOrdersPage({ searchParams }: PageProps) {
  await gateAdmin();

  const sp = await searchParams;
  const tab: TabId = isTabId(sp.tab) ? sp.tab : 'all';
  const fromDate = isValidDate(sp.from) ? sp.from : undefined;
  const toDate = isValidDate(sp.to) ? sp.to : undefined;
  const q = (sp.q ?? '').trim();

  // Per-tab branches keep the page server-rendered with no client JS while
  // each query stays simple. Shared chrome (filter form, tabs, header) wraps
  // the per-tab body.
  if (tab === 'all') {
    return renderUnifiedTab({ sp, fromDate, toDate, q });
  }
  if (tab === 'k2k_orders') {
    return renderK2kOrdersTab({ fromDate, toDate, q });
  }
  if (tab === 'k2k_prebooks') {
    return renderK2kPrebooksTab({ fromDate, toDate, q });
  }
  return renderD1Tab({ sp, fromDate, toDate, q });
}

// ---------------------------------------------------------------------------
// Tab: All orders (unified) -- merged across both planes, read-only visibility
// ---------------------------------------------------------------------------

function buildUnifiedHref(params: {
  source?: UnifiedSource[];
  nstatus?: NormStatus[];
  from?: string;
  to?: string;
  q?: string;
}): string {
  const sp = new URLSearchParams();
  if (params.source && params.source.length) sp.set('source', params.source.join(','));
  if (params.nstatus && params.nstatus.length) sp.set('nstatus', params.nstatus.join(','));
  if (params.from) sp.set('from', params.from);
  if (params.to) sp.set('to', params.to);
  if (params.q) sp.set('q', params.q);
  const s = sp.toString();
  return s ? `/admin/orders?${s}` : '/admin/orders';
}

async function renderUnifiedTab({
  sp,
  fromDate,
  toDate,
  q,
}: {
  sp: { source?: string; nstatus?: string };
  fromDate?: string;
  toDate?: string;
  q: string;
}) {
  const selectedSources = parseList<UnifiedSource>(sp.source, ALL_SOURCES);
  const selectedNstatus = parseList<NormStatus>(sp.nstatus, ALL_NORM_STATUSES);

  const { rows: allRows, stats, unreadable } = await getUnifiedOrders();

  // Headline counts exclude test rows everywhere.
  let rows = allRows.filter((r) => !r.isTest);

  if (selectedSources.length > 0) {
    rows = rows.filter((r) => selectedSources.includes(r.source));
  }
  if (selectedNstatus.length > 0) {
    rows = rows.filter((r) => selectedNstatus.includes(r.status));
  }
  if (fromDate) {
    rows = rows.filter((r) => r.date != null && r.date.slice(0, 10) >= fromDate);
  }
  if (toDate) {
    rows = rows.filter((r) => r.date != null && r.date.slice(0, 10) <= toDate);
  }
  if (q) {
    const needle = q.toLowerCase();
    rows = rows.filter((r) =>
      (r.clientName ?? '').toLowerCase().includes(needle) ||
      (r.businessName ?? '').toLowerCase().includes(needle) ||
      (r.email ?? '').toLowerCase().includes(needle) ||
      (r.refNumber ?? '').toLowerCase().includes(needle) ||
      r.refId.toLowerCase().includes(needle),
    );
  }

  const totalReal = stats.reduce((acc, s) => acc + s.count, 0);
  const totalAmount = stats.reduce((acc, s) => acc + s.amount, 0);
  const totalTest = stats.reduce((acc, s) => acc + s.testCount, 0);
  const spineCount = stats.filter((s) => s.plane === 'spine').reduce((a, s) => a + s.count, 0);
  const legacyCount = stats.filter((s) => s.plane === 'legacy').reduce((a, s) => a + s.count, 0);

  function sourceChipHref(src: UnifiedSource): string {
    return buildUnifiedHref({
      source: toggle(selectedSources, src),
      nstatus: selectedNstatus,
      from: fromDate,
      to: toDate,
      q,
    });
  }
  function nstatusChipHref(ns: NormStatus): string {
    return buildUnifiedHref({
      source: selectedSources,
      nstatus: toggle(selectedNstatus, ns),
      from: fromDate,
      to: toDate,
      q,
    });
  }

  return (
    <PageShell
      tab="all"
      intro="Every order across every source, merged into one list. Spine = the new orders table; legacy = read-only channels Rose maintains. Test rows excluded from headline counts. Visibility only -- no actions here."
    >
      <FilterForm
        tab="all"
        q={q}
        fromDate={fromDate}
        toDate={toDate}
        resultCount={rows.length}
        clearHref="/admin/orders"
        hiddenSource={selectedSources.length ? selectedSources.join(',') : undefined}
        hiddenNstatus={selectedNstatus.length ? selectedNstatus.join(',') : undefined}
        searchPlaceholder="Client, business, email, or order #"
        dateLabel={{ from: 'Date from', to: 'Date to' }}
      />

      {/* Headline tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <CounterTile
          label="All orders"
          value={totalReal}
          sub={`${totalTest} test row${totalTest === 1 ? '' : 's'} excluded`}
          cls="bg-emerald-50 border-emerald-200 text-emerald-800"
        />
        <CounterTile
          label="Total amount"
          value={totalAmount}
          sub="sum across sources (USD)"
          cls="bg-slate-50 border-slate-200 text-slate-700"
          asCurrency
        />
        <CounterTile
          label="Spine"
          value={spineCount}
          sub="new orders table (web/sample/deal)"
          cls="bg-emerald-50 border-emerald-200 text-emerald-800"
        />
        <CounterTile
          label="Legacy (read-channel)"
          value={legacyCount}
          sub="K2K + quote + sample box (read-only)"
          cls="bg-slate-50 border-slate-200 text-slate-700"
        />
      </div>

      {/* Per-source summary band */}
      <div className="mb-6">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
          By source (real counts + $)
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          {stats.map((s) => {
            const meta = SOURCE_META[s.source];
            return (
              <div
                key={s.source}
                className={`rounded-xl border p-3 ${s.error ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200'}`}
              >
                <div className="flex items-center gap-1.5">
                  <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold border ${meta.cls}`}>
                    {meta.label}
                  </span>
                </div>
                <div className="text-lg font-bold text-slate-900 mt-1">
                  {s.error ? '--' : s.count}
                </div>
                <div className="text-[11px] text-slate-500">
                  {s.error
                    ? <span className="text-red-600 font-medium">unreadable</span>
                    : <>{fmtCurrency(s.amount, 'USD')}{s.testCount > 0 ? ` -- ${s.testCount} test` : ''}</>}
                </div>
                <div className="text-[10px] uppercase tracking-wide text-slate-400 mt-0.5">
                  {s.plane === 'spine' ? 'spine' : 'legacy'}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Honest degradation banner */}
      {unreadable.length > 0 && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          <span className="font-semibold">Some sources could not be read:</span>{' '}
          {Array.from(new Set(unreadable.map((u) => `${SOURCE_META[u.source].label} (${u.reason})`))).join('; ')}.
          They contribute zero rows above; counts shown are honest for the rest.
        </div>
      )}

      {/* Source + status chip rows */}
      <div className="flex flex-col gap-3 mb-6">
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Source</p>
          <div className="flex flex-wrap gap-2">
            {ALL_SOURCES.map((src) => {
              const active = selectedSources.includes(src);
              const meta = SOURCE_META[src];
              return (
                <Link
                  key={src}
                  href={sourceChipHref(src)}
                  className={
                    active
                      ? `px-3 py-1 text-xs font-semibold rounded-full border ${meta.cls} ring-2 ring-emerald-500`
                      : `px-3 py-1 text-xs font-medium rounded-full border ${meta.cls} opacity-70 hover:opacity-100`
                  }
                >
                  {meta.label}
                  <span className="ml-1 opacity-60">{meta.plane === 'spine' ? 'spine' : 'legacy'}</span>
                </Link>
              );
            })}
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Status (normalized)</p>
          <div className="flex flex-wrap gap-2">
            {ALL_NORM_STATUSES.map((ns) => {
              const active = selectedNstatus.includes(ns);
              const meta = NORM_STATUS_META[ns];
              return (
                <Link
                  key={ns}
                  href={nstatusChipHref(ns)}
                  className={
                    active
                      ? `px-3 py-1 text-xs font-semibold rounded-full border ${meta.cls} ring-2 ring-emerald-500`
                      : `px-3 py-1 text-xs font-medium rounded-full border ${meta.cls} opacity-70 hover:opacity-100`
                  }
                >
                  {meta.label}
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyOrSkeleton
          hasFilters={
            selectedSources.length > 0 ||
            selectedNstatus.length > 0 ||
            Boolean(fromDate) ||
            Boolean(toDate) ||
            Boolean(q)
          }
          clearHref="/admin/orders"
          emptyTitle="No orders to show."
          emptyHint="Orders from every source will appear here as they land."
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Source</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Order</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Client</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Amount</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Plane</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => {
                const sMeta = SOURCE_META[r.source];
                const nMeta = NORM_STATUS_META[r.status];
                return (
                  <tr key={r.key} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border ${sMeta.cls}`}>
                        {sMeta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-mono text-xs text-slate-900 font-semibold">
                        {r.refNumber ?? <span className="text-slate-400 font-sans italic">--</span>}
                      </div>
                      <div className="text-[11px] text-slate-400">id #{r.refId}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-slate-900 font-medium">
                        {r.clientName ?? r.email ?? <span className="text-slate-400 italic">unknown</span>}
                      </div>
                      <div className="text-xs text-slate-500">
                        {r.businessName ?? <span className="text-slate-400">no business</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-semibold text-slate-900">
                        {r.amount == null ? <span className="text-slate-400 font-normal">--</span> : fmtCurrency(r.amount, 'USD')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${nMeta.cls}`}>
                        {nMeta.label}
                      </span>
                      {r.rawStatus && r.rawStatus.toLowerCase() !== nMeta.label.toLowerCase() && (
                        <div className="text-[10px] text-slate-400 mt-0.5">{r.rawStatus}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          r.plane === 'spine'
                            ? 'inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold border bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold border bg-slate-100 text-slate-600 border-slate-200'
                        }
                      >
                        {r.plane === 'spine' ? 'Spine' : 'Legacy'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                      {fmtDate(r.date)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-slate-400 mt-6">
        Unified view merges supabase-backup public.orders (spine: web/sample/deal)
        with production read-channel tables (k2k_orders, k2k_prebooks,
        quote_requests, sample_box_status -- all READ-ONLY, Rose-owned). No
        cross-DB SQL: each plane is queried with its own client and merged here.
        Test rows are excluded from headline counts. This surface is
        visibility-only -- no writes, no decisions.
      </p>
    </PageShell>
  );
}

// ---------------------------------------------------------------------------
// Tab: D1 (web orders) -- existing behavior, plus tab nav at top
// ---------------------------------------------------------------------------

async function renderD1Tab({
  sp,
  fromDate,
  toDate,
  q,
}: {
  sp: { status?: string; mode?: string };
  fromDate?: string;
  toDate?: string;
  q: string;
}) {
  const selectedStatuses = parseList<OrderStatus>(sp.status, ALL_STATUSES);
  const selectedModes = parseList<PaymentMode>(sp.mode, ALL_MODES);

  const svc = getBackupServiceClient();

  let query = svc
    .from('orders')
    .select(
      'id, user_id, order_number, status, payment_mode, lead_time_days, requested_delivery_date, currency, grand_total, shipping_address_snapshot, created_at',
    )
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE);

  if (selectedStatuses.length > 0) {
    query = query.in('status', selectedStatuses);
  }
  if (selectedModes.length > 0) {
    query = query.in('payment_mode', selectedModes);
  }
  if (fromDate) {
    query = query.gte('created_at', `${fromDate}T00:00:00.000Z`);
  }
  if (toDate) {
    query = query.lte('created_at', `${toDate}T23:59:59.999Z`);
  }
  if (q && /^[A-Za-z0-9-]+$/.test(q)) {
    query = query.ilike('order_number', `%${q}%`);
  }

  const { data: ordersRaw, error: ordersErr } = await query;
  if (ordersErr) {
    console.error('[admin/orders] D1 orders fetch failed:', ordersErr);
  }
  let orders = (ordersRaw ?? []) as OrderRow[];

  const counters = {
    open: orders.filter((o) => STATUS_META[o.status]?.group === 'open' || STATUS_META[o.status]?.group === 'awaiting').length,
    awaiting: orders.filter((o) => STATUS_META[o.status]?.group === 'awaiting').length,
    fulfilled: orders.filter((o) => STATUS_META[o.status]?.group === 'fulfilled').length,
    refunded: orders.filter((o) => STATUS_META[o.status]?.group === 'refunded').length,
  };

  // Resolve buyer emails (cross-project RPC via user-context client).
  const userIds = Array.from(new Set(orders.map((o) => o.user_id)));
  const emailMap: Record<string, string> = {};
  if (userIds.length > 0) {
    const userClient = await createUserClient();
    const { data: emailRows } = await userClient.rpc('get_client_emails', {
      user_ids: userIds,
    });
    (emailRows ?? []).forEach((r: { user_id: string; email: string }) => {
      emailMap[r.user_id] = r.email;
    });
  }

  const businessMap: Record<string, string | null> = {};
  if (userIds.length > 0) {
    const { data: profileRows } = await svc
      .from('client_profiles')
      .select('user_id, business_name')
      .in('user_id', userIds);
    ((profileRows ?? []) as ClientProfileSlim[]).forEach((p) => {
      businessMap[p.user_id] = p.business_name ?? null;
    });
  }

  if (q) {
    const needle = q.toLowerCase();
    orders = orders.filter((o) => {
      const email = (emailMap[o.user_id] ?? '').toLowerCase();
      const business = (businessMap[o.user_id] ?? '').toLowerCase();
      const snapBusiness = (o.shipping_address_snapshot?.business_name ?? '').toLowerCase();
      const snapRecipient = (o.shipping_address_snapshot?.recipient_name ?? '').toLowerCase();
      return (
        email.includes(needle) ||
        business.includes(needle) ||
        snapBusiness.includes(needle) ||
        snapRecipient.includes(needle) ||
        o.order_number.toLowerCase().includes(needle)
      );
    });
  }

  function statusChipHref(s: OrderStatus): string {
    return buildHref('/admin/orders', {
      tab: 'd1',
      status: toggle(selectedStatuses, s),
      mode: selectedModes,
      from: fromDate,
      to: toDate,
      q,
    });
  }

  function modeChipHref(m: PaymentMode): string {
    return buildHref('/admin/orders', {
      tab: 'd1',
      status: selectedStatuses,
      mode: toggle(selectedModes, m),
      from: fromDate,
      to: toDate,
      q,
    });
  }

  const clearAllHref = '/admin/orders?tab=d1';

  return (
    <PageShell tab="d1" intro="All web orders (D1 Stripe/checkout), newest first.">
      {/* D1-only filter form (preserves D1 chips via hidden fields). */}
      <FilterForm
        tab="d1"
        q={q}
        fromDate={fromDate}
        toDate={toDate}
        resultCount={orders.length}
        clearHref={clearAllHref}
        hiddenStatus={selectedStatuses.length ? selectedStatuses.join(',') : undefined}
        hiddenMode={selectedModes.length ? selectedModes.join(',') : undefined}
        searchPlaceholder="Email, business name, or order number"
      />

      {/* Counter tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <CounterTile
          label="Open"
          value={counters.open}
          sub="paid + awaiting payment"
          cls="bg-emerald-50 border-emerald-200 text-emerald-800"
        />
        <CounterTile
          label="Awaiting payment"
          value={counters.awaiting}
          sub="card saved / preauth / pending"
          cls="bg-amber-50 border-amber-200 text-amber-800"
        />
        <CounterTile
          label="Fulfilled"
          value={counters.fulfilled}
          sub="delivered to florist"
          cls="bg-emerald-50 border-emerald-300 text-emerald-900"
        />
        <CounterTile
          label="Refunded"
          value={counters.refunded}
          sub="money returned to customer"
          cls="bg-slate-50 border-slate-200 text-slate-700"
        />
      </div>

      {/* Status + payment mode chip rows */}
      <div className="flex flex-col gap-3 mb-6">
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Status</p>
          <div className="flex flex-wrap gap-2">
            {ALL_STATUSES.map((s) => {
              const active = selectedStatuses.includes(s);
              const meta = STATUS_META[s];
              return (
                <Link
                  key={s}
                  href={statusChipHref(s)}
                  className={
                    active
                      ? `px-3 py-1 text-xs font-semibold rounded-full border ${meta.cls} ring-2 ring-emerald-500`
                      : `px-3 py-1 text-xs font-medium rounded-full border ${meta.cls} opacity-70 hover:opacity-100`
                  }
                >
                  {meta.label}
                </Link>
              );
            })}
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Payment mode</p>
          <div className="flex flex-wrap gap-2">
            {ALL_MODES.map((m) => {
              const active = selectedModes.includes(m);
              const meta = MODE_META[m];
              return (
                <Link
                  key={m}
                  href={modeChipHref(m)}
                  className={
                    active
                      ? `px-3 py-1 text-xs font-semibold rounded-full border ${meta.cls} ring-2 ring-emerald-500`
                      : `px-3 py-1 text-xs font-medium rounded-full border ${meta.cls} opacity-70 hover:opacity-100`
                  }
                  title={meta.hint}
                >
                  {meta.label}
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {orders.length === 0 ? (
        <EmptyOrSkeleton
          hasFilters={
            selectedStatuses.length > 0 ||
            selectedModes.length > 0 ||
            Boolean(fromDate) ||
            Boolean(toDate) ||
            Boolean(q)
          }
          clearHref="/admin/orders?tab=d1"
          emptyTitle="No orders yet."
          emptyHint="Once a customer places an order it will show up here."
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Order</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Customer</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Total</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Mode</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Lead</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Created</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orders.map((o) => {
                const sMeta = STATUS_META[o.status] ?? STATUS_META.pending_payment;
                const mMeta = MODE_META[o.payment_mode];
                const email = emailMap[o.user_id] ?? null;
                const business =
                  businessMap[o.user_id] ??
                  o.shipping_address_snapshot?.business_name ??
                  o.shipping_address_snapshot?.recipient_name ??
                  null;
                return (
                  <tr key={o.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-mono text-xs text-slate-900 font-semibold">
                        {o.order_number}
                      </div>
                      <div className="text-[11px] text-slate-400">id #{o.id}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-slate-900 font-medium">
                        {email ?? <span className="text-slate-400 italic">unknown email</span>}
                      </div>
                      <div className="text-xs text-slate-500">
                        {business ?? <span className="text-slate-400">no business name</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-semibold text-slate-900">
                        {fmtCurrency(o.grand_total, o.currency)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${sMeta.cls}`}
                      >
                        {sMeta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {mMeta ? (
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border ${mMeta.cls}`}
                          title={mMeta.hint}
                        >
                          {mMeta.label}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">--</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">
                      {o.lead_time_days}d
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                      {fmtDate(o.created_at)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/orders/${o.id}`}
                        className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 border border-emerald-200 hover:border-emerald-400 px-3 py-1.5 rounded-lg transition-colors inline-block"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-slate-400 mt-6">
        Data source: supabase-backup orders + client_profiles + get_client_emails RPC.
        Customer email is fetched via security-definer RPC because auth.users lives
        in a different project. Filters compose; status + mode chips toggle, dates
        and search submit through the Apply button.
      </p>
    </PageShell>
  );
}

// ---------------------------------------------------------------------------
// Tab: Historical K2K (k2k_orders) -- read-only from floropolis-bi
// ---------------------------------------------------------------------------

async function renderK2kOrdersTab({
  fromDate,
  toDate,
  q,
}: {
  fromDate?: string;
  toDate?: string;
  q: string;
}) {
  const bi = await createBiServerClient();

  let query = bi
    .from('k2k_orders')
    .select(
      'id, k2k_order_number, buyer_name, buyer_company, buyer_email, order_status, order_date, delivery_date, total_amount, currency, product_count, stem_count, scraped_at, api_synced_at',
    )
    .order('order_date', { ascending: false, nullsFirst: false })
    .limit(PAGE_SIZE);

  if (fromDate) query = query.gte('order_date', fromDate);
  if (toDate)   query = query.lte('order_date', toDate);

  const { data: rowsRaw, error: rowsErr } = await query;
  if (rowsErr) {
    console.error('[admin/orders] k2k_orders fetch failed:', rowsErr);
  }
  let rows = (rowsRaw ?? []) as K2kOrderRow[];

  // Freshness uses max(api_synced_at) -- scraped_at is mostly NULL on this table
  // per current data (api_synced_at is the K2K API ingest timestamp).
  const lastSynced = rows.reduce<string | null>((acc, r) => {
    const candidate = r.api_synced_at ?? r.scraped_at;
    if (!candidate) return acc;
    if (!acc) return candidate;
    return new Date(candidate).getTime() > new Date(acc).getTime() ? candidate : acc;
  }, null);
  const age = fmtRelativeAge(lastSynced);
  const stale = age.ageMs !== null && age.ageMs > K2K_FRESHNESS_SLA_MS;

  if (q) {
    const needle = q.toLowerCase();
    rows = rows.filter((r) =>
      (r.buyer_name ?? '').toLowerCase().includes(needle) ||
      (r.buyer_company ?? '').toLowerCase().includes(needle) ||
      (r.buyer_email ?? '').toLowerCase().includes(needle) ||
      (r.k2k_order_number ?? '').toLowerCase().includes(needle),
    );
  }

  const totalSum = rows.reduce((acc, r) => {
    const n = typeof r.total_amount === 'string' ? parseFloat(r.total_amount) : r.total_amount;
    return acc + (Number.isFinite(n as number) ? (n as number) : 0);
  }, 0);

  return (
    <PageShell
      tab="k2k_orders"
      intro="Historical K2K orders (Rose's scraped + API ingest). Read-only per Rose audit; freshness SLA 1h."
    >
      <FilterForm
        tab="k2k_orders"
        q={q}
        fromDate={fromDate}
        toDate={toDate}
        resultCount={rows.length}
        clearHref="/admin/orders?tab=k2k_orders"
        searchPlaceholder="Buyer name, company, email, or order number"
        dateLabel={{ from: 'Order date from', to: 'Order date to' }}
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
        <CounterTile
          label="K2K orders"
          value={rows.length}
          sub={`cap ${PAGE_SIZE}, newest first`}
          cls="bg-emerald-50 border-emerald-200 text-emerald-800"
        />
        <CounterTile
          label="Total revenue"
          value={totalSum}
          sub="sum of total_amount (USD)"
          cls="bg-slate-50 border-slate-200 text-slate-700"
          asCurrency
        />
        <FreshnessTile lastSynced={lastSynced} ageLabel={age.label} stale={stale} />
      </div>

      {rows.length === 0 ? (
        <EmptyOrSkeleton
          hasFilters={Boolean(fromDate) || Boolean(toDate) || Boolean(q)}
          clearHref="/admin/orders?tab=k2k_orders"
          emptyTitle="No K2K orders match."
          emptyHint="Widen the date range or clear the search."
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Order #</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Buyer</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Total</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Products</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Stems</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Order date</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Delivery</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-mono text-xs text-slate-900 font-semibold">
                      {r.k2k_order_number ?? '--'}
                    </div>
                    <div className="text-[11px] text-slate-400">id #{r.id}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm text-slate-900 font-medium">
                      {r.buyer_name ?? <span className="text-slate-400 italic">unknown</span>}
                    </div>
                    <div className="text-xs text-slate-500">
                      {r.buyer_company ?? <span className="text-slate-400">no buyer id</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-semibold text-slate-900">
                      {fmtCurrency(r.total_amount, r.currency ?? 'USD')}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${k2kStatusCls(r.order_status)}`}
                    >
                      {r.order_status ?? '--'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-slate-700">
                    {r.product_count ?? '--'}
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-slate-700">
                    {r.stem_count ?? '--'}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">
                    {fmtDate(r.order_date)}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                    {fmtDate(r.delivery_date)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-slate-400 mt-6">
        Data source: floropolis-bi public.k2k_orders (Rose pipeline, JOB_READ_OK
        per rose_table_audit_v1.md Section 2). READ-ONLY: this UI never writes,
        updates, or deletes K2K rows. Search is client-side over the {PAGE_SIZE}
        most-recent rows; date filter is pushed down to SQL on order_date.
      </p>
    </PageShell>
  );
}

// ---------------------------------------------------------------------------
// Tab: Prebooks K2K (k2k_prebooks) -- read-only from floropolis-bi
// ---------------------------------------------------------------------------

async function renderK2kPrebooksTab({
  fromDate,
  toDate,
  q,
}: {
  fromDate?: string;
  toDate?: string;
  q: string;
}) {
  const bi = await createBiServerClient();

  let query = bi
    .from('k2k_prebooks')
    .select(
      'id, komet_prebook_id, prebook_number, customer_name, customer_code, ship_city, ship_state, total_boxes, total_price, total_with_surcharges, truck_date, dispatch_date, prebook_status, tracking_number, scraped_at, synced_at',
    )
    .order('truck_date', { ascending: false, nullsFirst: false })
    .limit(PAGE_SIZE);

  if (fromDate) query = query.gte('truck_date', fromDate);
  if (toDate)   query = query.lte('truck_date', toDate);

  const { data: rowsRaw, error: rowsErr } = await query;
  if (rowsErr) {
    console.error('[admin/orders] k2k_prebooks fetch failed:', rowsErr);
  }
  let rows = (rowsRaw ?? []) as K2kPrebookRow[];

  // Freshness uses max(synced_at) -- scraped_at is partially NULL.
  const lastSynced = rows.reduce<string | null>((acc, r) => {
    const candidate = r.synced_at ?? r.scraped_at;
    if (!candidate) return acc;
    if (!acc) return candidate;
    return new Date(candidate).getTime() > new Date(acc).getTime() ? candidate : acc;
  }, null);
  const age = fmtRelativeAge(lastSynced);
  const stale = age.ageMs !== null && age.ageMs > K2K_FRESHNESS_SLA_MS;

  if (q) {
    const needle = q.toLowerCase();
    rows = rows.filter((r) =>
      (r.customer_name ?? '').toLowerCase().includes(needle) ||
      (r.customer_code ?? '').toLowerCase().includes(needle) ||
      String(r.prebook_number ?? '').toLowerCase().includes(needle) ||
      (r.tracking_number ?? '').toLowerCase().includes(needle),
    );
  }

  const totalSum = rows.reduce((acc, r) => {
    const raw = r.total_with_surcharges ?? r.total_price;
    const n = typeof raw === 'string' ? parseFloat(raw) : raw;
    return acc + (Number.isFinite(n as number) ? (n as number) : 0);
  }, 0);

  const boxesSum = rows.reduce((acc, r) => acc + (r.total_boxes ?? 0), 0);

  return (
    <PageShell
      tab="k2k_prebooks"
      intro="K2K prebooks (revenue source of truth, per Rose). Read-only; freshness SLA 1h."
    >
      <FilterForm
        tab="k2k_prebooks"
        q={q}
        fromDate={fromDate}
        toDate={toDate}
        resultCount={rows.length}
        clearHref="/admin/orders?tab=k2k_prebooks"
        searchPlaceholder="Customer, customer code, prebook #, or tracking"
        dateLabel={{ from: 'Truck date from', to: 'Truck date to' }}
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <CounterTile
          label="Prebooks"
          value={rows.length}
          sub={`cap ${PAGE_SIZE}, newest first`}
          cls="bg-emerald-50 border-emerald-200 text-emerald-800"
        />
        <CounterTile
          label="Total revenue"
          value={totalSum}
          sub="sum of total_with_surcharges"
          cls="bg-slate-50 border-slate-200 text-slate-700"
          asCurrency
        />
        <CounterTile
          label="Total boxes"
          value={boxesSum}
          sub="sum of total_boxes"
          cls="bg-slate-50 border-slate-200 text-slate-700"
        />
        <FreshnessTile lastSynced={lastSynced} ageLabel={age.label} stale={stale} />
      </div>

      {rows.length === 0 ? (
        <EmptyOrSkeleton
          hasFilters={Boolean(fromDate) || Boolean(toDate) || Boolean(q)}
          clearHref="/admin/orders?tab=k2k_prebooks"
          emptyTitle="No prebooks match."
          emptyHint="Widen the truck-date range or clear the search."
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Prebook #</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Customer</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Ship to</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Boxes</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Total</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Truck date</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Tracking</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-mono text-xs text-slate-900 font-semibold">
                      {r.prebook_number ?? '--'}
                    </div>
                    <div className="text-[11px] text-slate-400">komet #{r.komet_prebook_id ?? '--'}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm text-slate-900 font-medium">
                      {r.customer_name ?? <span className="text-slate-400 italic">unknown</span>}
                    </div>
                    <div className="text-xs text-slate-500">
                      {r.customer_code ?? <span className="text-slate-400">no code</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">
                    {(r.ship_city || r.ship_state)
                      ? `${r.ship_city ?? ''}${r.ship_city && r.ship_state ? ', ' : ''}${r.ship_state ?? ''}`
                      : <span className="text-slate-400">--</span>}
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-slate-700">
                    {r.total_boxes ?? '--'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-semibold text-slate-900">
                      {fmtCurrency(r.total_with_surcharges ?? r.total_price, 'USD')}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border bg-slate-100 text-slate-600 border-slate-200">
                      {r.prebook_status ?? '--'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">
                    {fmtDate(r.truck_date)}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap font-mono">
                    {r.tracking_number ?? <span className="text-slate-400 font-sans">--</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-slate-400 mt-6">
        Data source: floropolis-bi public.k2k_prebooks (Rose pipeline, JOB_READ_OK
        per rose_table_audit_v1.md Section 2). READ-ONLY: this UI never writes
        to k2k_* tables. Search is client-side over the {PAGE_SIZE} most-recent
        rows; date filter is pushed down to SQL on truck_date.
      </p>
    </PageShell>
  );
}

// ---------------------------------------------------------------------------
// Shared chrome
// ---------------------------------------------------------------------------

function PageShell({
  tab,
  intro,
  children,
}: {
  tab: TabId;
  intro: string;
  children: React.ReactNode;
}) {
  const wiringEntry = getWiringForPage('/admin/orders');
  const wmAll = (id: string) =>
    wiringEntry?.sections.find((s) => s.id === id) ?? { level: 'PLAN' as const, note: 'unregistered' };
  return (
    <>
      <main className="max-w-7xl mx-auto px-4 py-10">
        <MockupLinkBanner mockupHref="/mockups/admin-orders" pageLabel="/admin/orders" />
        <div className="mb-6">
          <div className="text-xs uppercase tracking-wide text-emerald-700 font-semibold mb-1">
            Admin
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Orders</h1>
          <p className="text-slate-500 text-sm mt-1">{intro}</p>
        </div>

        {/* Tab navigation */}
        <div className="flex gap-1 border-b border-slate-200 mb-6 overflow-x-auto">
          {TAB_DEFS.map((t) => {
            const active = t.id === tab;
            const href = t.id === 'all' ? '/admin/orders' : `/admin/orders?tab=${t.id}`;
            return (
              <Link
                key={t.id}
                href={href}
                className={
                  active
                    ? 'px-4 py-2.5 text-sm font-semibold text-emerald-700 border-b-2 border-emerald-600 -mb-px whitespace-nowrap'
                    : 'px-4 py-2.5 text-sm font-medium text-slate-500 border-b-2 border-transparent hover:text-slate-800 hover:border-slate-300 whitespace-nowrap'
                }
              >
                {t.label}
                <span className="ml-2 text-[10px] uppercase tracking-wide opacity-60">
                  {t.sub}
                </span>
              </Link>
            );
          })}
        </div>

        <WiringSection level={wmAll('table').level} note={wmAll('table').note} id="table">
          {children}
        </WiringSection>
      </main>
    </>
  );
}

function FilterForm({
  tab,
  q,
  fromDate,
  toDate,
  resultCount,
  clearHref,
  hiddenStatus,
  hiddenMode,
  hiddenSource,
  hiddenNstatus,
  searchPlaceholder,
  dateLabel = { from: 'Created from', to: 'Created to' },
}: {
  tab: TabId;
  q: string;
  fromDate?: string;
  toDate?: string;
  resultCount: number;
  clearHref: string;
  hiddenStatus?: string;
  hiddenMode?: string;
  hiddenSource?: string;
  hiddenNstatus?: string;
  searchPlaceholder: string;
  dateLabel?: { from: string; to: string };
}) {
  return (
    <form
      method="GET"
      action="/admin/orders"
      className="bg-white border border-slate-200 rounded-2xl p-5 mb-6 space-y-4"
    >
      {/* Preserve tab through form submit ('all' default has no hidden field). */}
      {tab !== 'all' && <input type="hidden" name="tab" value={tab} />}
      {hiddenStatus && <input type="hidden" name="status" value={hiddenStatus} />}
      {hiddenMode && <input type="hidden" name="mode" value={hiddenMode} />}
      {hiddenSource && <input type="hidden" name="source" value={hiddenSource} />}
      {hiddenNstatus && <input type="hidden" name="nstatus" value={hiddenNstatus} />}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="md:col-span-2">
          <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wide">
            Customer search
          </label>
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder={searchPlaceholder}
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wide">
            {dateLabel.from}
          </label>
          <input
            type="date"
            name="from"
            defaultValue={fromDate ?? ''}
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wide">
            {dateLabel.to}
          </label>
          <input
            type="date"
            name="to"
            defaultValue={toDate ?? ''}
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 justify-between items-center pt-1">
        <div className="flex gap-2">
          <button
            type="submit"
            className="text-sm font-semibold px-4 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
          >
            Apply
          </button>
          <Link
            href={clearHref}
            className="text-sm px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:border-slate-400 transition-colors"
          >
            Clear all
          </Link>
        </div>
        <p className="text-xs text-slate-400">
          {resultCount} result{resultCount === 1 ? '' : 's'} (cap {PAGE_SIZE})
        </p>
      </div>
    </form>
  );
}

function CounterTile({
  label,
  value,
  sub,
  cls,
  asCurrency,
}: {
  label: string;
  value: number;
  sub: string;
  cls: string;
  asCurrency?: boolean;
}) {
  return (
    <div className={`rounded-2xl border p-4 ${cls}`}>
      <div className="text-2xl font-bold">
        {asCurrency ? fmtCurrency(value, 'USD') : value}
      </div>
      <div className="text-xs font-semibold mt-0.5">{label}</div>
      <div className="text-[11px] opacity-70 mt-0.5">{sub}</div>
    </div>
  );
}

function FreshnessTile({
  lastSynced,
  ageLabel,
  stale,
}: {
  lastSynced: string | null;
  ageLabel: string;
  stale: boolean;
}) {
  const cls = stale
    ? 'bg-amber-50 border-amber-300 text-amber-900'
    : 'bg-emerald-50 border-emerald-200 text-emerald-800';
  return (
    <div className={`rounded-2xl border p-4 ${cls}`}>
      <div className="text-2xl font-bold">{ageLabel}</div>
      <div className="text-xs font-semibold mt-0.5">Last synced</div>
      <div className="text-[11px] opacity-70 mt-0.5">
        {lastSynced ? new Date(lastSynced).toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : 'no sync timestamp on page'}
      </div>
      {stale && (
        <div className="text-[11px] font-semibold mt-1.5">
          Over Rose SLA (1h) -- ping Rose if persistent.
        </div>
      )}
    </div>
  );
}

function EmptyOrSkeleton({
  hasFilters,
  clearHref,
  emptyTitle,
  emptyHint,
}: {
  hasFilters: boolean;
  clearHref: string;
  emptyTitle: string;
  emptyHint: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/40 p-10 text-center">
      <p className="text-base font-semibold text-slate-700">
        {hasFilters ? 'No results match these filters.' : emptyTitle}
      </p>
      <p className="text-sm text-slate-500 mt-1">
        {hasFilters
          ? 'Try clearing one of the chips above or widening the date range.'
          : emptyHint}
      </p>
      <div className="mt-6 space-y-2 max-w-3xl mx-auto">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-10 rounded-lg bg-slate-100 animate-pulse"
            style={{ opacity: 0.4 + i * 0.15 }}
          />
        ))}
      </div>
      {hasFilters && (
        <Link
          href={clearHref}
          className="inline-block mt-6 text-sm font-semibold text-emerald-700 hover:text-emerald-900 border border-emerald-300 hover:border-emerald-500 px-4 py-2 rounded-xl transition-colors"
        >
          Clear filters
        </Link>
      )}
    </div>
  );
}
