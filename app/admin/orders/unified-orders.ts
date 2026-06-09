// Unified order list -- wired to public.v_unified_orders (PROD, read-only).
// v2 | 2026-06-09 | Job_PM order-visibility #3 (mockup-match rebuild)
//
// Capability #3 = ORDER VISIBILITY: one admin surface where every order across
// every source is merged into one row shape. THE combined source is the PROD
// view public.v_unified_orders -- it already merges the orders we create
// (channel A = web/quote funnel) and the ones we closed (channel B = K2K
// prebooks/invoices). We do NOT re-merge tables here anymore; the view is the
// single source of truth.
//
// Client dimension comes from public.v_customer_360 (44k rows), joined in JS
// by komet_customer_id == v_unified_orders.customer_code, with a
// case-insensitive contact_name fallback (best available link: ~12/36 today).
//
// HONESTY RULES (encoded here, surfaced in the UI):
//   - All access is READ-ONLY via getProdReadClient(). No writes, ever.
//   - If the PROD read client is unconfigured OR the view errors, the page
//     degrades to a labeled empty state -- never crashes, never fabricates.
//   - Money: prebook_amt is the reliable amount across both channels
//     (ui_total_price / total_with_surcharges are null today). We fall back
//     invoice_amt -> origin_quote_amt -> prebook_amt and label provenance.
//   - Row counts shown are the real counts we read from the view.

import { getProdReadClient, isProdReadConfigured } from '@/lib/supabase/prod-server';

// Read at most this many rows. Visibility surface, not export.
export const ROW_CAP = 500;

// channel A = orders we create (web / quote funnel, Mode A)
// channel B = orders we closed (K2K prebooks + invoices, Mode B)
export type Channel = 'A' | 'B';

