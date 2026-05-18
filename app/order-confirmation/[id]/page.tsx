// Order Confirmation page — /order-confirmation/[id]
// v1 | 2026-05-17 | Job_PM W4-S12 [V8 SHADOW]
// Server-side rendered, reads orders + lines + addresses + payments + invoices
// from supabase-backup via service-role client. Auth check enforced in code
// (must be the order owner OR an admin per client_profiles.status='admin').
//
// Cross-project user_id note: assumes W4-S11 drops the FK orders.user_id -> auth.users
// because auth lives in the prod Supabase project while orders live in supabase-backup.
// We do NOT recreate it. Filtering happens via service-role SELECT WHERE user_id = <uid>.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import Link from 'next/link';
import Image from 'next/image';
import { notFound, redirect } from 'next/navigation';

import { createBackupServerClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';
import { getProductImage } from '@/lib/product-images';
import Navigation from '@/components/Navigation';
import Footer from '@/components/Footer';
import TopBanner from '@/components/TopBanner';

export const metadata = {
  title: 'Order Confirmation | Floropolis',
  description: 'Order details, payment status, and invoice download.',
};

// ============================================================================
// Types (loose — Supabase rows)
// ============================================================================
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

interface OrderRow {
  id: number;
  user_id: string;
  order_number: string;
  status: OrderStatus;
  payment_mode: PaymentMode;
  requested_delivery_date: string;
  scheduled_preauth_at: string | null;
  scheduled_charge_at: string | null;
  currency: string;
  subtotal: number | string;
  shipping_total: number | string;
  tax_total: number | string;
  discount_total: number | string;
  grand_total: number | string;
  shipping_address_snapshot: ShippingSnap | null;
  billing_address_snapshot: ShippingSnap | null;
  customer_note: string | null;
  submitted_at: string | null;
  created_at: string;
  paid_at: string | null;
}

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
}

interface PaymentRow {
  id: number;
  kind: string;
  status: string;
  amount: number | string;
  currency: string;
  stripe_payment_intent_id: string | null;
  stripe_charge_id: string | null;
  stripe_payment_method_id: string | null;
  error_message: string | null;
  created_at: string;
  processed_at: string | null;
}

interface InvoiceRow {
  id: number;
  invoice_number: string;
  pdf_url: string | null;
  pdf_storage_path: string | null;
  issued_at: string;
}

