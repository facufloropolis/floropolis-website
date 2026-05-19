// Server-side helpers to read Rose-owned dispatch tables (HARD READ-ONLY).
// v1 | 2026-05-19 | Job_PM disp-real [V8 SHADOW]
//
// Tables (per rose_table_audit_v1.md section 4):
//   - n8n_dispatch_queue   JOB_READ_OK + HARD BOUNDARY (no writes, no cancels)
//   - dispatch_batches     JOB_READ_OK
//   - dispatch_events      JOB_READ_OK
//   - dispatch_tracking    JOB_READ_OK
//   - farm_shipments       JOB_READ_OK
//
// All functions return null on "client not configured" or empty array on error.
// We do NOT throw from these helpers because the dispatch page must keep
// rendering the D1 tab even when production reads fail.

import { getProdReadClient } from '@/lib/supabase/prod-server';

const RECENT_WINDOW_DAYS = 30;

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

// ---------------------------------------------------------------------------
// Types: kept intentionally permissive (Record<string, unknown>) because
// Rose's exact schema is the authority, not Job's. The UI projects whatever
// columns are present and shows '-' for missing ones.
// ---------------------------------------------------------------------------

export interface RoseQueueRow {
  id?: string | number | null;
  customer_email?: string | null;
  template_id?: string | number | null;
  scheduled_send_at?: string | null;
  brevo_message_id?: string | null;
  status?: string | null;
  created_at?: string | null;
  // catch-all for unexpected columns
  [k: string]: unknown;
}

export interface RoseBatchRow {
  id?: string | number | null;
  batch_id?: string | null;
  batch_date?: string | null;
  created_at?: string | null;
  [k: string]: unknown;
}

export interface RoseEventRow {
  id?: string | number | null;
  batch_id?: string | null;
  dispatch_id?: string | null;
  event_type?: string | null;
  event_at?: string | null;
  created_at?: string | null;
  [k: string]: unknown;
}

export interface FarmShipmentRow {
  id?: string | number | null;
  farm?: string | null;
  farm_name?: string | null;
  invoice_number?: string | null;
  fly_date?: string | null;
  ship_date?: string | null;
  arrival_date?: string | null;
  boxes?: number | null;
  total_boxes?: number | null;
  items_count?: number | null;
  created_at?: string | null;
  [k: string]: unknown;
}

export interface RoseTabResult<T> {
  configured: boolean;       // false = no PROD_SUPABASE_SERVICE_KEY; UI shows banner
  rows: T[];                 // empty on error or unconfigured
  lastSyncedAt: string | null; // max(created_at) or similar; null if no rows
  error: string | null;      // error message if fetch failed (not auth/config)
}

function emptyResult<T>(reason: 'unconfigured' | 'error', error: string | null = null): RoseTabResult<T> {
  return {
    configured: reason !== 'unconfigured',
    rows: [],
    lastSyncedAt: null,
    error,
  };
}

