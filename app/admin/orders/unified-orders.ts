// Unified order list -- fetch + normalize across BOTH Supabase planes.
// v1 | 2026-06-08 | Job_PM order-visibility #3
//
// Capability #3 = ORDER VISIBILITY: one admin surface where every order across
// every source is merged into one row shape. This module does the data work;
// app/admin/orders/page.tsx renders it.
//
// THE TWO PLANES (no cross-DB SQL -- we query each client, then merge in JS):
//
//   SPINE (NEW)  -- supabase-backup (ibckhcjvyxzrhvdiazbx), getBackupServiceClient()
//     public.orders : the canonical order spine. source in {web, sample,
//     k2k_invoice, deal}. Sample orders are born here. Today mostly test rows.
//
//   LEGACY (read-channel) -- production (swhglnjyuorkycpgkmec), getProdReadClient()
//     READ ONLY. Rose owns these; scraped/ingested from K2K + the old funnel:
//       k2k_orders        -> source 'k2k_order'
//       k2k_prebooks      -> source 'k2k_prebook'
//       quote_requests    -> source 'quote'
//       sample_box_status -> source 'sample_box'  (the old sample-box pipeline)
//
// HONESTY RULES (encoded here, surfaced in the UI):
//   - is_test rows are tagged and excluded from headline counts.
//   - PROD sources are labeled plane='legacy' (read-channel), never 'spine'.
//   - If a PROD table errors / client is unconfigured, that source degrades to a
//     labeled note and contributes zero rows -- the page never crashes.
//   - Row counts shown are the real counts we read (capped at PER_SOURCE_CAP).

import { getBackupServiceClient } from '@/lib/supabase/backup-server';
import { getProdReadClient, isProdReadConfigured } from '@/lib/supabase/prod-server';

// Read at most this many rows per source. Visibility surface, not export.
export const PER_SOURCE_CAP = 300;

export type UnifiedSource =
  | 'web'
  | 'sample'
  | 'deal'
  | 'k2k_order'
  | 'k2k_prebook'
  | 'quote'
  | 'sample_box';

export type Plane = 'spine' | 'legacy';

// Normalized status buckets -- every native status maps into one of these so a
// single filter works across heterogeneous sources.
export type NormStatus =
  | 'open'        // live / actionable
  | 'awaiting'    // waiting on payment / confirmation
  | 'fulfilled'   // delivered / received / confirmed
  | 'cancelled'   // void / declined / cancelled
  | 'other';      // unknown / unmapped

export interface UnifiedOrder {
  /** Stable key for React: `${source}:${id}`. */
  key: string;
  source: UnifiedSource;
  plane: Plane;
  /** Native id within its source table (string for display). */
  refId: string;
  /** Human order/ref number when one exists, else null. */
  refNumber: string | null;
  /** Raw native status as stored. */
  rawStatus: string | null;
  /** Normalized bucket. */
  status: NormStatus;
  clientName: string | null;
  businessName: string | null;
  email: string | null;
  /** USD amount; null when the source has none. */
  amount: number | null;
  /** Primary date for sort/display (ISO). */
  date: string | null;
  isTest: boolean;
}

export interface SourceStat {
  source: UnifiedSource;
  plane: Plane;
  label: string;
  /** Real rows read (excludes is_test). */
  count: number;
  /** Sum of amount over non-test rows (USD). */
  amount: number;
  /** Test rows read (shown separately, off the headline). */
  testCount: number;
  /** Non-null when this source could not be read. */
  error: string | null;
}

export interface UnifiedResult {
  rows: UnifiedOrder[];
  stats: SourceStat[];
  /** Sources we attempted but could not read (honest degradation). */
  unreadable: { source: UnifiedSource; reason: string }[];
}

export const SOURCE_META: Record<
  UnifiedSource,
  { label: string; plane: Plane; cls: string }
