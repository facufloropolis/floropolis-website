// Admin Client detail -- /admin/clients/[id]
// v1 | 2026-05-19 | Job_PM Phase E [V8 SHADOW]
//
// param `id` is the auth.users user_id (NOT client_profiles.id) -- the list
// view links here using user_id because that's also the join key for orders,
// override_audit, and auth.users.
//
// Sections:
//   - Header (business name, status, role, email, phone, member since)
//   - Action buttons (Approve / Suspend / Promote / Force logout)
//   - Tabs:
//     - Profile: editable fields (proposal-routed)
//     - Orders: list of their orders
//     - Communications: dispatch_communications (if table exists) + phone notes
//       + Brevo (if table exists) -- gracefully degrades if any source missing
//     - Audit: override_audit rows where target_table='client_profiles' or
//       target_id matches user_id
//
// Access: same dual gate as list view (admin email OR client_profiles.status/role=admin).

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';
import WiringSection from '@/components/admin/WiringSection';
import MockupLinkBanner from '@/components/admin/MockupLinkBanner';
import { getWiringForPage } from '@/lib/admin/wiring';
import DetailActionPanel from '@/app/admin/_components/DetailActionPanel';
import ActionButtons from './ActionButtons';
import ClientDetailTabs from './ClientDetailTabs';
import ProfileEditForm from './ProfileEditForm';
import PhoneNoteForm from './PhoneNoteForm';
import {
  deriveB2BStatus,
  normalizeRole,
  normalizeStatus,
} from '@/lib/admin/client-derived';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ClientProfile {
  id: string;
  user_id: string;
  business_name: string | null;
  phone: string | null;
  ein: string | null;
  status: string | null;
  role: string | null;
  koronet_id: string | null;
  notes: string | null;
  last_login_at: string | null;
  suspended_at: string | null;
  suspended_reason: string | null;
  created_at: string;
  approved_at: string | null;
}

interface OrderListRow {
  id: number;
  order_number: string;
  status: string;
  currency: string;
  grand_total: number | string | null;
  created_at: string;
  requested_delivery_date: string | null;
}

interface PhoneNoteRow {
  id: string;
  note: string;
  contacted_at: string;
  contacted_by: string | null;
  order_id: number | null;
}

interface AuditRow {
  id: string;
  proposal_id: string | null;
  target_table: string;
  target_id: string | null;
  applied_by_function: string | null;
  applied_at: string | null;
  before_jsonb: Record<string, unknown> | null;
  after_jsonb: Record<string, unknown> | null;
}