function maxIsoFromRows(rows: Array<Record<string, unknown>>, keys: string[]): string | null {
  let best: string | null = null;
  for (const r of rows) {
    for (const k of keys) {
      const v = r[k];
      if (typeof v === 'string' && (!best || v > best)) {
        best = v;
      }
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Upcoming: n8n_dispatch_queue WHERE status NOT IN ('SENT','CANCELLED')
// ---------------------------------------------------------------------------
export async function fetchRoseQueueUpcoming(limit = 100): Promise<RoseTabResult<RoseQueueRow>> {
  const client = getProdReadClient();
  if (!client) return emptyResult<RoseQueueRow>('unconfigured');
  try {
    const { data, error } = await client
      .from('n8n_dispatch_queue')
      .select('*')
      .not('status', 'in', '(SENT,CANCELLED)')
      .order('scheduled_send_at', { ascending: true, nullsFirst: false })
      .limit(limit);
    if (error) {
      console.error('[RoseDispatchData] n8n_dispatch_queue:', error.message);
      return emptyResult<RoseQueueRow>('error', error.message);
    }
    const rows = (data ?? []) as RoseQueueRow[];
    return {
      configured: true,
      rows,
      lastSyncedAt: maxIsoFromRows(rows as Array<Record<string, unknown>>, [
        'updated_at',
        'created_at',
        'scheduled_send_at',
      ]),
      error: null,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[RoseDispatchData] n8n_dispatch_queue exception:', msg);
    return emptyResult<RoseQueueRow>('error', msg);
  }
}

// ---------------------------------------------------------------------------
// Recent: dispatch_batches (last 30d) + their dispatch_events
// ---------------------------------------------------------------------------
export interface RecentBatchWithEvents {
  batch: RoseBatchRow;
  events: RoseEventRow[];
}

export async function fetchRoseBatchesRecent(): Promise<RoseTabResult<RecentBatchWithEvents>> {
  const client = getProdReadClient();
  if (!client) return emptyResult<RecentBatchWithEvents>('unconfigured');

  try {
    const since = isoDaysAgo(RECENT_WINDOW_DAYS);
    const { data: batchesRaw, error: bErr } = await client
      .from('dispatch_batches')
      .select('*')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(100);
    if (bErr) {
      console.error('[RoseDispatchData] dispatch_batches:', bErr.message);
      return emptyResult<RecentBatchWithEvents>('error', bErr.message);
    }
    const batches = (batchesRaw ?? []) as RoseBatchRow[];

    // Collect identifiers we can join events on. We try batch.id first, then batch.batch_id.
    const batchIds = batches
      .map((b) => b.id)
      .filter((v): v is string | number => v != null);
    const batchKeys = batches
      .map((b) => b.batch_id)
      .filter((v): v is string => typeof v === 'string' && v.length > 0);

    let events: RoseEventRow[] = [];
    if (batchIds.length > 0 || batchKeys.length > 0) {
      // Try by id first.
      if (batchIds.length > 0) {
        const { data: evByIdRaw, error: evIdErr } = await client
          .from('dispatch_events')
          .select('*')
          .in('batch_id', batchIds as Array<string | number>)
          .order('event_at', { ascending: false, nullsFirst: false })
          .limit(500);
        if (!evIdErr && evByIdRaw && evByIdRaw.length > 0) {
          events = evByIdRaw as RoseEventRow[];
        }
      }
      // Fallback to batch_key matching if events lookup yielded nothing.
      if (events.length === 0 && batchKeys.length > 0) {
        const { data: evByKeyRaw, error: evKeyErr } = await client
          .from('dispatch_events')
          .select('*')
          .in('batch_id', batchKeys)
          .order('event_at', { ascending: false, nullsFirst: false })
          .limit(500);
        if (!evKeyErr && evByKeyRaw) {
          events = evByKeyRaw as RoseEventRow[];
        }
      }
    }

    const grouped: RecentBatchWithEvents[] = batches.map((b) => {
      const bId = b.id;
      const bKey = b.batch_id;
      const evs = events.filter(
        (e) =>
          (bId != null && e.batch_id === bId) ||
          (typeof bKey === 'string' && e.batch_id === bKey),
      );
      return { batch: b, events: evs };
    });

    return {
      configured: true,
      rows: grouped,
      lastSyncedAt: maxIsoFromRows(batches as Array<Record<string, unknown>>, [
        'updated_at',
        'created_at',
        'batch_date',
      ]),
      error: null,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[RoseDispatchData] dispatch_batches exception:', msg);
    return emptyResult<RecentBatchWithEvents>('error', msg);
  }
}

// ---------------------------------------------------------------------------
// Farm shipments (last 30d)
// ---------------------------------------------------------------------------
export async function fetchFarmShipmentsRecent(): Promise<RoseTabResult<FarmShipmentRow>> {
  const client = getProdReadClient();
  if (!client) return emptyResult<FarmShipmentRow>('unconfigured');
  try {
    const since = isoDaysAgo(RECENT_WINDOW_DAYS);
    const { data, error } = await client
      .from('farm_shipments')
      .select('*')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) {
      console.error('[RoseDispatchData] farm_shipments:', error.message);
      return emptyResult<FarmShipmentRow>('error', error.message);
    }
    const rows = (data ?? []) as FarmShipmentRow[];
    return {
      configured: true,
      rows,
      lastSyncedAt: maxIsoFromRows(rows as Array<Record<string, unknown>>, [
        'updated_at',
        'created_at',
        'ship_date',
        'fly_date',
      ]),
      error: null,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[RoseDispatchData] farm_shipments exception:', msg);
    return emptyResult<FarmShipmentRow>('error', msg);
  }
}
