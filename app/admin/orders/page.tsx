// Admin Orders list -- /admin/orders
// v1 | 2026-05-18 | Job_PM admin-port ORD [V8 SHADOW]
//
// Server-rendered table of ALL orders across all users (admin view). Filters
// by status (multi), date range (created_at), customer search (email +
// business_name), payment_mode. Counters at top: open / awaiting payment /
// fulfilled / refunded.
//
// Status enum follows the supabase-backup orders.status CHECK constraint:
//   cart | pending_payment | card_saved | preauth_held | paid |
//   fulfilled | cancelled | refunded | failed
// (The task description used a different vocabulary -- payment_authorized /
// payment_captured / etc. -- but the schema constraint is the source of truth
// and is what's actually stored on rows. The filter chip labels map the
// schema values to human-friendly wording.)
//
// Access:
//   - Middleware guards /admin and restricts to admin emails OR
//     client_profiles.status='admin'.
//   - Server-side belt-and-suspenders: re-check session + admin status.
//   - Non-admin -> redirect('/').
//
// Data: supabase-backup orders + client_profiles + get_client_emails RPC.
// Style: emerald-600 primary, Plus Jakarta Sans (inherited), ASCII-clean.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import Link from 'next/link';
import { redirect } from 'next/navigation';

import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';
import Navigation from '@/components/Navigation';
import TopBanner from '@/components/TopBanner';
import Footer from '@/components/Footer';

// ---------------------------------------------------------------------------
// Types
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

interface PageProps {
  searchParams: Promise<{
    status?: string;       // comma-separated OrderStatus list
    mode?: string;         // comma-separated PaymentMode list
    from?: string;         // YYYY-MM-DD (created_at >=)
    to?: string;           // YYYY-MM-DD (created_at <=, inclusive)
    q?: string;            // substring across email + business + order_number
  }>;
}

// ---------------------------------------------------------------------------
// Constants / helpers
// ---------------------------------------------------------------------------

const PAGE_SIZE = 200;

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

