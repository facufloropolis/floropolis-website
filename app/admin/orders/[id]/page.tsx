// Admin Order detail -- /admin/orders/[id]
// v1 | 2026-05-18 | Job_PM admin-port ORD [V8 SHADOW]
//
// Server-rendered deep dive on one order. Reads orders + order_lines +
// payments + refund_approvals + addresses (snapshots) + invoices from
// supabase-backup. Falls back to address rows when snapshot jsonb is missing.
//
// Sections:
//   - One-line Dispatch + Refunds summaries (above header; r3-cleanup W4
//     follow-up: full display cards collapsed, action triggers stay in the
//     right DetailActionPanel)
//   - Header (order_number, status, total, customer)
//   - Timeline derived from orders.* timestamps and payments
//   - Order lines table
//   - Payments ledger
//   - Shipping address, billing address
//   - Invoice (signed URL link if invoices.pdf_url set, else download proxy)
//
// Refund proposal flow:
//   "Trigger refund" expands a side-by-side form (RefundProposalForm) that
//   POSTs to /api/admin/proposals with type='refund.create'. Proposal lands
//   in /admin/catalog/approval-queue. The executor for refund.create is a
//   TODO stub today -- approval will return error until that's wired.
//
// Access:
//   - Middleware guards /admin and restricts to admin emails OR
//     client_profiles.status='admin'.
//   - Server-side belt-and-suspenders: re-check session + admin status.
//   - Non-admin -> redirect('/'). Order not found -> notFound().

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
import RefundProposalForm from './RefundProposalForm';
import InitDispatchButton from './InitDispatchButton';
import EmailLogSection from './_components/EmailLogSection';
import ConversationsSection from './_components/ConversationsSection';

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
  phone?: string | null;
  line1?: string;
  line2?: string | null;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
}

interface OrderRow {
  id: number;
  user_id: string;
  order_number: string;
  status: OrderStatus;
  payment_mode: PaymentMode;
  lead_time_days: number;
  requested_delivery_date: string;
  scheduled_preauth_at: string | null;
  scheduled_charge_at: string | null;
  currency: string;
  subtotal: number | string;
  shipping_total: number | string;
  tax_total: number | string;
  discount_total: number | string;
  grand_total: number | string;
  billing_address_id: number | null;
  shipping_address_id: number | null;
  shipping_address_snapshot: ShippingSnap | null;
  billing_address_snapshot: ShippingSnap | null;
  stripe_customer_id: string | null;
  stripe_payment_method_id: string | null;
  stripe_setup_intent_id: string | null;
  customer_note: string | null;
  internal_note: string | null;
  source: string;
  created_at: string;
  updated_at: string | null;
  submitted_at: string | null;
  paid_at: string | null;
  fulfilled_at: string | null;
  cancelled_at: string | null;
}

interface OrderLineRow {
  id: number;
  sku_id: number;
  sku_name_snapshot: string;
  sku_variety_snapshot: string | null;
  sku_length_snapshot: string | null;
  sku_unit_snapshot: string | null;
  sku_vendor_snapshot: string | null;
  quantity: number;
  unit_price_locked: number | string;
  line_total_locked: number | string;
  currency: string;
}

interface PaymentRow {
  id: number;
  kind: string;
  status: string;
  amount: number | string;
  currency: string;
  stripe_payment_intent_id: string | null;
  stripe_charge_id: string | null;
  stripe_refund_id: string | null;
  stripe_payment_method_id: string | null;
  refund_reason: string | null;
  error_message: string | null;
  created_at: string;
  processed_at: string | null;
}

interface RefundApprovalRow {
  id: number;
  proposed_amount: number | string;
  currency: string;
  status: string;
  reason: string;
  jj_approved: boolean | null;
  facu_approved: boolean | null;
  quorum_met: boolean;
  expires_at: string;
  created_at: string;
}

interface InvoiceRow {
  id: number;
  invoice_number: string;
  pdf_url: string | null;
  pdf_storage_path: string | null;
  issued_at: string;
  grand_total: number | string;
  currency: string;
  voided: boolean;
}

