// Daily dispatch manifest data — reads the REAL Rose-owned dispatch tables in
// PROD (HARD READ-ONLY) and assembles the per-day manifest the mockup renders.
// v1 | 2026-06-09 | Job_PM dispatch-mockup-rebuild
//
// WHY a new module (vs RoseDispatchData.ts): RoseDispatchData.ts fetches the
// Upcoming/Recent/Farm tabs of the OLD tab-based surface. The mockup is a
// single daily manifest (3 panels around "today's dispatch"). This module
// assembles exactly that shape from the same authoritative PROD tables.
//
// Sources (PROD, swhglnjyuorkycpgkmec — getProdReadClient, READ ONLY):
//   - dispatch_tracking   : one row per FedEx label parsed. ship_date is the
//                           dispatch date; email_subject/email_sent_at = the
//                           farm-label notification; farm_breakdown = farms on
//                           that tracking. THIS is the spine of "today's boxes".
//   - sample_box_status   : enriched per-recipient box. Joined to tracking by
//                           tracking_number -> recipient business_name,
//                           ship_city/state, products_sent, box_type,
//                           sb_status, tracking_status, tracking_delivered_at.
//                           NOTE (data gap, verified 2026-06-09 against PROD):
//                           products_sent is 0/196 non-null across ALL of PROD,
//                           so the "box contents" panel honestly renders
//                           "-- sin contenido registrado" for every box on every
//                           date. The wiring is correct; the source is globally
//                           empty until Rose backfills products_sent. (Same
//                           honesty as labelFile.ts on ship_*.)
//   - farm_shipments      : farm-side manifest (farm, num_boxes, total_stems,
//                           awb, fly_date) — the farm/box rollup for a day.
//   - n8n_dispatch_queue  : client notification emails (template, status,
//                           scheduled_send_at, sent_at) — the Communications
//                           panel's client-email leg.
//
// NULL-safe everywhere: a null PROD client or any query error degrades to an
// empty manifest with `configured=false` / an error string. Never throws.

import { getProdReadClient } from '@/lib/supabase/prod-server';

// ---------------------------------------------------------------------------
// Shapes consumed by the UI.
// ---------------------------------------------------------------------------

// One derived comms/ops signal for a box (D3). state is the honest tri-value:
//   confirmed = a real signal was derived from comms; pending = no signal yet.
export type CommsSignalState = 'confirmed' | 'pending';
export interface CommsSignal {
  key: 'box_to_fedex' | 'client_delivered' | 'vendor_confirmed';
  label: string;                  // ASCII-clean Spanish-leaning label
  state: CommsSignalState;
  detail: string | null;          // short evidence string (real body/insight) or null
  sourceAt: string | null;        // ISO of the message/call the signal came from
}

export interface ManifestBox {
  trackingNumber: string;
  carrier: string | null;
  recipient: string | null;       // business_name from sample_box_status
  destination: string | null;     // "City, ST" if known
  boxType: string | null;         // SAMPLE / etc
  products: string | null;        // products_sent (NOTE: 0/196 non-null in PROD as of 2026-06-09 -> renders honest pending until Rose backfills)
  sbStatus: string | null;        // SB_READY / SB_RECEIVED / ...
  trackingStatus: string | null;  // carrier tracking status (often null today)
  deliveredAt: string | null;
  leadMasterId: number | null;    // join key into messages.analysis_v2 (comms)
  signals: CommsSignal[];         // 3 derived ops signals (D3); honest pending when none
}

export interface ManifestFarm {
  farm: string;
  customer: string | null;
  boxes: number;
  stems: number;
  awb: string | null;
}

export interface ManifestEmail {
  trackingNumber: string;
  subject: string | null;
  sentAt: string | null;
  farms: { name: string; boxes: number }[];
}

export interface ClientNotification {
  customer: string | null;
  email: string | null;
  template: string | null;
  status: string | null;          // QUEUED / SENT / FAILED ...
  scheduledFor: string | null;
  sentAt: string | null;
  trackingNumber: string | null;
}