> = {
  web:         { label: 'Web',          plane: 'spine',  cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  sample:      { label: 'Sample',       plane: 'spine',  cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  deal:        { label: 'Deal',         plane: 'spine',  cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  k2k_order:   { label: 'K2K order',    plane: 'legacy', cls: 'bg-slate-100 text-slate-700 border-slate-200' },
  k2k_prebook: { label: 'K2K prebook',  plane: 'legacy', cls: 'bg-slate-100 text-slate-700 border-slate-200' },
  quote:       { label: 'Quote',        plane: 'legacy', cls: 'bg-slate-100 text-slate-700 border-slate-200' },
  sample_box:  { label: 'Sample box',   plane: 'legacy', cls: 'bg-slate-100 text-slate-700 border-slate-200' },
};

export const ALL_SOURCES: UnifiedSource[] = [
  'web', 'sample', 'deal', 'k2k_order', 'k2k_prebook', 'quote', 'sample_box',
];

export const ALL_NORM_STATUSES: NormStatus[] = [
  'open', 'awaiting', 'fulfilled', 'cancelled', 'other',
];

export const NORM_STATUS_META: Record<NormStatus, { label: string; cls: string }> = {
  open:      { label: 'Open',      cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  awaiting:  { label: 'Awaiting',  cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  fulfilled: { label: 'Fulfilled', cls: 'bg-emerald-50 text-emerald-900 border-emerald-300' },
  cancelled: { label: 'Cancelled', cls: 'bg-slate-100 text-slate-500 border-slate-200' },
  other:     { label: 'Other',     cls: 'bg-slate-100 text-slate-600 border-slate-200' },
};

// ---------------------------------------------------------------------------
// Status normalization (per source)
// ---------------------------------------------------------------------------

function normSpineStatus(s: string | null): NormStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'paid':
    case 'preauth_held':
      return 'open';
    case 'pending_payment':
    case 'card_saved':
    case 'cart':
      return 'awaiting';
    case 'fulfilled':
      return 'fulfilled';
    case 'cancelled':
    case 'refunded':
    case 'failed':
      return 'cancelled';
    default:
      return 'other';
  }
}

function normK2kOrderStatus(s: string | null): NormStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'confirmed':
      return 'fulfilled';
    case 'pending':
      return 'awaiting';
    case 'void':
    case 'cancelled':
      return 'cancelled';
    default:
      return 'other';
  }
}

function normQuoteStatus(s: string | null): NormStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'converted':
      return 'fulfilled';
    case 'new':
      return 'awaiting';
    case 'declined':
      return 'cancelled';
    default:
      return 'other';
  }
}

function normSampleBoxStatus(s: string | null): NormStatus {
  switch ((s ?? '').toUpperCase()) {
    case 'SB_RECEIVED':
      return 'fulfilled';
    case 'SB_READY':
      return 'open';
    case 'SB_INTERESTED':
      return 'awaiting';
    default:
      return 'other';
  }
}

// ---------------------------------------------------------------------------
// Number helpers
// ---------------------------------------------------------------------------

