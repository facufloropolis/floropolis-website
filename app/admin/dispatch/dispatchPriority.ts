// Dispatch prioritization (DIRECTIONAL) — Job_PM capability #2.
// v1 | 2026-06-08 | Job_PM dispatch-priority
//
// PURPOSE: help Facu decide WHAT to dispatch next, ranked, across BOTH planes.
// This is DIRECTIONAL: the score is a first guess. Facu corrects it via the
// feedback loop (bump / drop / correct) — same pattern as the supply engine.
//
// CROSS-PLANE, NO CROSS-DB SQL: we fetch each plane independently and merge the
// rows in-process. NULL-safe everywhere — a plane that fails or is unconfigured
// degrades to [] and the other plane still renders.
//
//   BACKUP (getBackupServiceClient): orders WHERE source='sample'
//     AND fulfillment_state IN (approved, composed, dispatch_ready, vendor_confirmed),
//     is_test excluded. These are the web/sample boxes ready/near-ready to ship.
//   PROD (getProdReadClient, READ ONLY):
//     - k2k_prebooks with a truck/ship date (prebook_status read but not gated —
//       in current data all rows are status 'None', so gating would drop the
//       whole set; we surface them by ship-window instead, clearly directional).
//     - sample_box_status WHERE sb_status='SB_READY' (ship-ready sample boxes).
//
// The priority formula is documented in `scorePriority` below.

import { getBackupServiceClient } from '@/lib/supabase/backup-server';
import { getProdReadClient } from '@/lib/supabase/prod-server';

// Valid FedEx ship days: Mon/Tue/Thu/Fri (UTC dow 1,2,4,5). Wed/Sat/Sun are not.
const VALID_SHIP_DOWS = new Set([1, 2, 4, 5]);

export type DispatchSource = 'sample_order' | 'k2k_prebook' | 'sample_box';

export interface PriorityFactor {
  label: string;       // human-readable factor name
  points: number;      // contribution to the score (can be negative)
  detail: string;      // why this many points
}

export interface DispatchPriorityItem {
  key: string;                 // stable id for feedback (source:id)
  ref: string;                 // order/prebook/sample reference shown to Facu
  client: string;              // client / business name
  source: DispatchSource;
  sourceLabel: string;         // pretty source label
  plane: 'BACKUP' | 'PROD';
  shipTargetDate: string | null;  // ISO date the item should ship (snapped target)
  shipTargetSnapped: string | null; // ship date snapped to a valid FedEx ship day
  daysUntilShip: number | null;    // negative = overdue
  value: number;               // $ value used in scoring (0 for $-less sample bets)
  isStrategicBet: boolean;     // sample/conversion bet — weighted even at $0
  score: number;               // directional priority score (higher = sooner)
  factors: PriorityFactor[];   // WHY — the breakdown
}

export interface PlaneFetchResult {
  configured: boolean;
  error: string | null;
  count: number;
}

export interface DispatchPriorityResult {
  items: DispatchPriorityItem[];
  planes: {
    sampleOrders: PlaneFetchResult;
    k2kPrebooks: PlaneFetchResult;
    sampleBoxes: PlaneFetchResult;
  };
  generatedAt: string;
}

const SAMPLE_ORDER_STATES = ['approved', 'composed', 'dispatch_ready', 'vendor_confirmed'];

// ---------------------------------------------------------------------------
// Date helpers (all UTC-based to match the rest of the dispatch page).
// ---------------------------------------------------------------------------
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function isoToDate(iso: string): Date {
  return new Date(iso + 'T00:00:00Z');
}

function daysBetween(fromIso: string, toIso: string): number {
  const a = isoToDate(fromIso).getTime();
  const b = isoToDate(toIso).getTime();
  return Math.round((b - a) / 86_400_000);
}