export interface DispatchManifest {
  configured: boolean;            // false = PROD client not configured
  error: string | null;
  dispatchDate: string;           // the ISO date this manifest is for
  boxes: ManifestBox[];           // today's outbound boxes (from dispatch_tracking)
  farms: ManifestFarm[];          // farm-side rollup for the date (farm_shipments)
  farmEmails: ManifestEmail[];    // label notifications sent to farms
  clientNotifications: ClientNotification[]; // n8n client emails for these trackings
  yesterday: ManifestBox[];       // prior ship-day boxes (for arrivals card)
  counts: {
    boxes: number;
    farms: number;
    recipients: number;
    delivered: number;
  };
}

// ---------------------------------------------------------------------------
// Date helpers (UTC, consistent with the rest of the dispatch surface).
// ---------------------------------------------------------------------------
function normalizeIso(v: unknown): string | null {
  if (typeof v !== 'string' || !v) return null;
  const m = v.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

function emptyManifest(
  date: string,
  configured: boolean,
  error: string | null,
): DispatchManifest {
  return {
    configured,
    error,
    dispatchDate: date,
    boxes: [],
    farms: [],
    farmEmails: [],
    clientNotifications: [],
    yesterday: [],
    counts: { boxes: 0, farms: 0, recipients: 0, delivered: 0 },
  };
}

function parseFarmBreakdown(raw: unknown): { name: string; boxes: number }[] {
  if (!raw) return [];
  let obj: Record<string, unknown> | null = null;
  if (typeof raw === 'object') obj = raw as Record<string, unknown>;
  else if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return [];
    }
  }
  if (!obj) return [];
  return Object.entries(obj).map(([name, n]) => ({
    name,
    boxes: typeof n === 'number' ? n : parseInt(String(n), 10) || 0,
  }));
}

function fmtDestination(city: unknown, state: unknown): string | null {
  const c = typeof city === 'string' ? city.trim() : '';
  const s = typeof state === 'string' ? state.trim() : '';
  if (c && s) return `${c}, ${s}`;
  return c || s || null;
}

// ---------------------------------------------------------------------------
// D3 — comms-analysis signal derivation.
//
// The signals are NOT FedEx tracking (per Facu): they come from WhatsApp/calls
// analyzed into messages.analysis_v2 (jsonb) and v_je_call_analysis. We derive
// three ops signals per recipient from the REAL analyzed content:
//   - box_to_fedex     : the box was handed to / dispatched via FedEx
//   - client_delivered : the client confirmed they received the box
//   - vendor_confirmed : the vendor/farm side confirmed the shipment
// Derivation is conservative: a signal flips to "confirmed" only when the
// analyzed text/structure clearly indicates it. Otherwise it stays "pending".
// NULL-safe: a recipient with no analyzed comms yields three pending signals.
//
// DATA REALITY (verified 2026-06-09 against PROD): only 76 messages globally
// carry analysis_v2, and NONE of them belong to the leads on the current live
// fallback dispatch date (2026-06-05). So on the date Facu actually sees, all
// three text-derived signals render "pendiente" for every box — the engine is
// effectively UN-EXERCISED on current data. The only confirmations that can
// fire today come from the structural sample_box_status flags
// (tracking_delivered_at / sb_receipt_confirmed=true, 34 rows globally), not
// from comms text. This is honest, not a bug; flagging it so the empty signal
// panel isn't mistaken for broken derivation.
// ---------------------------------------------------------------------------

// Shape of one analyzed comms row we evaluate (message OR call).
interface CommsRow {
  leadMasterId: number;
  at: string | null;            // message_date / call_date
  body: string;                 // message body or call key_quote (lowercased on use)
  conversationType: string;     // analysis_v2.conversation_type / call outcome
  sentiment: string;
  keyInsight: string;
  signals: string[];            // analysis_v2.buying_signals (free text)
  commitmentsJe: string[];      // analysis_v2.commitments_je
  commitmentsClient: string[];  // analysis_v2.commitments_client
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => (typeof x === 'string' ? x : String(x ?? ''))).filter(Boolean);
}

