// Admin Clients list -- /admin/clients
// v2 | 2026-05-19 | Job_PM Phase E [V8 SHADOW]
//
// Operational client management. Replaces the 15%-complete v1 list with:
//   - 6 counter tiles (total / pending / approved / admin / suspended / new this week)
//   - Filters: status (multi), B2B/B2C, signup date range, business name search
//   - Columns: business_name, email, phone, status, role, B2B/B2C, last_login_at,
//     orders_count, total_spend, audit link
//   - Per-row Approve / Reject quick actions (route via admin_proposals now)
//   - Bulk Approve: checkbox + rationale -> N admin_proposals in one batch
//   - Per-row "Audit" link to override_audit filtered by target_id = user_id
//
// Implementation notes:
//   - Order counts + total spend are derived in JS server-side (no SQL view) by
//     querying orders WHERE status IN ('paid','fulfilled') and grouping by user_id.
//     That mirrors the BRD's client_lifetime_stats view exactly enough for this
//     surface; a true Postgres VIEW with the full GPM math lives in Rose's queue
//     (Phase E does not own that).
//   - B2B / B2C is computed at render-time via lib/admin/client-derived. The BRD
//     specifies a Postgres GENERATED column, but Pg STORED-generated cannot
//     express the rule cleanly across the existing rows without a backfill that
//     would block this commit on a Rose review. The JS derivation gives us the
//     correct user-facing behavior immediately and is identical wherever it
//     renders. The SQL spec for the GENERATED column is documented in the
//     migration (commented) so it can land in a follow-up once Rose audits it.
//
// Access:
//   - Middleware guards /admin (admin emails OR client_profiles.status='admin'/role='admin').
//   - Server-side belt-and-suspenders: re-check session + admin status / role.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import Link from 'next/link';
import { redirect } from 'next/navigation';

import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';
import WiringSection from '@/components/admin/WiringSection';
import MockupLinkBanner from '@/components/admin/MockupLinkBanner';
import { getWiringForPage } from '@/lib/admin/wiring';
import { approveClient, rejectClient } from './actions';
import BulkApproveForm from './BulkApproveForm';
import {
  deriveB2BStatus,
  normalizeRole,
  normalizeStatus,
  type ClientRole,
  type ClientStatus,
} from '@/lib/admin/client-derived';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ClientRow {
  id: string;
  user_id: string;
  email: string | null;
  business_name: string | null;
  phone: string | null;
  status: ClientStatus;
  role: ClientRole;
  ein: string | null;
  last_login_at: string | null;
  suspended_at: string | null;
  created_at: string;
  approved_at: string | null;
  koronet_id: string | null;
  // Derived
  b2b: 'B2B' | 'B2C';
  orders_count: number;
  total_spend_usd: number;
}