interface AddressRow {
  id: number;
  kind: string;
  recipient_name: string;
  business_name: string | null;
  phone: string | null;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  postal_code: string;
  country: string;
}

interface RefundProposalRow {
  id: string;
  type: string;
  target_table: string;
  target_id: string | null;
  status: string;
  payload: Record<string, unknown> | null;
  notes: string | null;
  proposed_at: string;
}

// ---------------------------------------------------------------------------
// Constants / helpers (shared with /admin/orders list page)
// ---------------------------------------------------------------------------

const STATUS_META: Record<OrderStatus, { label: string; cls: string }> = {
  cart:             { label: 'Cart',            cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  pending_payment:  { label: 'Pending payment', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  card_saved:       { label: 'Card saved',      cls: 'bg-blue-50 text-blue-800 border-blue-200' },
  preauth_held:     { label: 'Preauth held',    cls: 'bg-blue-50 text-blue-800 border-blue-200' },
  paid:             { label: 'Paid',            cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  fulfilled:        { label: 'Fulfilled',       cls: 'bg-emerald-50 text-emerald-900 border-emerald-300' },
  failed:           { label: 'Failed',          cls: 'bg-red-50 text-red-800 border-red-200' },
  cancelled:        { label: 'Cancelled',       cls: 'bg-slate-100 text-slate-500 border-slate-200' },
  refunded:         { label: 'Refunded',        cls: 'bg-slate-100 text-slate-500 border-slate-200' },
};

const MODE_META: Record<PaymentMode, { label: string; explain: string }> = {
  mode_a: { label: 'Mode A (>=10 days)', explain: 'Card saved, preauth scheduled, full charge later.' },
  mode_b: { label: 'Mode B (3-9 days)',  explain: '$1 verification, full charge later.' },
  mode_c: { label: 'Mode C (<3 days)',   explain: 'Charged immediately.' },
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
    hour: 'numeric', minute: '2-digit',
  }).format(d);
}

function fmtDateOnly(iso: string | null | undefined): string {
  if (!iso) return '--';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--';
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  }).format(d);
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

const ADMIN_EMAILS = ['facu@floropolis.com', 'jjpj@crescoinversiones.com'];