function joinLower(...parts: Array<string | string[]>): string {
  const flat: string[] = [];
  for (const p of parts) {
    if (Array.isArray(p)) flat.push(...p);
    else if (p) flat.push(p);
  }
  return flat.join(' • ').toLowerCase();
}

// Keyword sets (Spanish + English) observed in the real PROD analysis_v2 corpus.
const KW_BOX_TO_FEDEX = [
  'fedex', 'tracking', 'shipped', 'dispatch', 'enviado', 'enviamos', 'despach',
  'en camino', 'on its way', 'salio', 'salió', 'label',
];
const KW_CLIENT_DELIVERED = [
  'recib', 'llegó', 'llego', 'recibido', 'received', 'delivered', 'arriv',
  'la caja', 'las muestras', 'muestras de flores', 'got the', 'box came',
];
const KW_VENDOR_CONFIRMED = [
  'vendor', 'farm', 'finca', 'productor', 'confirm', 'confirmado', 'order_confirmation',
  'order placed', 'orden confirmada',
];

function anyKw(haystack: string, kws: string[]): boolean {
  for (const k of kws) if (haystack.includes(k)) return true;
  return false;
}

// Derive the three signals for one recipient from their analyzed comms rows
// plus the structural flags already on sample_box_status (sb_receipt_confirmed,
// tracking_delivered_at). Returns three signals in fixed order.
function deriveSignals(
  rows: CommsRow[],
  sb: { receiptConfirmed: boolean; deliveredAt: string | null; mentionedInCall: boolean } | null,
): CommsSignal[] {
  let boxAt: string | null = null;
  let boxDetail: string | null = null;
  let cliAt: string | null = null;
  let cliDetail: string | null = null;
  let venAt: string | null = null;
  let venDetail: string | null = null;

  // Structural delivery signal from sample_box_status (strongest, non-text).
  // BY DESIGN: sb_receipt_confirmed is a boolean structural flag with no event
  // timestamp, so it confirms client_delivered with sourceAt=null (cliAt stays
  // null). SignalChip tolerates confirmed+null-time (it shows the detail only).
  // tracking_delivered_at, when present, supplies a real timestamp.
  if (sb?.deliveredAt) {
    cliAt = sb.deliveredAt;
    cliDetail = 'tracking_delivered_at (PROD)';
  } else if (sb?.receiptConfirmed) {
    cliDetail = 'sb_receipt_confirmed (PROD)'; // confirmed, sourceAt intentionally null
  }

  for (const r of rows) {
    const text = joinLower(
      r.body, r.conversationType, r.keyInsight, r.signals, r.commitmentsJe, r.commitmentsClient,
    );
    if (!boxAt && (anyKw(text, KW_BOX_TO_FEDEX))) {
      boxAt = r.at;
      boxDetail = (r.keyInsight || r.body || '').slice(0, 120) || null;
    }
    if (!cliDetail && anyKw(text, KW_CLIENT_DELIVERED)) {
      cliAt = r.at;
      cliDetail = (r.body || r.keyInsight || '').slice(0, 120) || null;
    }
    if (!venAt && (r.conversationType.toLowerCase().includes('order_confirmation') || anyKw(text, KW_VENDOR_CONFIRMED))) {
      venAt = r.at;
      venDetail = (r.keyInsight || r.body || '').slice(0, 120) || null;
    }
  }

  const mk = (
    key: CommsSignal['key'],
    label: string,
    at: string | null,
    detail: string | null,
    confirmed: boolean,
  ): CommsSignal => ({
    key,
    label,
    state: confirmed ? 'confirmed' : 'pending',
    detail: confirmed ? detail : null,
    sourceAt: confirmed ? at : null,
  });

  return [
    mk('box_to_fedex', 'caja → FedEx', boxAt, boxDetail, !!boxAt),
    mk('client_delivered', 'entregado (cliente)', cliAt, cliDetail, !!cliDetail),
    mk('vendor_confirmed', 'vendor confirmado', venAt, venDetail, !!venAt),
  ];
}