function toNum(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------
// Per-source fetchers. Each returns rows + any error string. None throw.
// ---------------------------------------------------------------------------

async function fetchSpineOrders(): Promise<{ rows: UnifiedOrder[]; error: string | null }> {
  try {
    const svc = getBackupServiceClient();
    const { data, error } = await svc
      .from('orders')
      .select(
        'id, order_number, status, source, grand_total, currency, client_name, business_name, client_email, created_at, is_test, shipping_address_snapshot',
      )
      .order('created_at', { ascending: false })
      .limit(PER_SOURCE_CAP);
    if (error) return { rows: [], error: error.message };

    const rows: UnifiedOrder[] = (data ?? []).map((o: Record<string, unknown>) => {
      // Map the spine's source column onto the unified enum. k2k_invoice rows
      // are deal-adjacent imports; surface them as 'deal' for the headline.
      const rawSource = (o.source as string | null) ?? 'web';
      let source: UnifiedSource = 'web';
      if (rawSource === 'sample') source = 'sample';
      else if (rawSource === 'deal' || rawSource === 'k2k_invoice') source = 'deal';
      else source = 'web';

      const snap = (o.shipping_address_snapshot as { business_name?: string | null; recipient_name?: string | null } | null) ?? null;
      return {
        key: `spine_${source}:${String(o.id)}`,
        source,
        plane: 'spine',
        refId: String(o.id),
        refNumber: (o.order_number as string | null) ?? null,
        rawStatus: (o.status as string | null) ?? null,
        status: normSpineStatus(o.status as string | null),
        clientName: (o.client_name as string | null) ?? snap?.recipient_name ?? null,
        businessName: (o.business_name as string | null) ?? snap?.business_name ?? null,
        email: (o.client_email as string | null) ?? null,
        amount: toNum(o.grand_total as number | string | null),
        date: (o.created_at as string | null) ?? null,
        isTest: Boolean(o.is_test),
      };
    });
    return { rows, error: null };
  } catch (e) {
    return { rows: [], error: e instanceof Error ? e.message : 'spine fetch failed' };
  }
}

type ProdClient = NonNullable<ReturnType<typeof getProdReadClient>>;

async function fetchK2kOrders(prod: ProdClient): Promise<{ rows: UnifiedOrder[]; error: string | null }> {
  try {
    const { data, error } = await prod
      .from('k2k_orders')
      .select('id, k2k_order_number, buyer_name, buyer_company, buyer_email, order_status, order_date, total_amount')
      .order('order_date', { ascending: false, nullsFirst: false })
      .limit(PER_SOURCE_CAP);
    if (error) return { rows: [], error: error.message };
    const rows: UnifiedOrder[] = (data ?? []).map((r: Record<string, unknown>) => ({
      key: `k2k_order:${String(r.id)}`,
      source: 'k2k_order',
      plane: 'legacy',
      refId: String(r.id),
      refNumber: (r.k2k_order_number as string | null) ?? null,
      rawStatus: (r.order_status as string | null) ?? null,
      status: normK2kOrderStatus(r.order_status as string | null),
      clientName: (r.buyer_name as string | null) ?? null,
      businessName: (r.buyer_company as string | null) ?? null,
      email: (r.buyer_email as string | null) ?? null,
      amount: toNum(r.total_amount as number | string | null),
      date: (r.order_date as string | null) ?? null,
      isTest: false,
    }));
    return { rows, error: null };
  } catch (e) {
    return { rows: [], error: e instanceof Error ? e.message : 'k2k_orders fetch failed' };
  }
}

async function fetchK2kPrebooks(prod: ProdClient): Promise<{ rows: UnifiedOrder[]; error: string | null }> {
  try {
    const { data, error } = await prod
      .from('k2k_prebooks')
      .select('id, prebook_number, customer_name, customer_code, prebook_status, truck_date, total_with_surcharges, total_price, is_test')
      .order('truck_date', { ascending: false, nullsFirst: false })
      .limit(PER_SOURCE_CAP);
    if (error) return { rows: [], error: error.message };
    const rows: UnifiedOrder[] = (data ?? []).map((r: Record<string, unknown>) => ({
      key: `k2k_prebook:${String(r.id)}`,
      source: 'k2k_prebook',
      plane: 'legacy',
      refId: String(r.id),
      refNumber: r.prebook_number != null ? String(r.prebook_number) : null,
      rawStatus: (r.prebook_status as string | null) ?? null,
      // prebook_status is uniformly 'None' today -> 'other'. Keep honest.
      status: 'other',
      clientName: (r.customer_name as string | null) ?? null,
      businessName: (r.customer_code as string | null) ?? null,
      email: null,
      amount: toNum((r.total_with_surcharges as number | string | null) ?? (r.total_price as number | string | null)),
      date: (r.truck_date as string | null) ?? null,
      isTest: Boolean(r.is_test),
    }));
    return { rows, error: null };
  } catch (e) {
    return { rows: [], error: e instanceof Error ? e.message : 'k2k_prebooks fetch failed' };
  }
}

async function fetchQuotes(prod: ProdClient): Promise<{ rows: UnifiedOrder[]; error: string | null }> {
  try {
    const { data, error } = await prod
      .from('quote_requests')
      .select('id, business_name, customer_name, email, status, grand_total, delivery_date, created_at')
      .order('created_at', { ascending: false, nullsFirst: false })
      .limit(PER_SOURCE_CAP);
    if (error) return { rows: [], error: error.message };
    const rows: UnifiedOrder[] = (data ?? []).map((r: Record<string, unknown>) => ({
      key: `quote:${String(r.id)}`,
      source: 'quote',
      plane: 'legacy',
      refId: String(r.id),
      refNumber: `Q-${String(r.id)}`,
      rawStatus: (r.status as string | null) ?? null,
      status: normQuoteStatus(r.status as string | null),
      clientName: (r.customer_name as string | null) ?? null,
      businessName: (r.business_name as string | null) ?? null,
      email: (r.email as string | null) ?? null,
      amount: toNum(r.grand_total as number | string | null),
      date: (r.created_at as string | null) ?? (r.delivery_date as string | null) ?? null,
      isTest: false,
    }));
    return { rows, error: null };
  } catch (e) {
    return { rows: [], error: e instanceof Error ? e.message : 'quote_requests fetch failed' };
  }
}

async function fetchSampleBoxes(prod: ProdClient): Promise<{ rows: UnifiedOrder[]; error: string | null }> {
  try {
    const { data, error } = await prod
      .from('sample_box_status')
      .select('id, ship_name, business_name, sb_status, status_changed_at, updated_at, tracking_number')
      .order('updated_at', { ascending: false, nullsFirst: false })
      .limit(PER_SOURCE_CAP);
    if (error) return { rows: [], error: error.message };
    const rows: UnifiedOrder[] = (data ?? []).map((r: Record<string, unknown>) => ({
      key: `sample_box:${String(r.id)}`,
      source: 'sample_box',
      plane: 'legacy',
      refId: String(r.id),
      refNumber: (r.tracking_number as string | null) ?? null,
      rawStatus: (r.sb_status as string | null) ?? null,
      status: normSampleBoxStatus(r.sb_status as string | null),
      clientName: (r.ship_name as string | null) ?? null,
      businessName: (r.business_name as string | null) ?? null,
      email: null,
      amount: null, // sample boxes carry no order amount
      date: (r.status_changed_at as string | null) ?? (r.updated_at as string | null) ?? null,
      isTest: false,
    }));
    return { rows, error: null };
  } catch (e) {
    return { rows: [], error: e instanceof Error ? e.message : 'sample_box_status fetch failed' };
  }
}

// ---------------------------------------------------------------------------
// Orchestrator: fetch everything, merge, compute per-source stats.
// ---------------------------------------------------------------------------

export async function getUnifiedOrders(): Promise<UnifiedResult> {
  const unreadable: { source: UnifiedSource; reason: string }[] = [];

  // Spine (always attempt). PROD sources only if a read client exists.
  const prod = getProdReadClient();
  const prodReady = prod !== null && isProdReadConfigured();

  const spineP = fetchSpineOrders();
  const prodP = prodReady
    ? Promise.all([
        fetchK2kOrders(prod as ProdClient),
        fetchK2kPrebooks(prod as ProdClient),
        fetchQuotes(prod as ProdClient),
        fetchSampleBoxes(prod as ProdClient),
      ])
    : Promise.resolve(null);

  const [spine, prodResults] = await Promise.all([spineP, prodP]);

  const all: UnifiedOrder[] = [];
  const errBySource = new Map<UnifiedSource, string | null>();

  // Spine rows fan out into web / sample / deal -- record one shared error key
  // per spine sub-source so the stat band can flag a spine read failure.
  all.push(...spine.rows);
  for (const s of ['web', 'sample', 'deal'] as UnifiedSource[]) {
    errBySource.set(s, spine.error);
    if (spine.error) unreadable.push({ source: s, reason: spine.error });
  }

  if (prodResults) {
    const [ko, kp, qr, sb] = prodResults;
    const map: [UnifiedSource, { rows: UnifiedOrder[]; error: string | null }][] = [
      ['k2k_order', ko],
      ['k2k_prebook', kp],
      ['quote', qr],
      ['sample_box', sb],
    ];
    for (const [src, res] of map) {
      all.push(...res.rows);
      errBySource.set(src, res.error);
      if (res.error) unreadable.push({ source: src, reason: res.error });
    }
  } else {
    const reason = 'production read client not configured (PROD_SUPABASE_* env missing)';
    for (const s of ['k2k_order', 'k2k_prebook', 'quote', 'sample_box'] as UnifiedSource[]) {
      errBySource.set(s, reason);
      unreadable.push({ source: s, reason });
    }
  }

  // Sort merged list newest-first; rows with no date sink to the bottom.
  all.sort((a, b) => {
    const ta = a.date ? new Date(a.date).getTime() : -Infinity;
    const tb = b.date ? new Date(b.date).getTime() : -Infinity;
    return tb - ta;
  });

  // Per-source stats: headline counts exclude is_test.
  const stats: SourceStat[] = ALL_SOURCES.map((src) => {
    const meta = SOURCE_META[src];
    const srcRows = all.filter((r) => r.source === src);
    const real = srcRows.filter((r) => !r.isTest);
    const test = srcRows.filter((r) => r.isTest);
    const amount = real.reduce((acc, r) => acc + (r.amount ?? 0), 0);
    return {
      source: src,
      plane: meta.plane,
      label: meta.label,
      count: real.length,
      amount,
      testCount: test.length,
      error: errBySource.get(src) ?? null,
    };
  });

  return { rows: all, stats, unreadable };
}