async function gateAdmin(): Promise<void> {
  const userClient = await createUserClient();
  const { data: { user } } = await userClient.auth.getUser();
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

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export const metadata = {
  title: 'Order detail | Floropolis Admin',
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminOrderDetailPage({ params }: PageProps) {
  await gateAdmin();

  const { id } = await params;
  const orderId = Number(id);
  if (!Number.isFinite(orderId) || orderId <= 0) notFound();

  const svc = getBackupServiceClient();

  // Order (full row) -------------------------------------------------------
  const { data: orderRaw, error: orderErr } = await svc
    .from('orders')
    .select(
      'id, user_id, order_number, status, payment_mode, lead_time_days, requested_delivery_date, scheduled_preauth_at, scheduled_charge_at, currency, subtotal, shipping_total, tax_total, discount_total, grand_total, billing_address_id, shipping_address_id, shipping_address_snapshot, billing_address_snapshot, stripe_customer_id, stripe_payment_method_id, stripe_setup_intent_id, customer_note, internal_note, source, created_at, updated_at, submitted_at, paid_at, fulfilled_at, cancelled_at',
    )
    .eq('id', orderId)
    .maybeSingle();

  if (orderErr) {
    console.error('[admin/orders/[id]] order fetch failed:', orderErr);
  }
  if (!orderRaw) notFound();
  const order = orderRaw as OrderRow;

  // Parallel reads ---------------------------------------------------------
  const [linesRes, paymentsRes, approvalsRes, invoiceRes, addressesRes, proposalsRes, dispatchRes] =
    await Promise.all([
      svc
        .from('order_lines')
        .select(
          'id, sku_id, sku_name_snapshot, sku_variety_snapshot, sku_length_snapshot, sku_unit_snapshot, sku_vendor_snapshot, quantity, unit_price_locked, line_total_locked, currency',
        )
        .eq('order_id', orderId)
        .order('id', { ascending: true }),
      svc
        .from('payments')
        .select(
          'id, kind, status, amount, currency, stripe_payment_intent_id, stripe_charge_id, stripe_refund_id, stripe_payment_method_id, refund_reason, error_message, created_at, processed_at',
        )
        .eq('order_id', orderId)
        .order('created_at', { ascending: true }),
      svc
        .from('refund_approvals')
        .select(
          'id, proposed_amount, currency, status, reason, jj_approved, facu_approved, quorum_met, expires_at, created_at',
        )
        .eq('order_id', orderId)
        .order('created_at', { ascending: false }),
      svc
        .from('invoices')
        .select('id, invoice_number, pdf_url, pdf_storage_path, issued_at, grand_total, currency, voided')
        .eq('order_id', orderId)
        .maybeSingle(),
      // address rows (only if snapshot is missing -- snapshot is the canonical source)
      (order.shipping_address_id || order.billing_address_id)
        ? svc
            .from('addresses')
            .select('id, kind, recipient_name, business_name, phone, line1, line2, city, state, postal_code, country')
            .in(
              'id',
              [order.shipping_address_id, order.billing_address_id].filter(
                (x): x is number => typeof x === 'number',
              ),
            )
        : Promise.resolve({ data: [] as AddressRow[] }),
      // Pending refund.create proposals for this order
      svc
        .from('admin_proposals')
        .select('id, type, target_table, target_id, status, payload, notes, proposed_at')
        .eq('type', 'refund.create')
        .eq('target_table', 'orders')
        .eq('target_id', String(orderId))
        .order('proposed_at', { ascending: false }),
      svc
        .from('dispatches')
        .select('id, status, carrier, tracking_number, packed_at, picked_up_at, in_transit_at, delivered_at')
        .eq('order_id', orderId)
        .maybeSingle(),
    ]);

  const lines = (linesRes.data ?? []) as OrderLineRow[];
  const payments = (paymentsRes.data ?? []) as PaymentRow[];
  const approvals = (approvalsRes.data ?? []) as RefundApprovalRow[];
  const invoice = (invoiceRes.data ?? null) as InvoiceRow | null;
  const addresses = ((addressesRes.data ?? []) as AddressRow[]);
  const refundProposals = ((proposalsRes.data ?? []) as RefundProposalRow[]).filter(
    (p) => p.status === 'awaiting_facu' || p.status === 'approved',
  );
  const dispatch = (dispatchRes?.data ?? null) as null | {
    id: string;
    status: string;
    carrier: string | null;
    tracking_number: string | null;
    packed_at: string | null;
    picked_up_at: string | null;
    in_transit_at: string | null;
    delivered_at: string | null;
  };

  // Customer email (RPC on user-context client)
  let customerEmail: string | null = null;
  {
    const userClient = await createUserClient();
    const { data: emailRows } = await userClient.rpc('get_client_emails', {
      user_ids: [order.user_id],
    });
    customerEmail = (emailRows ?? []).find(
      (r: { user_id: string; email: string }) => r.user_id === order.user_id,
    )?.email ?? null;
  }

  // business_name from client_profiles (best-effort)
  const { data: profileRow } = await svc
    .from('client_profiles')
    .select('business_name')
    .eq('user_id', order.user_id)
    .maybeSingle();
  const customerBusiness =
    (profileRow?.business_name as string | undefined) ??
    order.shipping_address_snapshot?.business_name ??
    null;

  // Resolve shipping + billing address: prefer snapshot, fallback to row.
  const shipping: ShippingSnap | null =
    order.shipping_address_snapshot ??
    addressToSnap(addresses.find((a) => a.id === order.shipping_address_id));
  const billing: ShippingSnap | null =
    order.billing_address_snapshot ??
    addressToSnap(addresses.find((a) => a.id === order.billing_address_id));

  // Timeline events -------------------------------------------------------
  const timeline = buildTimeline(order, payments, approvals);

  const sMeta = STATUS_META[order.status] ?? STATUS_META.pending_payment;
  const mMeta = MODE_META[order.payment_mode];
  const grandTotalNum = Number(order.grand_total) || 0;

  const canTriggerRefund =
    order.status !== 'cart' &&
    order.status !== 'cancelled' &&
    order.status !== 'refunded' &&
    approvals.filter((a) => a.status === 'pending').length === 0 &&
    refundProposals.length === 0;

  const wiringEntry = getWiringForPage('/admin/orders/[id]');
  const wm = (id: string) =>
    wiringEntry?.sections.find((s) => s.id === id) ?? { level: 'PLAN' as const, note: 'unregistered' };

  // r3-cleanup (W4 follow-up): one-line summaries replace the Dispatch + Refunds
  // display cards on the left column. Trigger buttons (InitDispatchButton,
  // RefundProposalForm) remain in the right DetailActionPanel as W4 placed them.
  const dispatchLastEventAt =
    dispatch?.delivered_at ??
    dispatch?.in_transit_at ??
    dispatch?.picked_up_at ??
    dispatch?.packed_at ??
    null;
  const pendingRefundCount =
    refundProposals.length + approvals.filter((a) => a.status === 'pending').length;

  return (
    <>
      <main className="max-w-6xl mx-auto px-4 py-10">
        <MockupLinkBanner mockupHref="/mockups/admin-order-detail" pageLabel={`/admin/orders/${order.id}`} />
        {/* Back link */}
        <div className="mb-5">
          <Link
            href="/admin/orders"
            className="text-sm text-slate-500 hover:text-slate-800 inline-flex items-center gap-1.5"
          >
            <span aria-hidden="true">&larr;</span> All orders
          </Link>
        </div>

        {/* Collapsed Dispatch + Refunds summary lines (W4 display-card collapse) */}
        {(dispatch || pendingRefundCount > 0) && (
          <div className="mb-4 space-y-1">
            {dispatch && (
              <WiringSection level={wm('init-dispatch').level} note={wm('init-dispatch').note} id="init-dispatch">
                <p className="text-xs text-slate-600">
                  <span className="text-slate-400 font-semibold uppercase tracking-wide mr-2">
                    Dispatch
                  </span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200 font-mono">
                    {dispatch.status}
                  </span>
                  {dispatchLastEventAt && (
                    <span className="ml-2 text-slate-500">{fmtDate(dispatchLastEventAt)}</span>
                  )}
                  {dispatch.tracking_number && (
                    <>
                      <span className="ml-2 text-slate-400">--</span>
                      <Link
                        href="/admin/dispatch"
                        className="ml-2 underline text-emerald-700 hover:text-emerald-900 font-mono"
                      >
                        {dispatch.tracking_number}
                      </Link>
                    </>
                  )}
                </p>
              </WiringSection>
            )}
            {pendingRefundCount > 0 && (
              <WiringSection level={wm('refund-proposal').level} note={wm('refund-proposal').note} id="refund-proposal">
                <p className="text-xs text-slate-600">
                  <span className="text-slate-400 font-semibold uppercase tracking-wide mr-2">
                    Refunds
                  </span>
                  <Link
                    href={`/admin/refunds?order=${order.id}`}
                    className="underline text-emerald-700 hover:text-emerald-900"
                  >
                    {pendingRefundCount} pending
                  </Link>
                </p>
              </WiringSection>
            )}
          </div>
        )}

        {/* Header */}
        <WiringSection level={wm('header').level} note={wm('header').note} id="header">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-3 flex-wrap mb-1">
              <h1 className="text-2xl font-bold text-slate-900">{order.order_number}</h1>
              <span
                className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border ${sMeta.cls}`}
              >
                {sMeta.label}
              </span>
              {mMeta && (
                <span className="bg-blue-50 text-blue-800 border border-blue-200 px-2.5 py-1 rounded-full text-[11px] font-semibold">
                  {mMeta.label}
                </span>
              )}
            </div>
            <p className="text-slate-500 text-sm">
              {customerEmail ?? 'unknown email'}
              {customerBusiness ? ` -- ${customerBusiness}` : ''}
              {' '}-- delivery {fmtDateOnly(order.requested_delivery_date)}
            </p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-slate-900">
              {fmtCurrency(order.grand_total, order.currency)}
            </div>
            <div className="text-xs text-slate-500">grand total</div>
          </div>
        </div>

        </WiringSection>

        <div className="grid lg:grid-cols-[1fr_320px] gap-6">
          {/* Main column */}
          <div className="space-y-6">
            {/* Dispatch + Refunds display cards collapsed to one-line summaries
                above the header (r3-cleanup, W4 follow-up). Trigger actions live
                in the right DetailActionPanel. */}

            {/* W5: EMAIL_LOG slot -- Brevo transactional events for this order. */}
            <EmailLogSection orderId={order.id} customerEmail={customerEmail} />

            {/* W5: CONVERSATIONS slot -- dispatch_communications + Brevo events interleaved. */}
            <ConversationsSection
              orderId={order.id}
              clientId={order.user_id}
              customerEmail={customerEmail}
            />

            {/* Line items */}
            <WiringSection level={wm('order-lines').level} note={wm('order-lines').note} id="order-lines">
            <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100">
                <h2 className="font-semibold text-slate-900">Line items</h2>
              </div>
              {lines.length === 0 ? (
                <p className="px-5 py-6 text-sm text-slate-400 text-center">
                  No line items on this order.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">SKU</th>
                      <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Qty</th>
                      <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Unit (locked)</th>
                      <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Line total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {lines.map((l) => {
                      const sub = [
                        l.sku_variety_snapshot,
                        l.sku_length_snapshot,
                        l.sku_unit_snapshot,
                        l.sku_vendor_snapshot,
                      ]
                        .filter(Boolean)
                        .join(' -- ');
                      return (
                        <tr key={l.id}>
                          <td className="px-5 py-3">
                            <div className="text-sm text-slate-900 font-medium">
                              {l.sku_name_snapshot}
                            </div>
                            {sub && (
                              <div className="text-xs text-slate-500 mt-0.5">{sub}</div>
                            )}
                            <div className="text-[11px] text-slate-400 mt-0.5 font-mono">
                              sku #{l.sku_id}
                            </div>
                          </td>
                          <td className="px-5 py-3 text-right text-slate-700">{l.quantity}</td>
                          <td className="px-5 py-3 text-right text-slate-700">
                            {fmtCurrency(l.unit_price_locked, l.currency)}
                          </td>
                          <td className="px-5 py-3 text-right font-semibold text-slate-900">
                            {fmtCurrency(l.line_total_locked, l.currency)}
                          </td>
                        </tr>
                      );
                    })}
                    <tr className="bg-slate-50">
                      <td colSpan={3} className="px-5 py-3 text-right text-xs font-semibold text-slate-700">
                        Subtotal
                      </td>
                      <td className="px-5 py-3 text-right text-sm text-slate-900">
                        {fmtCurrency(order.subtotal, order.currency)}
                      </td>
                    </tr>
                    {Number(order.shipping_total) > 0 && (
                      <tr className="bg-slate-50">
                        <td colSpan={3} className="px-5 py-3 text-right text-xs font-semibold text-slate-700">
                          Shipping
                        </td>
                        <td className="px-5 py-3 text-right text-sm text-slate-900">
                          {fmtCurrency(order.shipping_total, order.currency)}
                        </td>
                      </tr>
                    )}
                    {Number(order.tax_total) > 0 && (
                      <tr className="bg-slate-50">
                        <td colSpan={3} className="px-5 py-3 text-right text-xs font-semibold text-slate-700">
                          Tax
                        </td>
                        <td className="px-5 py-3 text-right text-sm text-slate-900">
                          {fmtCurrency(order.tax_total, order.currency)}
                        </td>
                      </tr>
                    )}
                    {Number(order.discount_total) > 0 && (
                      <tr className="bg-slate-50">
                        <td colSpan={3} className="px-5 py-3 text-right text-xs font-semibold text-emerald-700">
                          Discount
                        </td>
                        <td className="px-5 py-3 text-right text-sm text-emerald-700">
                          - {fmtCurrency(order.discount_total, order.currency)}
                        </td>
                      </tr>
                    )}
                    <tr className="bg-slate-100">
                      <td colSpan={3} className="px-5 py-3 text-right font-bold text-slate-900">
                        Total
                      </td>
                      <td className="px-5 py-3 text-right font-bold text-slate-900">
                        {fmtCurrency(order.grand_total, order.currency)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              )}
            </section>

            </WiringSection>

            {/* Payments ledger */}
            <WiringSection level={wm('payments-ledger').level} note={wm('payments-ledger').note} id="payments-ledger">
            <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <h2 className="font-semibold text-slate-900">Payments ledger</h2>
                <span className="text-xs text-slate-500">{payments.length} entries</span>
              </div>
              {payments.length === 0 ? (
                <p className="px-5 py-6 text-sm text-slate-400 text-center">
                  No payment events yet.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {payments.map((p) => (
                    <li key={p.id} className="px-5 py-3 text-sm">
                      <div className="flex justify-between gap-3 flex-wrap">
                        <div>
                          <p className="text-slate-900 font-medium">
                            {p.kind} -- {fmtCurrency(p.amount, p.currency)}
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {p.stripe_payment_intent_id && (
                              <span className="font-mono">pi {p.stripe_payment_intent_id.slice(-10)} </span>
                            )}
                            {p.stripe_charge_id && (
                              <span className="font-mono">-- ch {p.stripe_charge_id.slice(-10)} </span>
                            )}
                            {p.stripe_refund_id && (
                              <span className="font-mono">-- re {p.stripe_refund_id.slice(-10)} </span>
                            )}
                          </p>
                          {p.error_message && (
                            <p className="text-xs text-red-600 mt-0.5">{p.error_message}</p>
                          )}
                          {p.refund_reason && (
                            <p className="text-xs text-slate-600 mt-0.5 italic">
                              {p.refund_reason}
                            </p>
                          )}
                        </div>
                        <div className="text-right text-xs">
                          <p
                            className={
                              p.status === 'succeeded'
                                ? 'text-emerald-700 font-semibold'
                                : p.status === 'failed'
                                ? 'text-red-700 font-semibold'
                                : 'text-slate-500'
                            }
                          >
                            {p.status}
                          </p>
                          <p className="text-slate-400 mt-0.5">
                            {fmtDate(p.processed_at ?? p.created_at)}
                          </p>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            </WiringSection>

            {/* Timeline */}
            <WiringSection level={wm('timeline').level} note={wm('timeline').note} id="timeline">
            <section className="bg-white rounded-2xl border border-slate-200 p-5">
              <h2 className="font-semibold text-slate-900 mb-3">Timeline</h2>
              <ol className="space-y-2">
                {timeline.map((t, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm">
                    <span
                      className={`mt-1 w-2 h-2 rounded-full shrink-0 ${
                        t.kind === 'done' ? 'bg-emerald-500' : t.kind === 'warn' ? 'bg-amber-500' : 'bg-slate-300'
                      }`}
                    />
                    <div className="flex-1">
                      <p className="text-slate-800">{t.label}</p>
                      <p className="text-xs text-slate-400">{fmtDate(t.at)}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
            </WiringSection>
          </div>

          {/* Sidebar */}
          <aside className="space-y-4">
            <DetailActionPanel
              title="Order actions"
              subtitle={`Status: ${order.status}`}
            >
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold mb-1">
                  Dispatch
                </p>
                <InitDispatchButton orderId={order.id} hasDispatch={!!dispatch} />
              </div>
              <div className="border-t border-slate-100 pt-3">
                <p className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold mb-1">
                  Refund
                </p>
                {canTriggerRefund ? (
                  <RefundProposalForm
                    orderId={order.id}
                    orderNumber={order.order_number}
                    grandTotal={grandTotalNum}
                    currency={order.currency}
                  />
                ) : (
                  <p className="text-[11px] text-slate-500 italic">
                    {refundProposals.length > 0 || approvals.filter((a) => a.status === 'pending').length > 0
                      ? 'A refund is already in flight (see Refunds card on the left).'
                      : `Cannot trigger refund for status "${order.status}".`}
                  </p>
                )}
              </div>
            </DetailActionPanel>

            <SidebarCard title="Customer">
              <p className="text-sm text-slate-900 font-medium">
                {customerEmail ?? <span className="italic text-slate-400">unknown email</span>}
              </p>
              {customerBusiness && (
                <p className="text-xs text-slate-500 mt-1">{customerBusiness}</p>
              )}
              <p className="text-[11px] text-slate-400 font-mono mt-2" title={order.user_id}>
                user {order.user_id.slice(0, 8)}...
              </p>
            </SidebarCard>

            <SidebarCard title="Payment mode">
              {mMeta ? (
                <>
                  <p className="text-sm text-slate-800 font-semibold">{mMeta.label}</p>
                  <p className="text-xs text-slate-500 mt-1">{mMeta.explain}</p>
                </>
              ) : (
                <p className="text-sm text-slate-500">--</p>
              )}
              <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-500 space-y-1">
                <Row label="Preauth scheduled" value={fmtDate(order.scheduled_preauth_at)} />
                <Row label="Charge scheduled" value={fmtDate(order.scheduled_charge_at)} />
                <Row label="Paid at" value={fmtDate(order.paid_at)} />
              </div>
              <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-500 space-y-1 font-mono break-all">
                {order.stripe_customer_id && (
                  <p>cus {order.stripe_customer_id.slice(-10)}</p>
                )}
                {order.stripe_setup_intent_id && (
                  <p>seti {order.stripe_setup_intent_id.slice(-10)}</p>
                )}
                {order.stripe_payment_method_id && (
                  <p>pm {order.stripe_payment_method_id.slice(-10)}</p>
                )}
              </div>
            </SidebarCard>

            <WiringSection level={wm('addresses').level} note={wm('addresses').note} id="addresses">
            <SidebarCard title="Shipping address">
              {shipping ? (
                <AddressBlock snap={shipping} />
              ) : (
                <p className="text-sm text-slate-400 italic">No shipping address on file.</p>
              )}
            </SidebarCard>

            <SidebarCard title="Billing address">
              {billing ? (
                <AddressBlock snap={billing} />
              ) : (
                <p className="text-sm text-slate-400 italic">No billing address on file.</p>
              )}
            </SidebarCard>
            </WiringSection>

            <WiringSection level={wm('invoice').level} note={wm('invoice').note} id="invoice">
            <SidebarCard title="Invoice">
              {invoice ? (
                <div className="text-sm space-y-2">
                  <p className="text-slate-900 font-semibold">{invoice.invoice_number}</p>
                  <p className="text-xs text-slate-500">
                    Issued {fmtDateOnly(invoice.issued_at)} -- total{' '}
                    {fmtCurrency(invoice.grand_total, invoice.currency)}
                  </p>
                  {invoice.voided && (
                    <p className="text-xs text-red-600 font-semibold">VOIDED</p>
                  )}
                  {invoice.pdf_url ? (
                    <a
                      href={invoice.pdf_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block text-xs font-semibold text-emerald-700 hover:text-emerald-900 border border-emerald-300 hover:border-emerald-500 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      Download PDF
                    </a>
                  ) : invoice.pdf_storage_path ? (
                    <a
                      href={`/api/invoices/${invoice.id}/download`}
                      className="inline-block text-xs font-semibold text-emerald-700 hover:text-emerald-900 border border-emerald-300 hover:border-emerald-500 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      Download PDF
                    </a>
                  ) : (
                    <p className="text-xs text-slate-400 italic">PDF not generated yet.</p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-slate-400 italic">
                  Invoice generates after payment clears.
                </p>
              )}
            </SidebarCard>
            </WiringSection>

            <SidebarCard title="Notes">
              {order.customer_note && (
                <>
                  <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">
                    Customer
                  </p>
                  <p className="text-sm text-slate-700 mb-3">{order.customer_note}</p>
                </>
              )}
              {order.internal_note && (
                <>
                  <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">
                    Internal
                  </p>
                  <p className="text-sm text-slate-700">{order.internal_note}</p>
                </>
              )}
              {!order.customer_note && !order.internal_note && (
                <p className="text-sm text-slate-400 italic">No notes.</p>
              )}
            </SidebarCard>
          </aside>
        </div>

        <p className="text-xs text-slate-400 mt-8">
          Data source: supabase-backup orders / order_lines / payments /
          refund_approvals / invoices / addresses, plus admin_proposals for
          pending refund.create proposals. Refund button posts to
          /api/admin/proposals; approval today goes through
          /admin/catalog/approval-queue but the refund.create executor is a
          TODO stub.
        </p>
      </main>
    </>
  );
}

// ---------------------------------------------------------------------------
// Helpers / subcomponents
// ---------------------------------------------------------------------------

function addressToSnap(a: AddressRow | undefined): ShippingSnap | null {
  if (!a) return null;
  return {
    recipient_name: a.recipient_name,
    business_name: a.business_name,
    phone: a.phone,
    line1: a.line1,
    line2: a.line2,
    city: a.city,
    state: a.state,
    postal_code: a.postal_code,
    country: a.country,
  };
}

interface TimelineEvent {
  at: string;
  label: string;
  kind: 'done' | 'pending' | 'warn';
}

function buildTimeline(
  order: OrderRow,
  payments: PaymentRow[],
  approvals: RefundApprovalRow[],
): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  events.push({ at: order.created_at, label: 'Order created', kind: 'done' });
  if (order.submitted_at) {
    events.push({ at: order.submitted_at, label: 'Order submitted by customer', kind: 'done' });
  }
  if (order.scheduled_preauth_at) {
    events.push({
      at: order.scheduled_preauth_at,
      label: 'Preauth scheduled',
      kind: new Date(order.scheduled_preauth_at) < new Date() ? 'done' : 'pending',
    });
  }
  if (order.scheduled_charge_at) {
    events.push({
      at: order.scheduled_charge_at,
      label: 'Full charge scheduled',
      kind: new Date(order.scheduled_charge_at) < new Date() ? 'done' : 'pending',
    });
  }
  for (const p of payments) {
    const labelBase =
      p.kind === 'preauth'
        ? 'Preauth'
        : p.kind === 'full_charge'
        ? 'Full charge'
        : p.kind === 'capture'
        ? 'Captured'
        : p.kind === 'refund'
        ? 'Refund'
        : p.kind === 'void'
        ? 'Void'
        : p.kind;
    const kind: TimelineEvent['kind'] =
      p.status === 'succeeded' ? 'done' : p.status === 'failed' ? 'warn' : 'pending';
    events.push({
      at: p.processed_at ?? p.created_at,
      label: `${labelBase} ${p.status}`,
      kind,
    });
  }
  if (order.paid_at) {
    events.push({ at: order.paid_at, label: 'Order marked paid', kind: 'done' });
  }
  if (order.fulfilled_at) {
    events.push({ at: order.fulfilled_at, label: 'Fulfilled (delivered to florist)', kind: 'done' });
  }
  if (order.cancelled_at) {
    events.push({ at: order.cancelled_at, label: 'Order cancelled', kind: 'warn' });
  }
  for (const a of approvals) {
    events.push({
      at: a.created_at,
      label: `Refund approval requested (${a.status})`,
      kind: a.status === 'executed' ? 'done' : a.status === 'rejected' ? 'warn' : 'pending',
    });
  }
  // Sort chronologically
  return events.sort((x, y) => new Date(x.at).getTime() - new Date(y.at).getTime());
}

function SidebarCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5">
      <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
        {title}
      </h3>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span>{label}</span>
      <span className="text-slate-700">{value}</span>
    </div>
  );
}

function AddressBlock({ snap }: { snap: ShippingSnap }) {
  return (
    <address className="not-italic text-sm text-slate-800 leading-relaxed">
      {snap.recipient_name && <div className="font-medium">{snap.recipient_name}</div>}
      {snap.business_name && <div className="text-slate-600">{snap.business_name}</div>}
      {snap.line1 && <div>{snap.line1}</div>}
      {snap.line2 && <div>{snap.line2}</div>}
      {(snap.city || snap.state || snap.postal_code) && (
        <div>
          {[snap.city, snap.state].filter(Boolean).join(', ')} {snap.postal_code ?? ''}
        </div>
      )}
      {snap.country && snap.country !== 'US' && <div>{snap.country}</div>}
      {snap.phone && <div className="text-slate-500 mt-1">{snap.phone}</div>}
    </address>
  );
}