// Fetch + index analyzed comms (messages.analysis_v2 + v_je_call_analysis) for a
// set of lead_master_ids. NULL-safe: any error yields an empty index so every
// box degrades to three pending signals (never throws).
async function fetchCommsByLead(
  client: ReturnType<typeof getProdReadClient>,
  leadIds: number[],
): Promise<Record<number, CommsRow[]>> {
  const out: Record<number, CommsRow[]> = {};
  if (!client || leadIds.length === 0) return out;

  // Messages (WhatsApp/SMS) — analysis_v2 jsonb.
  try {
    const { data: msgRaw } = await client
      .from('messages')
      .select('lead_master_id, message_date, body, analysis_v2')
      .in('lead_master_id', leadIds)
      .not('analysis_v2', 'is', null)
      .order('message_date', { ascending: false })
      .limit(400);
    for (const m of (msgRaw ?? []) as Array<Record<string, unknown>>) {
      const lead = typeof m.lead_master_id === 'number' ? m.lead_master_id : null;
      if (lead == null) continue;
      const a = (m.analysis_v2 ?? {}) as Record<string, unknown>;
      const row: CommsRow = {
        leadMasterId: lead,
        at: typeof m.message_date === 'string' ? m.message_date : null,
        body: typeof m.body === 'string' ? m.body : '',
        conversationType: typeof a.conversation_type === 'string' ? a.conversation_type : '',
        sentiment: typeof a.sentiment === 'string' ? a.sentiment : '',
        keyInsight: typeof a.key_insight === 'string' ? a.key_insight : '',
        signals: asStringArray(a.buying_signals),
        commitmentsJe: asStringArray(a.commitments_je),
        commitmentsClient: asStringArray(a.commitments_client),
      };
      (out[lead] ??= []).push(row);
    }
  } catch {
    /* degrade: leave messages out of the index */
  }

  // Calls (v_je_call_analysis) — outcome/objection/key_quote, no jsonb.
  try {
    const { data: callRaw } = await client
      .from('v_je_call_analysis')
      .select('call_date, outcome, objection, key_quote, sb_mentioned, business_name, lead_state')
      .limit(400);
    // v_je_call_analysis is not keyed by lead_master_id, so we cannot join it to
    // a specific recipient reliably; we therefore DO NOT attribute call rows to a
    // lead here (avoids fabricating a per-box signal). Messages carry the per-lead
    // signal. The query is kept to confirm the source is reachable; if a future
    // lead key is added to the view, attribution can be wired here.
    void callRaw;
  } catch {
    /* degrade */
  }

  return out;
}