export const CHANNEL_META: Record<Channel, { label: string; cls: string }> = {
  A: { label: 'Web / quote', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  B: { label: 'K2K closed', cls: 'bg-slate-100 text-slate-700 border-slate-200' },
};

// Normalized lifecycle buckets the mockup tabs filter on.
//   upcoming  = live + not yet charged/confirmed (actionable)
//   confirmed = invoice confirmed / charge scheduled
//   dispatched= shipped (tracking present)
//   issues    = payment failed / declined / cart abandoned (needs a human)
//   cancelled = void / declined
export type Bucket =
  | 'upcoming'
  | 'confirmed'
  | 'dispatched'
  | 'issues'
  | 'cancelled'
  | 'other';

export const BUCKET_BADGE: Record<Bucket, { label: string; variant: BadgeVariant }> = {
  upcoming: { label: 'Pending review', variant: 'pending_review' },
  confirmed: { label: 'Confirmed', variant: 'confirmed' },
  dispatched: { label: 'Dispatched', variant: 'dispatched' },
  issues: { label: 'Payment issue', variant: 'payment_failed' },
  cancelled: { label: 'Cancelled', variant: 'cancelled' },
  other: { label: 'Open', variant: 'pending' },
};

// Mirrors the StatusBadge variant union (app/admin/orders/_StatusBadge).
export type BadgeVariant =
  | 'pending'
  | 'pending_review'
  | 'confirmed'
  | 'dispatched'
  | 'payment_failed'
  | 'cancelled';

export interface ClientDim {
  businessName: string | null;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  totalSales: number | null;
  totalRevenueUsd: number | null;
  lastTxnAt: string | null;
  churnStatus: string | null;
  /** How this client row was matched to the order. */
  matchedBy: 'komet' | 'name' | null;
}

export interface UnifiedOrder {
  /** Stable React key: `${orderType}:${ref}`. */
  key: string;
  channel: Channel;
  /** prebook | quote (native order_type). */
  orderType: string | null;
  ref: string;
  customerName: string | null;
  customerCode: string | null;
  /** Primary amount (USD) + where it came from. */
  amount: number | null;
  amountSource: 'invoice' | 'quote' | 'prebook' | null;
  /** ISO timestamps / dates. */
  createdAt: string | null;
  deliveryDate: string | null;
  /** Raw native statuses (shown verbatim in detail). */
  paymentStatus: string | null;
  invoiceStatus: string | null;
  prebookStatus: string | null;
  checkOutStatus: string | null;
  /** Normalized bucket for tab filtering. */
  bucket: Bucket;
  trackingNumber: string | null;
  carrierName: string | null;
  shipCity: string | null;
  shipState: string | null;
  shipAddress: string | null;
  k2kOrderId: string | null;
  internalNotes: string | null;
  isEcommerce: boolean;
  /** Joined client dimension (null when no match). */
  client: ClientDim | null;
}

export interface UnifiedResult {
  rows: UnifiedOrder[];
  /** Total real rows read from the view (pre-filter). */
  total: number;
  /** Counts per normalized bucket (for KPI tiles). */
  bucketCounts: Record<Bucket, number>;
  /** Non-null when the surface could not read its source. */
  error: string | null;
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

function toNum(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : null;
}

// Bucket from the combination of native statuses. payment_status is the most
// expressive column the view exposes; we lean on it, then refine with tracking.
function normBucket(o: {
  paymentStatus: string | null;
  trackingNumber: string | null;
  invoiceStatus: string | null;
}): Bucket {
  const p = (o.paymentStatus ?? '').toLowerCase();
  if (o.trackingNumber) return 'dispatched';
  switch (p) {
    case 'declined':
      return 'cancelled';
    case 'cart_abandoned':
      return 'issues';
    case 'confirmed':
    case 'converted':
      return 'confirmed';
    case 'pending_validation':
    case 'quote_new':
    case 'no_invoice':
      return 'upcoming';
    default:
      return 'other';
  }
}

function pickAmount(r: Record<string, unknown>): { amount: number | null; src: 'invoice' | 'quote' | 'prebook' | null } {
  const invoice = toNum(r.invoice_amt as number | string | null);
  if (invoice != null) return { amount: invoice, src: 'invoice' };
  const quote = toNum(r.origin_quote_amt as number | string | null);
  if (quote != null) return { amount: quote, src: 'quote' };
  const prebook = toNum(r.prebook_amt as number | string | null);
  if (prebook != null) return { amount: prebook, src: 'prebook' };
  return { amount: null, src: null };
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

const ORDER_COLS =
  'channel, order_type, ref, customer_name, customer_code, created_at, delivery_date, ' +
  'prebook_amt, ui_total_price, total_with_surcharges, invoice_amt, origin_quote_amt, ' +
  'check_out_status, prebook_status, invoice_status, payment_status, is_ecommerce, ' +
  'carrier_name, ship_city, ship_state, ship_address, k2k_order_id, tracking_number, internal_notes';

const CUSTOMER_COLS =
  'business_name, contact_name, email, phone, city, state, country, komet_customer_id, ' +
  'total_sales, total_revenue_usd, last_txn_at, churn_status';

interface CustomerRaw {
  business_name: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  komet_customer_id: string | null;
  total_sales: number | string | null;
  total_revenue_usd: number | string | null;
  last_txn_at: string | null;
  churn_status: string | null;
}

function toClientDim(c: CustomerRaw, matchedBy: 'komet' | 'name'): ClientDim {
  return {
    businessName: c.business_name,
    contactName: c.contact_name,
    email: c.email,
    phone: c.phone,
    city: c.city,
    state: c.state,
    country: c.country,
    totalSales: toNum(c.total_sales),
    totalRevenueUsd: toNum(c.total_revenue_usd),
    lastTxnAt: c.last_txn_at,
    churnStatus: c.churn_status,
    matchedBy,
  };
}

const EMPTY_BUCKETS: Record<Bucket, number> = {
  upcoming: 0,
  confirmed: 0,
  dispatched: 0,
  issues: 0,
  cancelled: 0,
  other: 0,
};

export async function getUnifiedOrders(): Promise<UnifiedResult> {
  const prod = getProdReadClient();
  if (prod === null || !isProdReadConfigured()) {
    return {
      rows: [],
      total: 0,
      bucketCounts: { ...EMPTY_BUCKETS },
      error: 'production read client not configured (PROD_SUPABASE_* env missing)',
    };
  }

  // 1) The combined orders view -- THE source of truth.
  const { data: orderData, error: orderErr } = await prod
    .from('v_unified_orders')
    .select(ORDER_COLS)
    .order('created_at', { ascending: false, nullsFirst: false })
    .limit(ROW_CAP);

  if (orderErr) {
    return { rows: [], total: 0, bucketCounts: { ...EMPTY_BUCKETS }, error: orderErr.message };
  }
  const raw = (orderData ?? []) as unknown as Record<string, unknown>[];

  // 2) Client dimension. Pull the small set of customers we actually need:
  //    by komet_customer_id (== customer_code) and by contact_name.
  const codes = Array.from(
    new Set(raw.map((r) => (r.customer_code as string | null) ?? '').filter(Boolean)),
  );
  const origNames = Array.from(
    new Set(
      raw
        .map((r) => (r.customer_name as string | null)?.trim() ?? '')
        .filter(Boolean),
    ),
  );

  const byKomet = new Map<string, CustomerRaw>();
  const byName = new Map<string, CustomerRaw>();

  // Failure to read customers must NOT sink the orders -- degrade gracefully.
  try {
    if (codes.length) {
      const { data } = await prod
        .from('v_customer_360')
        .select(CUSTOMER_COLS)
        .in('komet_customer_id', codes)
        .limit(ROW_CAP);
      for (const c of (data ?? []) as unknown as CustomerRaw[]) {
        if (c.komet_customer_id) byKomet.set(c.komet_customer_id, c);
      }
    }
    if (origNames.length) {
      // v_customer_360 has no lowercased name column; fetch by original-cased
      // contact_name then index lowercased in JS for the join.
      const { data } = await prod
        .from('v_customer_360')
        .select(CUSTOMER_COLS)
        .in('contact_name', origNames)
        .limit(ROW_CAP);
      for (const c of (data ?? []) as unknown as CustomerRaw[]) {
        const k = (c.contact_name ?? '').trim().toLowerCase();
        if (k && !byName.has(k)) byName.set(k, c);
      }
    }
  } catch {
    // leave maps empty; client dimension simply renders as "no match"
  }

  // 3) Normalize + join.
  const rows: UnifiedOrder[] = raw.map((r) => {
    const channel = ((r.channel as string | null) ?? 'A') === 'B' ? 'B' : 'A';
    const orderType = (r.order_type as string | null) ?? null;
    const ref = String(r.ref ?? '');
    const code = (r.customer_code as string | null) ?? null;
    const name = (r.customer_name as string | null) ?? null;
    const paymentStatus = (r.payment_status as string | null) ?? null;
    const trackingNumber = (r.tracking_number as string | null) ?? null;
    const invoiceStatus = (r.invoice_status as string | null) ?? null;
    const { amount, src } = pickAmount(r);

    let client: ClientDim | null = null;
    if (code && byKomet.has(code)) {
      client = toClientDim(byKomet.get(code)!, 'komet');
    } else if (name) {
      const c = byName.get(name.trim().toLowerCase());
      if (c) client = toClientDim(c, 'name');
    }

    return {
      key: `${orderType ?? 'order'}:${ref}`,
      channel,
      orderType,
      ref,
      customerName: name,
      customerCode: code,
      amount,
      amountSource: src,
      createdAt: (r.created_at as string | null) ?? null,
      deliveryDate: (r.delivery_date as string | null) ?? null,
      paymentStatus,
      invoiceStatus,
      prebookStatus: (r.prebook_status as string | null) ?? null,
      checkOutStatus: (r.check_out_status as string | null) ?? null,
      bucket: normBucket({ paymentStatus, trackingNumber, invoiceStatus }),
      trackingNumber,
      carrierName: (r.carrier_name as string | null) ?? null,
      shipCity: (r.ship_city as string | null) ?? null,
      shipState: (r.ship_state as string | null) ?? null,
      shipAddress: (r.ship_address as string | null) ?? null,
      k2kOrderId: (r.k2k_order_id as string | null) ?? null,
      internalNotes: (r.internal_notes as string | null) ?? null,
      isEcommerce: Boolean(r.is_ecommerce),
      client,
    };
  });

  const bucketCounts = { ...EMPTY_BUCKETS };
  for (const r of rows) bucketCounts[r.bucket] += 1;

  return { rows, total: rows.length, bucketCounts, error: null };
}