const ADMIN_EMAILS = ['facu@floropolis.com', 'jjpj@crescoinversiones.com'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtCurrency(value: number | string | null, currency = 'USD'): string {
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
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(d);
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '--';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--';
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

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
// Page
// ---------------------------------------------------------------------------

export const metadata = {
  title: 'Client detail | Floropolis Admin',
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminClientDetailPage({ params }: PageProps) {
  await gateAdmin();
  const { id: rawId } = await params;
  const userId = decodeURIComponent(rawId);
  if (!userId || userId.length < 10) notFound();

  const userClient = await createUserClient();
  const svc = getBackupServiceClient();

  // Profile -----------------------------------------------------------------
  const { data: profile, error: profileErr } = await svc
    .from('client_profiles')
    .select(
      'id, user_id, business_name, phone, ein, status, role, koronet_id, notes, last_login_at, suspended_at, suspended_reason, created_at, approved_at',
    )
    .eq('user_id', userId)
    .maybeSingle();
  if (profileErr) {
    console.error('[admin/clients/[id]] profile fetch error', profileErr);
  }
  if (!profile) notFound();

  const cp = profile as ClientProfile;
  const status = normalizeStatus(cp.status);
  const role = normalizeRole(cp.role);
  const b2b = deriveB2BStatus(cp.ein);

  // Email lookup
  let email: string | null = null;
  {
    const { data: emailRows } = await userClient.rpc('get_client_emails', {
      user_ids: [userId],
    });
    if (emailRows && emailRows.length > 0) {
      email = (emailRows[0] as { email: string }).email ?? null;
    }
  }

  // Orders -----------------------------------------------------------------
  const { data: orderRows } = await svc
    .from('orders')
    .select(
      'id, order_number, status, currency, grand_total, created_at, requested_delivery_date',
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(200);
  const orders = (orderRows ?? []) as OrderListRow[];

  // Phone notes ------------------------------------------------------------
  const { data: phoneRows, error: phoneErr } = await svc
    .from('client_phone_notes')
    .select('id, note, contacted_at, contacted_by, order_id')
    .eq('client_id', cp.id)
    .order('contacted_at', { ascending: false })
    .limit(200);
  if (phoneErr) {
    console.error('[admin/clients/[id]] phone notes error', phoneErr);
  }
  const phoneNotes = (phoneRows ?? []) as PhoneNoteRow[];

  // Audit rows -------------------------------------------------------------
  // We pull rows touching this user_id directly OR via a proposal that has
  // target_id=user_id. The override_audit shape stores target_id as text and
  // target_table='client_profiles' for our path. We also include rows for
  // auth.users where target_id=user_id (force-logout audit trail).
  const { data: auditRows, error: auditErr } = await svc
    .from('override_audit')
    .select(
      'id, proposal_id, target_table, target_id, applied_by_function, applied_at, before_jsonb, after_jsonb',
    )
    .or(
      `and(target_table.eq.client_profiles,target_id.eq.${userId}),and(target_table.eq.auth.users,target_id.eq.${userId})`,
    )
    .order('applied_at', { ascending: false })
    .limit(200);
  if (auditErr) {
    console.error('[admin/clients/[id]] audit error', auditErr);
  }
  const audit = (auditRows ?? []) as AuditRow[];

  const orderCount = orders.length;

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  const headerStatusCls =
    status === 'pending'
      ? 'bg-amber-100 text-amber-800 border-amber-200'
      : status === 'approved'
        ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
        : status === 'admin'
          ? 'bg-indigo-100 text-indigo-800 border-indigo-200'
          : status === 'suspended'
            ? 'bg-red-100 text-red-800 border-red-200'
            : 'bg-slate-100 text-slate-600 border-slate-200';

  const wiringEntry = getWiringForPage('/admin/clients/[id]');
  const wm = (id: string) =>
    wiringEntry?.sections.find((s) => s.id === id) ?? { level: 'PLAN' as const, note: 'unregistered' };

  return (
    <>
      <main className="max-w-7xl mx-auto px-4 py-8">
        <MockupLinkBanner mockupHref="/mockups/v2-admin" pageLabel={`/admin/clients/${cp.user_id.slice(0, 8)}`} />
        <div className="mb-4 text-xs">
          <Link href="/admin/clients" className="text-slate-500 hover:text-slate-700">
            &lt;- All clients
          </Link>
        </div>

        {/* Header */}
        <WiringSection level={wm('header').level} note={wm('header').note} id="header">
        <div className="rounded-2xl border border-slate-200 p-5 mb-6">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-slate-900 truncate">
              {cp.business_name ?? <span className="italic text-slate-400">No business name</span>}
            </h1>
            <div className="text-sm text-slate-500 mt-1">
              {email ?? <span className="text-slate-400">no email</span>}
              {cp.phone && <span className="ml-3">{cp.phone}</span>}
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <span
                className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold border ${headerStatusCls}`}
              >
                {status}
              </span>
              <span
                className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold border ${
                  role === 'admin'
                    ? 'bg-indigo-100 text-indigo-800 border-indigo-200'
                    : role === 'sales'
                      ? 'bg-blue-100 text-blue-800 border-blue-200'
                      : 'bg-slate-100 text-slate-700 border-slate-200'
                }`}
              >
                role: {role}
              </span>
              <span
                className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold border ${
                  b2b === 'B2B'
                    ? 'bg-blue-50 text-blue-800 border-blue-200'
                    : 'bg-slate-100 text-slate-700 border-slate-200'
                }`}
              >
                {b2b}
              </span>
              <span className="text-xs text-slate-500">
                member since {fmtDate(cp.created_at)}
              </span>
              {cp.last_login_at && (
                <span className="text-xs text-slate-500">
                  last login {fmtDateTime(cp.last_login_at)}
                </span>
              )}
              {cp.koronet_id && (
                <span className="text-xs font-mono text-slate-400">
                  Koronet: {cp.koronet_id}
                </span>
              )}
            </div>
            {cp.suspended_at && cp.suspended_reason && (
              <div className="mt-3 text-xs rounded-lg border border-red-200 bg-red-50 text-red-800 px-3 py-2 max-w-2xl">
                <span className="font-semibold">Suspended {fmtDate(cp.suspended_at)}:</span>{' '}
                {cp.suspended_reason}
              </div>
            )}
          </div>
        </div>

        </WiringSection>

        <div className="grid lg:grid-cols-[1fr_320px] gap-6">
          <div className="min-w-0">

        {/* Tabs */}
        <WiringSection level={wm('tabs').level} note={wm('tabs').note} id="tabs">
        <ClientDetailTabs
          counts={{
            orders: orders.length,
            communications: phoneNotes.length,
            audit: audit.length,
          }}
          profileTab={
            <ProfileEditForm
              userId={cp.user_id}
              initial={{
                business_name: cp.business_name,
                phone: cp.phone,
                ein: cp.ein,
                notes: cp.notes,
              }}
            />
          }
          ordersTab={
            orders.length === 0 ? (
              <div className="text-sm text-slate-500 py-8 text-center border border-dashed border-slate-200 rounded-xl">
                No orders yet.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-4 py-2 font-semibold text-slate-700">Order</th>
                      <th className="text-left px-4 py-2 font-semibold text-slate-700">Status</th>
                      <th className="text-left px-4 py-2 font-semibold text-slate-700">Delivery</th>
                      <th className="text-right px-4 py-2 font-semibold text-slate-700">Total</th>
                      <th className="text-left px-4 py-2 font-semibold text-slate-700">Placed</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {orders.map((o) => (
                      <tr key={o.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2 font-mono text-xs">
                          <Link
                            href={`/admin/orders/${o.id}`}
                            className="text-emerald-700 hover:text-emerald-900 hover:underline"
                          >
                            {o.order_number}
                          </Link>
                        </td>
                        <td className="px-4 py-2 text-slate-700">{o.status}</td>
                        <td className="px-4 py-2 text-xs text-slate-500">
                          {fmtDate(o.requested_delivery_date)}
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-xs">
                          {fmtCurrency(o.grand_total, o.currency || 'USD')}
                        </td>
                        <td className="px-4 py-2 text-xs text-slate-500">
                          {fmtDate(o.created_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          }
          communicationsTab={
            <div className="space-y-4">
              <PhoneNoteForm
                clientId={cp.id}
                orderOptions={orders.map((o) => ({
                  id: o.id,
                  order_number: o.order_number,
                }))}
              />

              <div className="text-xs rounded-lg border border-slate-200 bg-slate-50 text-slate-600 px-3 py-2">
                Brevo email events + WhatsApp threads are not yet integrated on this
                surface (see BRD v0.3 Communications -- pushback to Talin + future
                comms agent). For now this tab shows only phone notes you log here
                and the dispatch_communications stream below if any.
              </div>

              {phoneNotes.length === 0 ? (
                <div className="text-sm text-slate-500 py-8 text-center border border-dashed border-slate-200 rounded-xl">
                  No phone notes logged yet.
                </div>
              ) : (
                <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                  {phoneNotes.map((n) => (
                    <li key={n.id} className="px-4 py-3">
                      <div className="text-sm text-slate-900 whitespace-pre-wrap">
                        {n.note}
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        {fmtDateTime(n.contacted_at)}
                        {n.order_id && (
                          <>
                            {' '}-{' '}
                            <Link
                              href={`/admin/orders/${n.order_id}`}
                              className="text-emerald-700 hover:underline"
                            >
                              order #{n.order_id}
                            </Link>
                          </>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          }
          auditTab={
            <div>
              {audit.length === 0 ? (
                <div className="text-sm text-slate-500 py-8 text-center border border-dashed border-slate-200 rounded-xl">
                  No audit rows for this client yet.
                </div>
              ) : (
                <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                  {audit.map((a) => (
                    <li key={a.id} className="px-4 py-3 text-sm">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div>
                          <span className="font-mono text-xs text-slate-500">
                            {a.target_table}
                          </span>
                          <span className="ml-2 text-xs text-slate-400">
                            via {a.applied_by_function ?? 'unknown'}
                          </span>
                        </div>
                        <span className="text-xs text-slate-500">
                          {fmtDateTime(a.applied_at)}
                        </span>
                      </div>
                      {a.proposal_id && (
                        <div className="text-xs text-slate-400 mt-1 font-mono">
                          proposal {a.proposal_id.slice(0, 8)}...
                        </div>
                      )}
                      <details className="mt-2 text-xs">
                        <summary className="cursor-pointer text-slate-500 hover:text-slate-700">
                          before / after
                        </summary>
                        <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-3">
                          <pre className="bg-slate-50 border border-slate-200 rounded p-2 text-xs overflow-auto max-h-40">
                            {JSON.stringify(a.before_jsonb, null, 2)}
                          </pre>
                          <pre className="bg-slate-50 border border-slate-200 rounded p-2 text-xs overflow-auto max-h-40">
                            {JSON.stringify(a.after_jsonb, null, 2)}
                          </pre>
                        </div>
                      </details>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          }
        />
        </WiringSection>

          </div>

          {/* Right column: sticky action panel */}
          <DetailActionPanel
            title="Client actions"
            subtitle={`Status: ${status} . Role: ${role}`}
          >
            <ActionButtons
              userId={cp.user_id}
              currentStatus={status}
              currentRole={role}
              orderCount={orderCount}
            />
            <p className="text-[11px] text-slate-500 -mt-1">
              Approve / Suspend / Promote route through admin_proposals. Force
              logout hits /api/admin/auth-sessions directly (no proposal).
            </p>
          </DetailActionPanel>
        </div>
      </main>
    </>
  );
}