// Most recent dispatch date on or before `onOrBefore` (defaults to "any").
// Used so the surface lands on a day with real data when today is empty.
// Returns null if PROD is unconfigured or there are no rows.
export async function getMostRecentDispatchDate(
  onOrBefore: string | null = null,
): Promise<string | null> {
  const client = getProdReadClient();
  if (!client) return null;
  try {
    let q = client
      .from('dispatch_tracking')
      .select('ship_date')
      .order('ship_date', { ascending: false })
      .limit(1);
    if (onOrBefore) q = q.lte('ship_date', onOrBefore);
    const { data, error } = await q;
    if (error || !data || data.length === 0) return null;
    return normalizeIso((data[0] as Record<string, unknown>).ship_date);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main entry. NULL-safe: returns an honest empty/partial manifest on any
// failure. `date` is the ISO dispatch date the page is anchored on.
// ---------------------------------------------------------------------------
export async function getDispatchManifest(date: string): Promise<DispatchManifest> {
  const client = getProdReadClient();
  if (!client) return emptyManifest(date, false, null);

  try {
    // 1) dispatch_tracking for the dispatch date = spine of today's boxes ----
    const { data: trackingRaw, error: trkErr } = await client
      .from('dispatch_tracking')
      .select('id, tracking_number, ship_date, email_subject, email_sent_at, farm_breakdown')
      .eq('ship_date', date)
      .order('email_sent_at', { ascending: false, nullsFirst: false });
    if (trkErr) {
      return emptyManifest(date, true, trkErr.message);
    }
    const tracking = (trackingRaw ?? []) as Array<Record<string, unknown>>;
    const trackingNumbers = tracking
      .map((t) => (typeof t.tracking_number === 'string' ? t.tracking_number : null))
      .filter((v): v is string => !!v);

    // 2) sample_box_status enrichment, joined by tracking_number ------------
    const sbByTracking: Record<string, Record<string, unknown>> = {};
    if (trackingNumbers.length > 0) {
      const { data: sbRaw } = await client
        .from('sample_box_status')
        .select(
          'id, business_name, tracking_number, tracking_carrier, tracking_status, tracking_delivered_at, sb_status, products_sent, box_type, ship_city, ship_state, lead_master_id, sb_receipt_confirmed, sb_mentioned_in_call',
        )
        .in('tracking_number', trackingNumbers);
      for (const r of (sbRaw ?? []) as Array<Record<string, unknown>>) {
        const tn = typeof r.tracking_number === 'string' ? r.tracking_number : null;
        if (tn) sbByTracking[tn] = r;
      }
    }

    // 2b) comms-analysis index for D3 signals, keyed by lead_master_id --------
    const leadIds = Array.from(
      new Set(
        Object.values(sbByTracking)
          .map((sb) => (typeof sb.lead_master_id === 'number' ? sb.lead_master_id : null))
          .filter((v): v is number => v != null),
      ),
    );
    const commsByLead = await fetchCommsByLead(client, leadIds);

    const boxes: ManifestBox[] = tracking.map((t) => {
      const tn = String(t.tracking_number ?? '');
      const sb = sbByTracking[tn];
      const lead = typeof sb?.lead_master_id === 'number' ? (sb!.lead_master_id as number) : null;
      const deliveredAt = normalizeIso(sb?.tracking_delivered_at) ?? null;
      const signals = deriveSignals(
        lead != null ? commsByLead[lead] ?? [] : [],
        sb
          ? {
              receiptConfirmed: sb.sb_receipt_confirmed === true,
              deliveredAt,
              mentionedInCall: sb.sb_mentioned_in_call === true,
            }
          : null,
      );
      return {
        trackingNumber: tn,
        carrier: (sb?.tracking_carrier as string) ?? null,
        recipient: (sb?.business_name as string) ?? null,
        destination: sb ? fmtDestination(sb.ship_city, sb.ship_state) : null,
        boxType: (sb?.box_type as string) ?? null,
        products: (sb?.products_sent as string) ?? null,
        sbStatus: (sb?.sb_status as string) ?? null,
        trackingStatus: (sb?.tracking_status as string) ?? null,
        deliveredAt,
        leadMasterId: lead,
        signals,
      };
    });

    // 3) farm_shipments rollup for the same fly date ------------------------
    const farms: ManifestFarm[] = [];
    {
      const { data: farmRaw } = await client
        .from('farm_shipments')
        .select('id, farm, customer_name, fly_date, num_boxes, total_stems, awb')
        .eq('fly_date', date)
        .order('farm', { ascending: true });
      for (const r of (farmRaw ?? []) as Array<Record<string, unknown>>) {
        farms.push({
          farm: (r.farm as string) ?? 'Unknown farm',
          customer: (r.customer_name as string) ?? null,
          boxes: typeof r.num_boxes === 'number' ? r.num_boxes : 0,
          stems: typeof r.total_stems === 'number' ? r.total_stems : 0,
          awb: (r.awb as string) ?? null,
        });
      }
    }

    // 4) farm label emails (from dispatch_tracking subject/sent_at) ---------
    const farmEmails: ManifestEmail[] = tracking.map((t) => ({
      trackingNumber: String(t.tracking_number ?? ''),
      subject: (t.email_subject as string) ?? null,
      sentAt: (t.email_sent_at as string) ?? null,
      farms: parseFarmBreakdown(t.farm_breakdown),
    }));

    // 5) client notification emails (n8n_dispatch_queue) keyed by tracking --
    const clientNotifications: ClientNotification[] = [];
    if (trackingNumbers.length > 0) {
      const { data: queueRaw } = await client
        .from('n8n_dispatch_queue')
        .select(
          'queue_id, customer_name, customer_email, template_name, status, scheduled_send_at, sent_at, tracking_number',
        )
        .in('tracking_number', trackingNumbers)
        .order('scheduled_send_at', { ascending: false, nullsFirst: false });
      for (const r of (queueRaw ?? []) as Array<Record<string, unknown>>) {
        clientNotifications.push({
          customer: (r.customer_name as string) ?? null,
          email: (r.customer_email as string) ?? null,
          template: (r.template_name as string) ?? null,
          status: (r.status as string) ?? null,
          scheduledFor: (r.scheduled_send_at as string) ?? null,
          sentAt: (r.sent_at as string) ?? null,
          trackingNumber: (r.tracking_number as string) ?? null,
        });
      }
    }

    // 6) yesterday's outbound (prior dispatch date with rows) for arrivals --
    // We look back up to 7 days for the most recent dispatch date < `date`.
    let yesterday: ManifestBox[] = [];
    {
      const { data: priorTrkRaw } = await client
        .from('dispatch_tracking')
        .select('tracking_number, ship_date')
        .lt('ship_date', date)
        .order('ship_date', { ascending: false })
        .limit(50);
      const priorRows = (priorTrkRaw ?? []) as Array<Record<string, unknown>>;
      const priorDate = priorRows.length > 0 ? normalizeIso(priorRows[0].ship_date) : null;
      if (priorDate) {
        const priorTns = priorRows
          .filter((r) => normalizeIso(r.ship_date) === priorDate)
          .map((r) => (typeof r.tracking_number === 'string' ? r.tracking_number : null))
          .filter((v): v is string => !!v);
        if (priorTns.length > 0) {
          const { data: priorSbRaw } = await client
            .from('sample_box_status')
            .select(
              'business_name, tracking_number, tracking_carrier, tracking_status, tracking_delivered_at, sb_status, box_type, ship_city, ship_state',
            )
            .in('tracking_number', priorTns);
          yesterday = ((priorSbRaw ?? []) as Array<Record<string, unknown>>).map((r) => ({
            trackingNumber: String(r.tracking_number ?? ''),
            carrier: (r.tracking_carrier as string) ?? null,
            recipient: (r.business_name as string) ?? null,
            destination: fmtDestination(r.ship_city, r.ship_state),
            boxType: (r.box_type as string) ?? null,
            products: null,
            sbStatus: (r.sb_status as string) ?? null,
            trackingStatus: (r.tracking_status as string) ?? null,
            deliveredAt: normalizeIso(r.tracking_delivered_at) ?? null,
            // lead_master_id is intentionally NOT selected in the yesterday query
            // (these boxes carry no comms signals -> signals:[]), so this is null
            // by design rather than a dropped column.
            leadMasterId: null,
            signals: [],
          }));
        }
      }
    }

    const recipients = new Set(
      boxes.map((b) => b.recipient).filter((v): v is string => !!v),
    );
    const delivered = boxes.filter((b) => b.deliveredAt != null).length;

    return {
      configured: true,
      error: null,
      dispatchDate: date,
      boxes,
      farms,
      farmEmails,
      clientNotifications,
      yesterday,
      counts: {
        boxes: boxes.length,
        farms: farms.length || new Set(farmEmails.flatMap((e) => e.farms.map((f) => f.name))).size,
        recipients: recipients.size,
        delivered,
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return emptyManifest(date, true, msg);
  }
}