interface PageProps {
  searchParams: Promise<{
    status?: string;     // comma-separated status list
    b2b?: string;        // 'B2B' | 'B2C' | empty
    from?: string;       // YYYY-MM-DD (created_at >=)
    to?: string;         // YYYY-MM-DD (created_at <=)
    q?: string;          // substring on business_name / email
  }>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ADMIN_EMAILS = ['facu@floropolis.com', 'jjpj@crescoinversiones.com'];

const ALL_STATUSES: ClientStatus[] = [
  'pending',
  'approved',
  'admin',
  'suspended',
  'rejected',
];

const STATUS_META: Record<
  ClientStatus,
  { label: string; cls: string }
> = {
  pending:   { label: 'Pending',   cls: 'bg-amber-100 text-amber-800 border-amber-200' },
  approved:  { label: 'Approved',  cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  admin:     { label: 'Admin',     cls: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  suspended: { label: 'Suspended', cls: 'bg-red-100 text-red-700 border-red-200' },
  rejected:  { label: 'Rejected',  cls: 'bg-slate-100 text-slate-500 border-slate-200' },
};

const ROLE_META: Record<ClientRole, { label: string; cls: string }> = {
  florist: { label: 'Florist', cls: 'bg-slate-100 text-slate-700 border-slate-200' },
  sales:   { label: 'Sales',   cls: 'bg-blue-100 text-blue-800 border-blue-200' },
  admin:   { label: 'Admin',   cls: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtCurrency(value: number): string {
  if (!Number.isFinite(value)) return '--';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '--';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--';
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(d);
}

function fmtRelative(iso: string | null | undefined): string {
  if (!iso) return 'never';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'never';
  const diffMs = Date.now() - d.getTime();
  if (diffMs < 0) return fmtDate(iso);
  const days = Math.floor(diffMs / 86_400_000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
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
  return !Number.isNaN(new Date(s).getTime());
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function buildHref(params: {
  status?: ClientStatus[];
  b2b?: 'B2B' | 'B2C' | '';
  from?: string;
  to?: string;
  q?: string;
}): string {
  const sp = new URLSearchParams();
  if (params.status && params.status.length) sp.set('status', params.status.join(','));
  if (params.b2b) sp.set('b2b', params.b2b);
  if (params.from) sp.set('from', params.from);
  if (params.to) sp.set('to', params.to);
  if (params.q) sp.set('q', params.q);
  const s = sp.toString();
  return s ? `/admin/clients?${s}` : '/admin/clients';
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

async function gateAdmin(): Promise<{ userId: string; email: string }> {
  const userClient = await createUserClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user || !user.email) redirect('/auth/login?next=/admin/clients');

  const emailLc = user.email.toLowerCase();
  if (ADMIN_EMAILS.includes(emailLc)) {
    return { userId: user.id, email: emailLc };
  }
  const svc = getBackupServiceClient();
  const { data: profile } = await svc
    .from('client_profiles')
    .select('status, role')
    .eq('user_id', user.id)
    .maybeSingle();
  if (profile?.status === 'admin' || profile?.role === 'admin') {
    return { userId: user.id, email: emailLc };
  }
  redirect('/');
}

// ---------------------------------------------------------------------------
// Inline action buttons (forms, server actions)
// ---------------------------------------------------------------------------

function ApproveButton({ userId }: { userId: string }) {
  return (
    <form action={approveClient.bind(null, userId)}>
      <button
        type="submit"
        className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 border border-emerald-300 hover:border-emerald-500 px-2.5 py-1 rounded-lg transition-colors"
      >
        Approve
      </button>
    </form>
  );
}

function RejectButton({ userId }: { userId: string }) {
  return (
    <form action={rejectClient.bind(null, userId)}>
      <button
        type="submit"
        className="text-xs font-semibold text-red-600 hover:text-red-800 border border-red-200 hover:border-red-400 px-2.5 py-1 rounded-lg transition-colors"
      >
        Reject
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export const metadata = {
  title: 'Clients | Floropolis Admin',
  robots: { index: false, follow: false },
};

export default async function AdminClientsPage({ searchParams }: PageProps) {
  await gateAdmin();

  const sp = await searchParams;
  const selectedStatuses = parseList<ClientStatus>(sp.status, ALL_STATUSES);
  const b2bFilter: 'B2B' | 'B2C' | '' =
    sp.b2b === 'B2B' || sp.b2b === 'B2C' ? sp.b2b : '';
  const fromDate = isValidDate(sp.from) ? sp.from : undefined;
  const toDate = isValidDate(sp.to) ? sp.to : undefined;
  const q = (sp.q ?? '').trim();

  const userClient = await createUserClient();
  const svc = getBackupServiceClient();

  // Fetch client_profiles --------------------------------------------------
  let query = svc
    .from('client_profiles')
    .select(
      'id, user_id, business_name, phone, status, role, ein, last_login_at, suspended_at, created_at, approved_at, koronet_id',
    )
    .order('created_at', { ascending: false })
    .limit(500);

  if (selectedStatuses.length > 0) {
    query = query.in('status', selectedStatuses);
  }
  if (fromDate) {
    query = query.gte('created_at', `${fromDate}T00:00:00.000Z`);
  }
  if (toDate) {
    query = query.lte('created_at', `${toDate}T23:59:59.999Z`);
  }

  const { data: profilesRaw, error } = await query;
  if (error) {
    console.error('[admin/clients] fetch error:', error);
  }
  const profiles = profilesRaw ?? [];

  // Resolve emails via RPC
  const userIds = Array.from(new Set(profiles.map((p) => p.user_id).filter((v): v is string => !!v)));
  const emailMap: Record<string, string> = {};
  if (userIds.length > 0) {
    const { data: emailRows } = await userClient.rpc('get_client_emails', { user_ids: userIds });
    (emailRows ?? []).forEach((r: { user_id: string; email: string }) => {
      emailMap[r.user_id] = r.email;
    });
  }

  // Derive orders_count + total_spend in JS (no view dependency).
  // We pull all paid+fulfilled orders for these user_ids in one query.
  const ordersByUser: Record<string, { count: number; spend: number }> = {};
  if (userIds.length > 0) {
    const { data: orderRows } = await svc
      .from('orders')
      .select('user_id, grand_total, status')
      .in('user_id', userIds)
      .in('status', ['paid', 'fulfilled', 'refunded']);
    (orderRows ?? []).forEach((o: { user_id: string; grand_total: number | string | null; status: string }) => {
      const u = o.user_id;
      if (!ordersByUser[u]) ordersByUser[u] = { count: 0, spend: 0 };
      ordersByUser[u].count += 1;
      const n = typeof o.grand_total === 'string' ? parseFloat(o.grand_total) : Number(o.grand_total);
      if (Number.isFinite(n)) ordersByUser[u].spend += n;
    });
  }

  // Build the derived row list
  let rows: ClientRow[] = profiles.map((p) => {
    const stats = ordersByUser[p.user_id] ?? { count: 0, spend: 0 };
    return {
      id: p.id,
      user_id: p.user_id,
      email: emailMap[p.user_id] ?? null,
      business_name: p.business_name,
      phone: p.phone,
      status: normalizeStatus(p.status),
      role: normalizeRole(p.role),
      ein: p.ein,
      last_login_at: p.last_login_at,
      suspended_at: p.suspended_at,
      created_at: p.created_at,
      approved_at: p.approved_at,
      koronet_id: p.koronet_id,
      b2b: deriveB2BStatus(p.ein),
      orders_count: stats.count,
      total_spend_usd: stats.spend,
    };
  });

  // Apply free-text + B2B filters in JS (post-fetch).
  if (b2bFilter) {
    rows = rows.filter((r) => r.b2b === b2bFilter);
  }
  if (q) {
    const needle = q.toLowerCase();
    rows = rows.filter((r) => {
      const business = (r.business_name ?? '').toLowerCase();
      const email = (r.email ?? '').toLowerCase();
      return business.includes(needle) || email.includes(needle);
    });
  }

  // Counter tiles. Across the unfiltered profile set (NOT filtered rows)
  // so the operator can see the overall pipeline regardless of current filter.
  const allRows: ClientRow[] = profiles.map((p) => ({
    id: p.id,
    user_id: p.user_id,
    email: emailMap[p.user_id] ?? null,
    business_name: p.business_name,
    phone: p.phone,
    status: normalizeStatus(p.status),
    role: normalizeRole(p.role),
    ein: p.ein,
    last_login_at: p.last_login_at,
    suspended_at: p.suspended_at,
    created_at: p.created_at,
    approved_at: p.approved_at,
    koronet_id: p.koronet_id,
    b2b: deriveB2BStatus(p.ein),
    orders_count: 0,
    total_spend_usd: 0,
  }));

  const weekAgo = Date.now() - 7 * 86_400_000;
  const counters = {
    total: allRows.length,
    pending: allRows.filter((r) => r.status === 'pending').length,
    approved: allRows.filter((r) => r.status === 'approved').length,
    admin: allRows.filter((r) => r.status === 'admin').length,
    suspended: allRows.filter((r) => r.status === 'suspended').length,
    new_this_week: allRows.filter((r) => new Date(r.created_at).getTime() >= weekAgo).length,
  };

  const pendingForBulk = allRows
    .filter((r) => r.status === 'pending')
    .map((r) => ({ user_id: r.user_id, business_name: r.business_name, email: r.email }));

  // Filter chip href helpers ------------------------------------------------
  function statusChipHref(s: ClientStatus): string {
    return buildHref({
      status: toggle(selectedStatuses, s),
      b2b: b2bFilter,
      from: fromDate,
      to: toDate,
      q,
    });
  }
  function b2bChipHref(b: 'B2B' | 'B2C'): string {
    return buildHref({
      status: selectedStatuses,
      b2b: b2bFilter === b ? '' : b,
      from: fromDate,
      to: toDate,
      q,
    });
  }
  const clearHref = '/admin/clients';
  const filtersActive =
    selectedStatuses.length > 0 || !!b2bFilter || !!fromDate || !!toDate || !!q;

  const wiringEntry = getWiringForPage('/admin/clients');
  const wm = (id: string) =>
    wiringEntry?.sections.find((s) => s.id === id) ?? { level: 'PLAN' as const, note: 'unregistered' };

  return (
    <>
      <main className="max-w-7xl mx-auto px-4 py-10">
        <MockupLinkBanner mockupHref="/mockups/v2-admin" pageLabel="/admin/clients" />
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Clients</h1>
              <p className="text-slate-500 text-sm mt-1">
                Operational view of all florist + admin accounts. All status changes route through proposals.
              </p>
            </div>
            <Link
              href="/admin/catalog/approval-queue"
              className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 border border-emerald-300 hover:border-emerald-500 px-3 py-2 rounded-lg transition-colors"
            >
              View approval queue
            </Link>
          </div>
        </div>

        {/* Counter tiles */}
        <WiringSection level={wm('counters').level} note={wm('counters').note} id="counters">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
          {[
            { k: 'total',         label: 'Total',         n: counters.total,        cls: 'text-slate-900' },
            { k: 'pending',       label: 'Pending',       n: counters.pending,      cls: 'text-amber-700' },
            { k: 'approved',      label: 'Approved',      n: counters.approved,     cls: 'text-emerald-700' },
            { k: 'admin',         label: 'Admin',         n: counters.admin,        cls: 'text-indigo-700' },
            { k: 'suspended',     label: 'Suspended',     n: counters.suspended,    cls: 'text-red-700' },
            { k: 'new_this_week', label: 'New this week', n: counters.new_this_week, cls: 'text-slate-900' },
          ].map((tile) => (
            <div key={tile.k} className="rounded-xl border border-slate-200 px-4 py-3 bg-white">
              <div className={`text-2xl font-bold ${tile.cls}`}>{tile.n}</div>
              <div className="text-xs text-slate-500 mt-0.5">{tile.label}</div>
            </div>
          ))}
        </div>

        </WiringSection>

        {/* Filter chips + search */}
        <WiringSection level={wm('filters').level} note={wm('filters').note} id="filters">
        <div className="mb-4 rounded-xl border border-slate-200 px-4 py-3 bg-slate-50">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-500 mr-1">Status</span>
            {ALL_STATUSES.map((s) => {
              const active = selectedStatuses.includes(s);
              return (
                <Link
                  key={s}
                  href={statusChipHref(s)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    active
                      ? STATUS_META[s].cls + ' font-semibold'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                  }`}
                >
                  {STATUS_META[s].label}
                </Link>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2 mt-3">
            <span className="text-xs font-semibold text-slate-500 mr-1">B2B / B2C</span>
            {(['B2B', 'B2C'] as const).map((b) => {
              const active = b2bFilter === b;
              return (
                <Link
                  key={b}
                  href={b2bChipHref(b)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    active
                      ? 'bg-blue-100 text-blue-800 border-blue-300 font-semibold'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                  }`}
                >
                  {b}
                </Link>
              );
            })}
          </div>

          <form className="flex flex-wrap items-center gap-2 mt-3" method="get">
            <input
              type="hidden"
              name="status"
              value={selectedStatuses.join(',')}
            />
            {b2bFilter && <input type="hidden" name="b2b" value={b2bFilter} />}
            <label className="text-xs text-slate-500">
              From
              <input
                type="date"
                name="from"
                defaultValue={fromDate ?? ''}
                className="ml-1 rounded border border-slate-300 px-2 py-1 text-xs"
              />
            </label>
            <label className="text-xs text-slate-500">
              To
              <input
                type="date"
                name="to"
                defaultValue={toDate ?? ''}
                className="ml-1 rounded border border-slate-300 px-2 py-1 text-xs"
              />
            </label>
            <label className="text-xs text-slate-500 flex-1 min-w-[200px]">
              Search
              <input
                type="text"
                name="q"
                defaultValue={q}
                placeholder="business name or email"
                className="ml-1 w-full max-w-xs rounded border border-slate-300 px-2 py-1 text-xs"
              />
            </label>
            <button
              type="submit"
              className="text-xs font-semibold text-white bg-slate-900 hover:bg-slate-700 px-3 py-1.5 rounded-lg transition-colors"
            >
              Apply
            </button>
            {filtersActive && (
              <Link
                href={clearHref}
                className="text-xs font-semibold text-slate-500 hover:text-slate-700 underline"
              >
                Clear all
              </Link>
            )}
          </form>
        </div>

        </WiringSection>

        {/* Bulk approve */}
        <WiringSection level={wm('bulk-approve').level} note={wm('bulk-approve').note} id="bulk-approve">
        <div className="mb-6">
          <BulkApproveForm pendingClients={pendingForBulk} />
        </div>
        </WiringSection>

        {/* Table */}
        <WiringSection level={wm('table').level} note={wm('table').note} id="table">
        {rows.length === 0 ? (
          <div className="text-center py-20 text-slate-400 border border-dashed border-slate-200 rounded-xl">
            <p className="font-semibold text-slate-600">No clients match these filters</p>
            <p className="text-sm mt-1">Adjust the chips above or clear all filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-slate-700">Business</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-700">Email</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-700">Phone</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-700">Status</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-700">Role</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-700">B2B</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-700">Last login</th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-700">Orders</th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-700">Spend</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/clients/${c.user_id}`}
                        className="font-semibold text-slate-900 hover:text-emerald-700 hover:underline"
                      >
                        {c.business_name ?? <span className="italic text-slate-400">No name</span>}
                      </Link>
                      <div className="text-xs text-slate-400 mt-0.5">
                        Joined {fmtDate(c.created_at)}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 text-xs break-all">
                      {c.email ?? <span className="text-slate-300">--</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-600 text-xs">
                      {c.phone ?? <span className="text-slate-300">--</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold border ${STATUS_META[c.status].cls}`}>
                        {STATUS_META[c.status].label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold border ${ROLE_META[c.role].cls}`}>
                        {ROLE_META[c.role].label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold border ${
                          c.b2b === 'B2B'
                            ? 'bg-blue-50 text-blue-800 border-blue-200'
                            : 'bg-slate-100 text-slate-700 border-slate-200'
                        }`}
                      >
                        {c.b2b}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                      {fmtRelative(c.last_login_at)}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-700 font-mono text-xs">
                      {c.orders_count}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-700 font-mono text-xs">
                      {fmtCurrency(c.total_spend_usd)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Link
                          href={`/admin/clients/${c.user_id}`}
                          className="text-xs font-semibold text-slate-700 hover:text-slate-900 border border-slate-300 hover:border-slate-500 px-2.5 py-1 rounded-lg transition-colors"
                        >
                          Open
                        </Link>
                        {c.status === 'pending' && (
                          <>
                            <ApproveButton userId={c.user_id} />
                            <RejectButton userId={c.user_id} />
                          </>
                        )}
                        <Link
                          href={`/admin/clients/${c.user_id}#audit`}
                          className="text-xs font-semibold text-slate-500 hover:text-slate-700 underline"
                        >
                          Audit
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        </WiringSection>

        <p className="text-xs text-slate-400 mt-6">
          Showing up to 500 rows. Approve / Reject create proposals in awaiting_facu state -- they take effect only after CEO approves in the approval queue.
        </p>
      </main>
    </>
  );
}