// Snap a date forward to the next valid FedEx ship day (Mon/Tue/Thu/Fri).
// If the date is already a valid ship day, it's returned unchanged.
function snapToShipDay(iso: string | null): string | null {
  if (!iso) return null;
  const d = isoToDate(iso);
  for (let i = 0; i < 7; i++) {
    if (VALID_SHIP_DOWS.has(d.getUTCDay())) {
      return d.toISOString().slice(0, 10);
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return iso;
}

function normalizeIsoDate(v: unknown): string | null {
  if (typeof v !== 'string' || !v) return null;
  // Accept 'YYYY-MM-DD' or full timestamps; take the date part.
  const m = v.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

function toNum(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
}

// ---------------------------------------------------------------------------
// DIRECTIONAL PRIORITY SCORE
// ---------------------------------------------------------------------------
// score = ship-window urgency + value + cohort
//
//   ship-window urgency (0..60): based on days until the snapped ship date.
//     overdue (< 0)  -> 60  (top — should already have shipped)
//     today (0)      -> 55
//     1 day          -> 45
//     2 days         -> 38
//     3 days         -> 30
//     4-6 days       -> 20
//     7+ days        -> 10
//     unknown date   -> 25  (mid — can't time it, surface it)
//   value (0..30): log-scaled order $ so a $2k order doesn't bury a $50 one
//     entirely. points = min(30, round(value / 100)).  $0 -> 0.
//   cohort (0..25): strategic conversion bets (samples) get a flat strategic
//     weight even at $0, because a sample box is a conversion bet, not revenue.
//     sample_order / sample_box -> +25.  k2k_prebook -> +0 (already has $).
//
// Everything is additive + transparent: each factor is returned so the UI can
// render the WHY. The numbers are a STARTING POINT — Facu's bump/drop/correct
// feedback is the real signal.
function scorePriority(args: {
  source: DispatchSource;
  shipSnapped: string | null;
  daysUntilShip: number | null;
  value: number;
  isStrategicBet: boolean;
}): { score: number; factors: PriorityFactor[] } {
  const factors: PriorityFactor[] = [];

  // 1) ship-window urgency
  let urgency: number;
  let urgencyDetail: string;
  const d = args.daysUntilShip;
  if (d == null) {
    urgency = 25;
    urgencyDetail = 'no ship date on record — surfaced at mid urgency';
  } else if (d < 0) {
    urgency = 60;
    urgencyDetail = `overdue by ${Math.abs(d)}d (ship day already passed)`;
  } else if (d === 0) {
    urgency = 55;
    urgencyDetail = 'ships today';
  } else if (d === 1) {
    urgency = 45;
    urgencyDetail = 'ships tomorrow';
  } else if (d === 2) {
    urgency = 38;
    urgencyDetail = 'ships in 2 days';
  } else if (d === 3) {
    urgency = 30;
    urgencyDetail = 'ships in 3 days';
  } else if (d <= 6) {
    urgency = 20;
    urgencyDetail = `ships in ${d} days (this week)`;
  } else {
    urgency = 10;
    urgencyDetail = `ships in ${d} days`;
  }
  factors.push({ label: 'Ship-window urgency', points: urgency, detail: urgencyDetail });

  // 2) value
  const valuePts = Math.min(30, Math.round(args.value / 100));
  if (args.value > 0) {
    factors.push({
      label: 'Order value',
      points: valuePts,
      detail: `$${args.value.toLocaleString('en-US', { maximumFractionDigits: 0 })} order`,
    });
  } else {
    factors.push({
      label: 'Order value',
      points: 0,
      detail: 'no $ value (sample / conversion bet)',
    });
  }

  // 3) cohort / strategic bet
  if (args.isStrategicBet) {
    factors.push({
      label: 'Strategic cohort',
      points: 25,
      detail: 'sample box = conversion bet, weighted even at $0',
    });
  } else {
    factors.push({ label: 'Strategic cohort', points: 0, detail: 'standard order' });
  }

  const score = factors.reduce((s, f) => s + f.points, 0);
  return { score, factors };
}

function snappedDaysUntil(shipSnapped: string | null, today: string): number | null {
  if (!shipSnapped) return null;
  return daysBetween(today, shipSnapped);
}

// ---------------------------------------------------------------------------
// Plane 1 — BACKUP sample orders
// ---------------------------------------------------------------------------
async function fetchSampleOrders(today: string): Promise<{
  items: DispatchPriorityItem[];
  plane: PlaneFetchResult;
}> {
  let client;
  try {
    client = getBackupServiceClient();
  } catch (e) {
    return {
      items: [],
      plane: { configured: false, error: e instanceof Error ? e.message : String(e), count: 0 },
    };
  }
  try {
    const { data, error } = await client
      .from('orders')
      .select(
        'id, order_number, client_name, business_name, grand_total, requested_delivery_date, fulfillment_state, lead_master_id, is_test, source',
      )
      .eq('source', 'sample')
      .in('fulfillment_state', SAMPLE_ORDER_STATES)
      .limit(500);
    if (error) {
      return { items: [], plane: { configured: true, error: error.message, count: 0 } };
    }
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    const items: DispatchPriorityItem[] = [];
    for (const r of rows) {
      if (r.is_test === true) continue;
      const reqDate = normalizeIsoDate(r.requested_delivery_date);
      const shipSnapped = snapToShipDay(reqDate);
      const daysUntil = snappedDaysUntil(shipSnapped, today);
      const value = toNum(r.grand_total);
      const client =
        (r.business_name as string) || (r.client_name as string) || 'Unknown client';
      const { score, factors } = scorePriority({
        source: 'sample_order',
        shipSnapped,
        daysUntilShip: daysUntil,
        value,
        isStrategicBet: true,
      });
      items.push({
        key: `sample_order:${r.id}`,
        ref: (r.order_number as string) || `order ${r.id}`,
        client,
        source: 'sample_order',
        sourceLabel: 'Sample order (web)',
        plane: 'BACKUP',
        shipTargetDate: reqDate,
        shipTargetSnapped: shipSnapped,
        daysUntilShip: daysUntil,
        value,
        isStrategicBet: true,
        score,
        factors,
      });
    }
    return { items, plane: { configured: true, error: null, count: items.length } };
  } catch (e) {
    return {
      items: [],
      plane: { configured: true, error: e instanceof Error ? e.message : String(e), count: 0 },
    };
  }
}

// ---------------------------------------------------------------------------
// Plane 2 — PROD k2k_prebooks (READ ONLY)
// ---------------------------------------------------------------------------
async function fetchK2kPrebooks(today: string): Promise<{
  items: DispatchPriorityItem[];
  plane: PlaneFetchResult;
}> {
  const client = getProdReadClient();
  if (!client) return { items: [], plane: { configured: false, error: null, count: 0 } };
  try {
    // Read prebook_status + dates. We do NOT hard-gate on status because the
    // live data has all rows at 'None'; gating would drop the entire set.
    // We surface by ship-window instead. Directional — Facu corrects.
    const { data, error } = await client
      .from('k2k_prebooks')
      .select(
        'id, prebook_number, customer_name, ship_city, ship_state, total_price, ui_total_price, total_with_surcharges, truck_date, dispatch_date, prebook_status, is_test',
      )
      .not('truck_date', 'is', null)
      .order('truck_date', { ascending: true })
      .limit(300);
    if (error) {
      return { items: [], plane: { configured: true, error: error.message, count: 0 } };
    }
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    const items: DispatchPriorityItem[] = [];
    for (const r of rows) {
      if (r.is_test === true) continue;
      // Prefer an explicit dispatch_date, else the truck_date.
      const shipRaw =
        normalizeIsoDate(r.dispatch_date) ?? normalizeIsoDate(r.truck_date);
      const shipSnapped = snapToShipDay(shipRaw);
      const daysUntil = snappedDaysUntil(shipSnapped, today);
      const value =
        toNum(r.total_with_surcharges) || toNum(r.ui_total_price) || toNum(r.total_price);
      const client = (r.customer_name as string)?.trim() || 'Unknown customer';
      const { score, factors } = scorePriority({
        source: 'k2k_prebook',
        shipSnapped,
        daysUntilShip: daysUntil,
        value,
        isStrategicBet: false,
      });
      const num = r.prebook_number != null ? `PB-${r.prebook_number}` : `prebook ${r.id}`;
      items.push({
        key: `k2k_prebook:${r.id}`,
        ref: num,
        client,
        source: 'k2k_prebook',
        sourceLabel: 'K2K prebook',
        plane: 'PROD',
        shipTargetDate: shipRaw,
        shipTargetSnapped: shipSnapped,
        daysUntilShip: daysUntil,
        value,
        isStrategicBet: false,
        score,
        factors,
      });
    }
    return { items, plane: { configured: true, error: null, count: items.length } };
  } catch (e) {
    return {
      items: [],
      plane: { configured: true, error: e instanceof Error ? e.message : String(e), count: 0 },
    };
  }
}

// ---------------------------------------------------------------------------
// Plane 3 — PROD sample_box_status SB_READY (READ ONLY)
// ---------------------------------------------------------------------------
async function fetchSampleBoxes(today: string): Promise<{
  items: DispatchPriorityItem[];
  plane: PlaneFetchResult;
}> {
  const client = getProdReadClient();
  if (!client) return { items: [], plane: { configured: false, error: null, count: 0 } };
  try {
    const { data, error } = await client
      .from('sample_box_status')
      .select(
        'id, business_name, ship_city, ship_state, sb_status, sheet_dispatch_date, box_type, updated_at',
      )
      .eq('sb_status', 'SB_READY')
      .limit(300);
    if (error) {
      return { items: [], plane: { configured: true, error: error.message, count: 0 } };
    }
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    const items: DispatchPriorityItem[] = [];
    for (const r of rows) {
      const shipRaw = normalizeIsoDate(r.sheet_dispatch_date);
      const shipSnapped = snapToShipDay(shipRaw);
      const daysUntil = snappedDaysUntil(shipSnapped, today);
      const client = (r.business_name as string)?.trim() || 'Unknown business';
      // Sample boxes are $0 strategic bets.
      const { score, factors } = scorePriority({
        source: 'sample_box',
        shipSnapped,
        daysUntilShip: daysUntil,
        value: 0,
        isStrategicBet: true,
      });
      items.push({
        key: `sample_box:${r.id}`,
        ref: `SB-${r.id}`,
        client,
        source: 'sample_box',
        sourceLabel: 'Sample box (ready)',
        plane: 'PROD',
        shipTargetDate: shipRaw,
        shipTargetSnapped: shipSnapped,
        daysUntilShip: daysUntil,
        value: 0,
        isStrategicBet: true,
        score,
        factors,
      });
    }
    return { items, plane: { configured: true, error: null, count: items.length } };
  } catch (e) {
    return {
      items: [],
      plane: { configured: true, error: e instanceof Error ? e.message : String(e), count: 0 },
    };
  }
}

// ---------------------------------------------------------------------------
// Public entry — merge all three planes, sort by directional score desc.
// Never throws: each plane degrades to [] independently.
// ---------------------------------------------------------------------------
export async function getDispatchPriority(): Promise<DispatchPriorityResult> {
  const today = todayIso();
  const [sample, k2k, boxes] = await Promise.all([
    fetchSampleOrders(today),
    fetchK2kPrebooks(today),
    fetchSampleBoxes(today),
  ]);

  const items = [...sample.items, ...k2k.items, ...boxes.items].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // tie-break: sooner ship date first (nulls last), then higher value.
    const ad = a.daysUntilShip ?? Number.POSITIVE_INFINITY;
    const bd = b.daysUntilShip ?? Number.POSITIVE_INFINITY;
    if (ad !== bd) return ad - bd;
    return b.value - a.value;
  });

  return {
    items,
    planes: {
      sampleOrders: sample.plane,
      k2kPrebooks: k2k.plane,
      sampleBoxes: boxes.plane,
    },
    generatedAt: new Date().toISOString(),
  };
}