// ============================================================================
// Helpers
// ============================================================================
const STATUS_META: Record<OrderStatus, { label: string; cls: string }> = {
  cart:             { label: 'Cart',             cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  pending_payment:  { label: 'Pending payment',  cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  card_saved:       { label: 'Card saved',       cls: 'bg-blue-50 text-blue-800 border-blue-200' },
  preauth_held:     { label: 'Preauth held',     cls: 'bg-blue-50 text-blue-800 border-blue-200' },
  paid:             { label: 'Paid',             cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  fulfilled:        { label: 'Fulfilled',        cls: 'bg-emerald-50 text-emerald-900 border-emerald-300' },
  failed:           { label: 'Failed',           cls: 'bg-red-50 text-red-800 border-red-200' },
  cancelled:        { label: 'Cancelled',        cls: 'bg-slate-100 text-slate-500 border-slate-200' },
  refunded:         { label: 'Refunded',         cls: 'bg-slate-100 text-slate-500 border-slate-200' },
};

function fmtCurrency(value: number | string, currency = 'USD'): string {
  const n = typeof value === 'string' ? parseFloat(value) : value;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n);
}

function fmtDate(iso: string | null | undefined, opts?: Intl.DateTimeFormatOptions): string {
  if (!iso) return '--';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--';
  return new Intl.DateTimeFormat('en-US', opts ?? {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  }).format(d);
}

function fmtDateOnly(iso: string | null | undefined): string {
  return fmtDate(iso, { year: 'numeric', month: 'short', day: 'numeric' });
}

function paymentModeExplain(order: OrderRow): string {
  const delivery = fmtDateOnly(order.requested_delivery_date);
  const charge = fmtDateOnly(order.scheduled_charge_at) || delivery;
  const preauth = fmtDateOnly(order.scheduled_preauth_at);
  switch (order.payment_mode) {
    case 'mode_a':
      return `Card saved. Preauth scheduled for ${preauth}. Full charge on ${charge}.`;
    case 'mode_b':
      return `$1 verification held. Full charge on ${charge}.`;
    case 'mode_c':
      return `Card charged on ${fmtDateOnly(order.paid_at) || charge || delivery}.`;
    default:
      return '';
  }
}

function inferImage(line: OrderLineRow): string {
  // sku_name_snapshot looks like "Roses Free Spirit 50CM - Ecoroses ECU"
  // We try to feed variety + name parts into the image resolver.
  const variety = line.sku_variety_snapshot ?? '';
  const name = line.sku_name_snapshot ?? '';
  // First word of name is the category (e.g. "Roses", "Anemone")
  const category = name.split(/\s+/)[0] || '';
  return getProductImage(variety || name, '', category);
}

// ============================================================================
// Page
// ============================================================================
export default async function OrderConfirmationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const orderIdNum = Number(id);
  if (!Number.isFinite(orderIdNum) || orderIdNum <= 0) notFound();

  // ---- Auth (BACKUP session -- Phase 4 SEGURISIMA) ----
  const userClient = await createBackupServerClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) {
    redirect(`/auth/login?next=/order-confirmation/${id}`);
  }

  // Check admin status from BACKUP project (client_profiles lives in backup).
  const { data: profile } = await userClient
    .from('client_profiles')
    .select('status')
    .eq('user_id', user.id)
    .maybeSingle();
  const isAdmin = profile?.status === 'admin';

  // ---- Reads from supabase-backup (orders/lines/addresses/payments/invoices) ----
  const backup = getBackupServiceClient();

  const { data: order, error: orderErr } = await backup
    .from('orders')
    .select(`
      id, user_id, order_number, status, payment_mode,
      requested_delivery_date, scheduled_preauth_at, scheduled_charge_at,
      currency, subtotal, shipping_total, tax_total, discount_total, grand_total,
      shipping_address_snapshot, billing_address_snapshot,
      customer_note, submitted_at, created_at, paid_at
    `)
    .eq('id', orderIdNum)
    .maybeSingle();

  if (orderErr) {
    console.error('[order-confirmation] order fetch failed:', orderErr);
  }
  if (!order) notFound();

  // Ownership / admin gate
  if (order.user_id !== user.id && !isAdmin) {
    notFound();
  }

  const o = order as OrderRow;

  // Lines, payments, invoice in parallel
  const [linesRes, paymentsRes, invoiceRes] = await Promise.all([
    backup
      .from('order_lines')
      .select(`
        id, sku_id, sku_name_snapshot, sku_variety_snapshot,
        sku_length_snapshot, sku_unit_snapshot, sku_vendor_snapshot,
        quantity, unit_price_locked, line_total_locked
      `)
      .eq('order_id', orderIdNum)
      .order('id', { ascending: true }),
    backup
      .from('payments')
      .select(`
        id, kind, status, amount, currency,
        stripe_payment_intent_id, stripe_charge_id, stripe_payment_method_id,
        error_message, created_at, processed_at
      `)
      .eq('order_id', orderIdNum)
      .order('created_at', { ascending: false })
      .limit(5),
    backup
      .from('invoices')
      .select('id, invoice_number, pdf_url, pdf_storage_path, issued_at')
      .eq('order_id', orderIdNum)
      .maybeSingle(),
  ]);

  const lines = (linesRes.data ?? []) as OrderLineRow[];
  const payments = (paymentsRes.data ?? []) as PaymentRow[];
  const invoice = (invoiceRes.data ?? null) as InvoiceRow | null;

  // Latest payment_method id (for last4 lookup — we only have the id; show ending)
  const paymentMethodId =
    payments.find((p) => p.stripe_payment_method_id)?.stripe_payment_method_id ?? null;
  // We don't have last4 in payments table; show short suffix of the pm id as a stable hint.
  // Once W4 wires pm.card.last4 into payments, swap to that field.
  const pmTail = paymentMethodId ? paymentMethodId.slice(-4).toUpperCase() : null;

  const statusMeta = STATUS_META[o.status] ?? STATUS_META.pending_payment;
  const ship = o.shipping_address_snapshot ?? null;

  const waPrefill = `Hi, I have a question about order ${o.order_number}`;
  const waUrl = `https://wa.me/16452405203?text=${encodeURIComponent(waPrefill)}`;

  return (
    <div className="min-h-screen bg-white">
      <TopBanner />
      <Navigation />

      <main className="max-w-3xl mx-auto px-4 py-10">
        {/* Header */}
        <div className="mb-6">
          <Link
            href="/account/orders"
            className="text-sm text-slate-500 hover:text-slate-800 inline-flex items-center gap-1.5 mb-4"
          >
            <span aria-hidden="true">&larr;</span> My orders
          </Link>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                Order {o.order_number}
              </h1>
              <p className="text-slate-500 text-sm mt-1">
                Submitted {fmtDate(o.submitted_at ?? o.created_at)}
              </p>
            </div>
            <span
              className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold border ${statusMeta.cls}`}
            >
              {statusMeta.label}
            </span>
          </div>
        </div>

        {/* Payment mode card */}
        <section className="bg-white rounded-2xl border border-slate-200 p-5 mb-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
            Payment plan
          </p>
          <p className="text-sm text-slate-800">{paymentModeExplain(o)}</p>
          <p className="text-xs text-slate-400 mt-2">
            Requested delivery: {fmtDateOnly(o.requested_delivery_date)}
          </p>
        </section>

        {/* Line items */}
        <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden mb-5">
          <div className="px-5 py-4 border-b border-slate-100">
            <p className="text-sm font-semibold text-slate-800">Items</p>
          </div>
          <div className="divide-y divide-slate-100">
            {lines.map((line) => {
              const img = inferImage(line);
              const unit = Number(line.unit_price_locked);
              const total = Number(line.line_total_locked);
              return (
                <div key={line.id} className="px-5 py-4 flex gap-4 items-center">
                  <div className="relative w-16 h-16 shrink-0 rounded-lg overflow-hidden bg-slate-50 border border-slate-100">
                    {img ? (
                      <Image
                        src={img}
                        alt={line.sku_name_snapshot}
                        fill
                        sizes="64px"
                        className="object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-2xl">
                        <span aria-hidden="true">FL</span>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">
                      {line.sku_name_snapshot}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {[line.sku_variety_snapshot, line.sku_length_snapshot, line.sku_unit_snapshot]
                        .filter(Boolean)
                        .join(' &middot; ')}
                    </p>
                  </div>
                  <div className="text-right shrink-0 w-24">
                    <p className="text-sm text-slate-700">
                      {line.quantity} &times; {fmtCurrency(unit, o.currency)}
                    </p>
                    <p className="text-sm font-semibold text-slate-900">
                      {fmtCurrency(total, o.currency)}
                    </p>
                  </div>
                </div>
              );
            })}
            {lines.length === 0 && (
              <div className="px-5 py-6 text-center text-sm text-slate-400">
                No line items found on this order.
              </div>
            )}
          </div>

          {/* Totals */}
          <div className="px-5 py-4 bg-slate-50 border-t border-slate-100 space-y-1.5">
            <div className="flex justify-between text-sm text-slate-600">
              <span>Subtotal</span>
              <span>{fmtCurrency(o.subtotal, o.currency)}</span>
            </div>
            <div className="flex justify-between text-sm text-slate-600">
              <span>Shipping</span>
              <span>Included</span>
            </div>
            <div className="flex justify-between text-sm text-slate-600">
              <span>Tax</span>
              <span>{fmtCurrency(o.tax_total, o.currency)}</span>
            </div>
            {Number(o.discount_total) > 0 && (
              <div className="flex justify-between text-sm text-emerald-700">
                <span>Discount</span>
                <span>- {fmtCurrency(o.discount_total, o.currency)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold text-slate-900 pt-2 border-t border-slate-200 mt-2">
              <span>Total</span>
              <span>{fmtCurrency(o.grand_total, o.currency)}</span>
            </div>
          </div>
        </section>

        {/* Shipping + payment side-by-side */}
        <div className="grid sm:grid-cols-2 gap-4 mb-5">
          <section className="bg-white rounded-2xl border border-slate-200 p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
              Shipping to
            </p>
            {ship ? (
              <address className="not-italic text-sm text-slate-800 leading-relaxed">
                {ship.recipient_name && <div className="font-medium">{ship.recipient_name}</div>}
                {ship.business_name && <div className="text-slate-600">{ship.business_name}</div>}
                {ship.line1 && <div>{ship.line1}</div>}
                {ship.line2 && <div>{ship.line2}</div>}
                {(ship.city || ship.state || ship.postal_code) && (
                  <div>
                    {[ship.city, ship.state].filter(Boolean).join(', ')} {ship.postal_code ?? ''}
                  </div>
                )}
                {ship.country && ship.country !== 'US' && <div>{ship.country}</div>}
                {ship.phone && <div className="text-slate-500 mt-1">{ship.phone}</div>}
              </address>
            ) : (
              <p className="text-sm text-slate-400">No shipping address on file.</p>
            )}
          </section>

          <section className="bg-white rounded-2xl border border-slate-200 p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
              Payment method
            </p>
            {pmTail ? (
              <p className="text-sm text-slate-800">
                Card ending in <span className="font-mono font-semibold">**** {pmTail}</span>
              </p>
            ) : (
              <p className="text-sm text-slate-500">Pending</p>
            )}
            {o.customer_note && (
              <>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mt-4 mb-1">
                  Note
                </p>
                <p className="text-sm text-slate-700">{o.customer_note}</p>
              </>
            )}
          </section>
        </div>

        {/* Status timeline */}
        {payments.length > 0 && (
          <section className="bg-white rounded-2xl border border-slate-200 p-5 mb-5">
            <p className="text-sm font-semibold text-slate-800 mb-3">Payment timeline</p>
            <ol className="space-y-3">
              {payments.map((p) => {
                const amt = Number(p.amount);
                const label =
                  p.kind === 'preauth' && amt <= 1
                    ? `Preauth ${fmtCurrency(amt, p.currency)}`
                    : p.kind === 'preauth'
                    ? `Preauth hold ${fmtCurrency(amt, p.currency)}`
                    : p.kind === 'full_charge'
                    ? `Full charge ${fmtCurrency(amt, p.currency)}`
                    : p.kind === 'refund'
                    ? `Refund ${fmtCurrency(amt, p.currency)}`
                    : p.kind === 'capture'
                    ? `Captured ${fmtCurrency(amt, p.currency)}`
                    : `${p.kind} ${fmtCurrency(amt, p.currency)}`;
                const statusCls =
                  p.status === 'succeeded'
                    ? 'text-emerald-700'
                    : p.status === 'failed'
                    ? 'text-red-700'
                    : 'text-slate-500';
                return (
                  <li key={p.id} className="flex justify-between text-sm gap-3">
                    <div className="min-w-0">
                      <p className="text-slate-800">{label}</p>
                      <p className="text-xs text-slate-400">
                        {fmtDate(p.processed_at ?? p.created_at)}
                      </p>
                      {p.error_message && (
                        <p className="text-xs text-red-600 mt-0.5">{p.error_message}</p>
                      )}
                    </div>
                    <span className={`text-xs font-semibold uppercase tracking-wide ${statusCls}`}>
                      {p.status}
                    </span>
                  </li>
                );
              })}
            </ol>
          </section>
        )}

        {/* CTA bar */}
        <div className="flex flex-wrap gap-3 mb-8">
          <Link
            href="/shop"
            className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-semibold text-sm hover:border-slate-400 transition-colors"
          >
            Back to shop
          </Link>
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white font-semibold text-sm hover:bg-emerald-700 transition-colors"
          >
            Contact us
          </a>
          {invoice && (invoice.pdf_url || invoice.pdf_storage_path) ? (
            <a
              href={invoice.pdf_url ?? `/api/invoices/${invoice.id}/download`}
              className="px-5 py-2.5 rounded-xl border border-emerald-300 text-emerald-700 font-semibold text-sm hover:border-emerald-500 transition-colors"
            >
              Download invoice
            </a>
          ) : (
            <span className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-400 text-sm">
              Invoice generates after payment clears
            </span>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