function fmtCurrency(value: number | string, currency = 'USD'): string {
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
    status?: OrderStatus[];
    mode?: PaymentMode[];
    from?: string;
    to?: string;
    q?: string;
  },
): string {
  const sp = new URLSearchParams();
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
  const selectedStatuses = parseList<OrderStatus>(sp.status, ALL_STATUSES);
  const selectedModes = parseList<PaymentMode>(sp.mode, ALL_MODES);
  const fromDate = isValidDate(sp.from) ? sp.from : undefined;
  const toDate = isValidDate(sp.to) ? sp.to : undefined;
  const q = (sp.q ?? '').trim();

  const svc = getBackupServiceClient();

  // Build the orders query --------------------------------------------------
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
    // inclusive end-of-day
    query = query.lte('created_at', `${toDate}T23:59:59.999Z`);
  }
  // Order-number substring on the SQL side (cheap, indexed by unique key prefix).
  if (q && /^[A-Za-z0-9-]+$/.test(q)) {
    query = query.ilike('order_number', `%${q}%`);
  }

  const { data: ordersRaw, error: ordersErr } = await query;
  if (ordersErr) {
    console.error('[admin/orders] orders fetch failed:', ordersErr);
  }
  let orders = (ordersRaw ?? []) as OrderRow[];

  // Counters across the current filter scope (status filter ignored on
  // purpose so the tiles always reflect "across this page of orders").
  const counters = {
    open: orders.filter((o) => STATUS_META[o.status]?.group === 'open' || STATUS_META[o.status]?.group === 'awaiting').length,
    awaiting: orders.filter((o) => STATUS_META[o.status]?.group === 'awaiting').length,
    fulfilled: orders.filter((o) => STATUS_META[o.status]?.group === 'fulfilled').length,
    refunded: orders.filter((o) => STATUS_META[o.status]?.group === 'refunded').length,
  };

  // Resolve buyer emails (RPC lives on the user-context client per existing pattern).
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

  // Pull business_name from client_profiles for any users we have, so the
  // "Customer" cell shows email + business_name like the mockup.
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

  // Final post-fetch filter for the free-text customer search across email
  // + business_name + order_number (case-insensitive). We do this in JS
  // because the auth.users email lives in the other project (cross-project
  // RPC) so we can't push the substring into the SQL where-clause cleanly.
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

  // Filter chip hrefs (preserves other params, toggles target) -------------
  function statusChipHref(s: OrderStatus): string {
    return buildHref('/admin/orders', {
      status: toggle(selectedStatuses, s),
      mode: selectedModes,
      from: fromDate,
      to: toDate,
      q,
    });
  }

  function modeChipHref(m: PaymentMode): string {
    return buildHref('/admin/orders', {
      status: selectedStatuses,
      mode: toggle(selectedModes, m),
      from: fromDate,
      to: toDate,
      q,
    });
  }

  const clearAllHref = '/admin/orders';

  return (
    <div className="min-h-screen bg-white">
      <TopBanner />
      <Navigation />

      <main className="max-w-7xl mx-auto px-4 py-10">
        <div className="mb-6">
          <div className="text-xs uppercase tracking-wide text-emerald-700 font-semibold mb-1">
            Admin
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Orders</h1>
          <p className="text-slate-500 text-sm mt-1">
            All florist orders, newest first. Showing up to {PAGE_SIZE} most recent
            after filters. Open the row for line items, payments, and refunds.
          </p>
        </div>

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

        {/* Filter form (GET to /admin/orders) */}
        <form
          method="GET"
          action="/admin/orders"
          className="bg-white border border-slate-200 rounded-2xl p-5 mb-6 space-y-4"
        >
          {/* Preserve current multi-select status & mode via hidden fields
              so the search/date submit doesn't drop them. */}
          {selectedStatuses.length > 0 && (
            <input type="hidden" name="status" value={selectedStatuses.join(',')} />
          )}
          {selectedModes.length > 0 && (
            <input type="hidden" name="mode" value={selectedModes.join(',')} />
          )}

          {/* Search + date range */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wide">
                Customer search
              </label>
              <input
                type="search"
                name="q"
                defaultValue={q}
                placeholder="Email, business name, or order number"
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wide">
                Created from
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
                Created to
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
                href={clearAllHref}
                className="text-sm px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:border-slate-400 transition-colors"
              >
                Clear all
              </Link>
            </div>
            <p className="text-xs text-slate-400">
              {orders.length} result{orders.length === 1 ? '' : 's'} (cap {PAGE_SIZE})
            </p>
          </div>
        </form>

        {/* Status + payment mode chip rows */}
        <div className="flex flex-col gap-3 mb-6">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Status
            </p>
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
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Payment mode
            </p>
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

        {/* Table or empty/skeleton */}
        {orders.length === 0 ? (
          <EmptyOrSkeleton hasFilters={
            selectedStatuses.length > 0 ||
            selectedModes.length > 0 ||
            Boolean(fromDate) ||
            Boolean(toDate) ||
            Boolean(q)
          } />
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
      </main>

      <Footer />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

function CounterTile({
  label,
  value,
  sub,
  cls,
}: {
  label: string;
  value: number;
  sub: string;
  cls: string;
}) {
  return (
    <div className={`rounded-2xl border p-4 ${cls}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs font-semibold mt-0.5">{label}</div>
      <div className="text-[11px] opacity-70 mt-0.5">{sub}</div>
    </div>
  );
}

function EmptyOrSkeleton({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/40 p-10 text-center">
      <p className="text-base font-semibold text-slate-700">
        {hasFilters ? 'No orders match these filters.' : 'No orders yet.'}
      </p>
      <p className="text-sm text-slate-500 mt-1">
        {hasFilters
          ? 'Try clearing one of the chips above or widening the date range.'
          : 'Once a customer places an order it will show up here.'}
      </p>
      {/* Skeleton rows so the page does not look broken on empty */}
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
          href="/admin/orders"
          className="inline-block mt-6 text-sm font-semibold text-emerald-700 hover:text-emerald-900 border border-emerald-300 hover:border-emerald-500 px-4 py-2 rounded-xl transition-colors"
        >
          Clear filters
        </Link>
      )}
    </div>
  );
}
