// Sample Tracking — sent-samples tracking data layer.
// v1 | 2026-06-11 | Job_PM (CPO)
//
// PURPOSE
//   Returns the 3-level Dispatch "Enviadas" view data:
//     1. PeriodRollup  — cohort-wide aggregates (avg time-to-ship, avg interactions,
//                        close rate, learnings TLDR).
//     2. SentSample[]  — per-client summary (status, heat, enviado/tardamos, arrival,
//                        ultima llamada, interactions pre/durante/post).
//     3. DeepDive      — embedded per sample: timeline events + enrichment (liked,
//                        objection, hypothesis, notes).
//
// DATA SOURCES (PROD swhglnjyuorkycpgkmec, anon-readable via getProdReadClient):
//   v_sample_outcome        — outcome/conversion signal
//   v_sample_timeline       — wide 1-row/sample: request/dispatch/delivery dates + comms counts
//   v_sample_status_timeline — status events (requested/sent/dispatched/delivered/liked/received)
//   v_sample_email_events   — email events (direction, subject, event_at)
//   v_je_call_analysis      — call analysis (by business_name)
//
// LOGIC
//   WON  = account_status ilike '%Loyal%' OR '%New Client%' OR converted=true OR tag_compro=true
//   LOST = account_status ilike '%Lost%' OR '%Churned%' OR tag_molesta_mala_orden=true
//   PENDING = else
//
//   Arrival: delivered/received status_timeline event, else dispatched_at + 5d (labelled "estimado").
//   Time-to-ship: dispatched_at - request_at in days.
//   Interactions: calls + emails segmented by dispatched_at and arrival.
//   Heat: latest lead_quality from v_je_call_analysis.
//   Learnings TLDR: most common objection + % quoted + liked/molesta counts.
//
// NULL-SAFETY: never throws, all fields degrade to null/0/[]. Honest empties.
// SERVER-ONLY: uses service/anon PROD client — never import from browser code.

import { getProdReadClient } from '@/lib/supabase/prod-server';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function toBool(v: unknown): boolean | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'boolean') return v;
  const s = String(v).trim().toLowerCase();
  if (['true', 't', 'yes', 'y', '1'].includes(s)) return true;
  if (['false', 'f', 'no', 'n', '0'].includes(s)) return false;
  return null;
}

/** Parse ISO timestamp → Date; null on failure */
function parseDate(v: unknown): Date | null {
  if (!v) return null;
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d;
}

/** Days between two Dates (fractional, rounded to 1 decimal) */
function daysBetween(a: Date, b: Date): number {
  return Math.round(Math.abs(b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24) * 10) / 10;
}

/** Format ISO date string as dd/mm/yyyy */
function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = parseDate(iso);
  if (!d) return null;
  const day = String(d.getDate()).padStart(2, '0');
  const mon = String(d.getMonth() + 1).padStart(2, '0');
  const yr = d.getFullYear();
  return `${day}/${mon}/${yr}`;
}

/** Add N days to a Date, return new Date */
function addDays(d: Date, n: number): Date {
  const r = new Date(d.getTime());
  r.setDate(r.getDate() + n);
  return r;
}

// ---------------------------------------------------------------------------
// WON / LOST / PENDING classifier
// ---------------------------------------------------------------------------

export type CloseStatus = 'won' | 'lost' | 'pending';

/**
 * classifyOutcome — won/lost/pending from the COMBINED status (account_status for the ~31
 * accounts, lead_status for the rest) + outcome tags.
 *   won  = Loyal / New Client / converted / tag_compro
 *   lost = Lost / Churned / molesta_mala_orden
 *   pending = everything else (incl. lead funnel states: COLD / Bounced / SB - Recibido /
 *             SB - Interested / SB - Qualified ... — these are NOT lost, just not yet closed)
 * `combinedStatus` is account_status ?? lead_status — pass it so the lead funnel states are
 * matched against the same won/lost rules (none of them trip won/lost → they fall to pending).
 */
function classifyOutcome(
  row: {
    converted: unknown;
    tag_compro: unknown;
    tag_molesta_mala_orden: unknown;
  },
  combinedStatus: string | null,
): CloseStatus {
  const st = str(combinedStatus)?.toLowerCase() ?? '';
  if (
    st.includes('loyal') ||
    st.includes('new client') ||
    toBool(row.converted) === true ||
    toBool(row.tag_compro) === true
  )
    return 'won';
  if (
    st.includes('lost') ||
    st.includes('churned') ||
    toBool(row.tag_molesta_mala_orden) === true
  )
    return 'lost';
  // pending: lead funnel states (COLD / Bounced / SB - Recibido / SB - Interested / ...)
  // all land here — not yet closed.
  return 'pending';
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** One event in the deep-dive timeline */
export interface TrackingEvent {
  eventType: string | null; // status_timeline event_type OR 'email' OR 'call'
  eventAt: string | null;   // ISO timestamp
  direction: string | null; // for email/call
  subject: string | null;   // for email
  // call fields
  outcome: string | null;
  objection: string | null;
  leadQuality: string | null;
  keyQuote: string | null;
  durationSeconds: number | null;
  phase: 'pre' | 'durante' | 'post' | 'unknown'; // relative to dispatch window
}

/** Deep-dive payload embedded per SentSample */
export interface SampleDeepDive {
  timeline: TrackingEvent[];
  // Enrichment
  likedBox: boolean | null;
  closeReason: string | null;
  reasonWonLost: string | null;
  objection: string | null;      // latest call objection
  hypothesis: string | null;     // win/lose hypothesis from call analysis + outcome
  zohoNotes: string | null;
  prebooksCount: number | null;
  totalRevenue: number | null;
  lastOrderDate: string | null;
}

/** Per-client summary row (Level 2) */
export interface SentSample {
  leadMasterId: number | null;
  businessName: string;
  // Combined status: account_status (lifecycle, ~31 accounts) ?? lead_status (funnel,
  // the rest) — e.g. 'Loyal' / 'SB - Interested' / 'SB - Qualified' / 'SB - Ready to Ship'
  // / 'SB - Recibido (Follow Up)' / 'COLD' / 'Bounced' / 'Interested'. Coverage ~194/195.
  status: string | null;
  closeStatus: CloseStatus;
  sinMatch: boolean; // true ONLY when no account_status AND no lead_status (almost never)
  heat: string | null; // latest lead_quality from calls
  // Dates
  requestAt: string | null;
  dispatchedAt: string | null;
  dispatchedFmt: string | null;
  daysToShip: number | null;
  arrivalAt: string | null;       // ISO
  arrivalFmt: string | null;      // dd/mm/yyyy
  arrivalIsEstimated: boolean;    // true = dispatched_at + 5d assumption
  lastCallAt: string | null;
  // Interaction counts (segmented)
  interactionsPre: number;    // calls + emails before dispatched_at
  interactionsDurante: number; // calls + emails dispatched..arrival
  interactionPost: number;    // calls + emails after arrival
  callsCount: number;
  emailsCount: number;
  // Deep-dive (always present, lazy-loaded on click in UI)
  deepDive: SampleDeepDive;
}

/** Period-level rollup (Level 1) */
export interface PeriodRollup {
  sampleCount: number;
  avgDaysToShip: number | null;     // average (dispatched_at - request_at) in days
  avgInteractions: number | null;   // average total interactions per sample
  wonCount: number;
  lostCount: number;
  pendingCount: number;
  closeRate: number | null;         // won / (won + lost) — null when no closed samples
  // Learnings TLDR
  mostCommonObjection: string | null;
  pctQuoted: number | null;         // % that had a quote_total in v_sample_timeline
  likedCount: number;
  molestoCount: number;
}

/** Full return shape of getSentSamplesTracking */
export interface SentSamplesPayload {
  rollup: PeriodRollup;
  samples: SentSample[];
}

// ---------------------------------------------------------------------------
// Raw DB row shapes
// ---------------------------------------------------------------------------

interface OutcomeRaw {
  lead_master_id: number | null;
  business_name: string | null;
  sb_status: string | null;
  sample_dispatched_at: string | null;
  sb_liked_box: unknown;
  close_reason: string | null;
  zoho_account_id: string | null;
  account_status: string | null;
  reason_won_lost: string | null;
  tag_liked_sb: unknown;
  tag_liked_prices: unknown;
  tag_compro: unknown;
  tag_molesta_mala_orden: unknown;
  tag_hot: unknown;
  tag_received: unknown;
  zoho_notes: string | null;
  converted: unknown;
  prebooks_count: number | null;
  total_revenue: number | null;
  last_order_date: string | null;
}

interface TimelineWideRaw {
  lead_master_id: number | null;
  business_name: string | null;
  request_at: string | null;
  dispatched_at: string | null;
  delivered_at: string | null;
  current_status: string | null;
  calls_count: number | null;
  last_call_at: string | null;
  emails_count: number | null;
  quote_date: string | null;
  quote_total: number | null;
}

interface StatusEventRaw {
  lead_master_id: number | null;
  event_type: string | null;
  event_at: string | null;
}

interface EmailEventRaw {
  lead_master_id: number | null;
  direction: string | null;
  subject: string | null;
  event_at: string | null;
}

interface CallAnalysisRaw {
  business_name: string | null;
  call_date: string | null;
  direction: string | null;
  duration_seconds: number | null;
  outcome: string | null;
  objection: string | null;
  lead_quality: string | null;
  next_action: string | null;
  key_quote: string | null;
}

interface LeadStatusRaw {
  lead_master_id: number | null;
  lead_status: string | null;
}

// ---------------------------------------------------------------------------
// Main reader
// ---------------------------------------------------------------------------

/**
 * getSentSamplesTracking — reads all sent samples whose dispatched_at is within
 * [from, to] (YYYY-MM-DD inclusive). Returns rollup + per-sample payload.
 * Never throws. Honest empties everywhere.
 */
export async function getSentSamplesTracking(
  from: string,
  to: string,
): Promise<SentSamplesPayload> {
  const empty: SentSamplesPayload = {
    rollup: {
      sampleCount: 0,
      avgDaysToShip: null,
      avgInteractions: null,
      wonCount: 0,
      lostCount: 0,
      pendingCount: 0,
      closeRate: null,
      mostCommonObjection: null,
      pctQuoted: null,
      likedCount: 0,
      molestoCount: 0,
    },
    samples: [],
  };

  const prod = getProdReadClient();
  if (!prod) return empty;

  // ------------------------------------------------------------------
  // 1. Fetch v_sample_timeline filtered by dispatched_at in [from, to]
  // ------------------------------------------------------------------
  let timelineRows: TimelineWideRaw[] = [];
  try {
    const { data, error } = await prod
      .from('v_sample_timeline')
      .select(
        'lead_master_id, business_name, request_at, dispatched_at, delivered_at, ' +
          'current_status, calls_count, last_call_at, emails_count, quote_date, quote_total',
      )
      .gte('dispatched_at', from)
      .lte('dispatched_at', to + 'T23:59:59');
    if (!error && Array.isArray(data)) {
      timelineRows = data as unknown as TimelineWideRaw[];
    }
  } catch {
    /* degrade: empty */
  }

  if (timelineRows.length === 0) return empty;

  // Collect identifiers
  const leadIds: number[] = [];
  const businessNames: string[] = [];
  for (const r of timelineRows) {
    const lid = toNum(r.lead_master_id);
    if (lid !== null && !leadIds.includes(lid)) leadIds.push(lid);
    const bn = str(r.business_name);
    if (bn && !businessNames.includes(bn)) businessNames.push(bn);
  }

  // ------------------------------------------------------------------
  // 2. Fetch all supporting data in parallel (best-effort, degrade)
  // ------------------------------------------------------------------
  const [outcomeData, statusEventData, emailEventData, callAnalysisData, leadStatusData] = await Promise.all([
    // v_sample_outcome — by lead_master_id
    (async (): Promise<OutcomeRaw[]> => {
      if (leadIds.length === 0) return [];
      try {
        const { data, error } = await prod
          .from('v_sample_outcome')
          .select(
            'lead_master_id, business_name, sb_status, sample_dispatched_at, sb_liked_box, ' +
              'close_reason, zoho_account_id, account_status, reason_won_lost, ' +
              'tag_liked_sb, tag_liked_prices, tag_compro, tag_molesta_mala_orden, ' +
              'tag_hot, tag_received, zoho_notes, converted, prebooks_count, ' +
              'total_revenue, last_order_date',
          )
          .in('lead_master_id', leadIds);
        if (error || !Array.isArray(data)) return [];
        return data as unknown as OutcomeRaw[];
      } catch {
        return [];
      }
    })(),

    // v_sample_status_timeline — events for our lead_ids
    (async (): Promise<StatusEventRaw[]> => {
      if (leadIds.length === 0) return [];
      try {
        const { data, error } = await prod
          .from('v_sample_status_timeline')
          .select('lead_master_id, event_type, event_at')
          .in('lead_master_id', leadIds)
          .order('event_at', { ascending: true });
        if (error || !Array.isArray(data)) return [];
        return data as unknown as StatusEventRaw[];
      } catch {
        return [];
      }
    })(),

    // v_sample_email_events — emails for our lead_ids
    (async (): Promise<EmailEventRaw[]> => {
      if (leadIds.length === 0) return [];
      try {
        const { data, error } = await prod
          .from('v_sample_email_events')
          .select('lead_master_id, direction, subject, event_at')
          .in('lead_master_id', leadIds)
          .order('event_at', { ascending: true });
        if (error || !Array.isArray(data)) return [];
        return data as unknown as EmailEventRaw[];
      } catch {
        return [];
      }
    })(),

    // v_je_call_analysis — keyed by business_name (join by name)
    (async (): Promise<CallAnalysisRaw[]> => {
      if (businessNames.length === 0) return [];
      try {
        const { data, error } = await prod
          .from('v_je_call_analysis')
          .select(
            'business_name, call_date, direction, duration_seconds, outcome, ' +
              'objection, lead_quality, next_action, key_quote',
          )
          .in('business_name', businessNames)
          .order('call_date', { ascending: true });
        if (error || !Array.isArray(data)) return [];
        return data as unknown as CallAnalysisRaw[];
      } catch {
        return [];
      }
    })(),

    // v_sample_review — lead_status by lead_master_id. This is the funnel status for the
    // ~164 samples that are LEADS (not yet accounts): account_status only covers ~31/195,
    // COALESCE(account_status, lead_status) = 194/195. Anon-readable view. Degrade to [].
    (async (): Promise<LeadStatusRaw[]> => {
      if (leadIds.length === 0) return [];
      try {
        const { data, error } = await prod
          .from('v_sample_review')
          .select('lead_master_id, lead_status')
          .in('lead_master_id', leadIds);
        if (error || !Array.isArray(data)) return [];
        return data as unknown as LeadStatusRaw[];
      } catch {
        return [];
      }
    })(),
  ]);

  // ------------------------------------------------------------------
  // 3. Build lookup maps
  // ------------------------------------------------------------------

  // outcome by lead_master_id
  const outcomeByLead = new Map<number, OutcomeRaw>();
  for (const o of outcomeData) {
    const lid = toNum(o.lead_master_id);
    if (lid !== null && !outcomeByLead.has(lid)) outcomeByLead.set(lid, o);
  }

  // status events by lead_master_id
  const statusEventsByLead = new Map<number, StatusEventRaw[]>();
  for (const e of statusEventData) {
    const lid = toNum(e.lead_master_id);
    if (lid === null) continue;
    if (!statusEventsByLead.has(lid)) statusEventsByLead.set(lid, []);
    statusEventsByLead.get(lid)!.push(e);
  }

  // email events by lead_master_id
  const emailEventsByLead = new Map<number, EmailEventRaw[]>();
  for (const e of emailEventData) {
    const lid = toNum(e.lead_master_id);
    if (lid === null) continue;
    if (!emailEventsByLead.has(lid)) emailEventsByLead.set(lid, []);
    emailEventsByLead.get(lid)!.push(e);
  }

  // calls by business_name (lowercase)
  const callsByName = new Map<string, CallAnalysisRaw[]>();
  for (const c of callAnalysisData) {
    const bn = str(c.business_name)?.toLowerCase();
    if (!bn) continue;
    if (!callsByName.has(bn)) callsByName.set(bn, []);
    callsByName.get(bn)!.push(c);
  }

  // lead_status by lead_master_id (funnel status for samples that are still leads)
  const leadStatusByLead = new Map<number, string>();
  for (const r of leadStatusData) {
    const lid = toNum(r.lead_master_id);
    const ls = str(r.lead_status);
    if (lid !== null && ls && !leadStatusByLead.has(lid)) leadStatusByLead.set(lid, ls);
  }

  // ------------------------------------------------------------------
  // 4. Assemble per-sample rows
  // ------------------------------------------------------------------
  const samples: SentSample[] = [];

  for (const tl of timelineRows) {
    const lid = toNum(tl.lead_master_id);
    const businessName = str(tl.business_name) ?? '(sin nombre)';
    const bnKey = businessName.toLowerCase();

    const outcome = lid !== null ? outcomeByLead.get(lid) ?? null : null;
    const statusEvents = lid !== null ? (statusEventsByLead.get(lid) ?? []) : [];
    const emailEvents = lid !== null ? (emailEventsByLead.get(lid) ?? []) : [];
    const callRows = callsByName.get(bnKey) ?? [];

    // ---- Combined status (account lifecycle OR lead funnel) ----
    // account_status (~31 accounts) ?? lead_status from v_sample_review (the rest). ~194/195.
    const accountStatus = outcome ? str(outcome.account_status) : null;
    const leadStatus = lid !== null ? (leadStatusByLead.get(lid) ?? null) : null;
    const status: string | null = accountStatus ?? leadStatus;

    // ---- WON/LOST/PENDING ----
    // sinMatch ONLY when there is neither account_status nor lead_status (almost never).
    const sinMatch = !status;
    // classify against the combined status (outcome tags still apply even without a row).
    const closeStatus: CloseStatus = classifyOutcome(
      {
        converted: outcome?.converted,
        tag_compro: outcome?.tag_compro,
        tag_molesta_mala_orden: outcome?.tag_molesta_mala_orden,
      },
      status,
    );

    // ---- Dates ----
    const requestAt = str(tl.request_at);
    const dispatchedAt = str(tl.dispatched_at);
    const dispatchedDate = parseDate(dispatchedAt);

    // Arrival: look for delivered/received status event first
    let arrivalAt: string | null = null;
    let arrivalIsEstimated = false;
    const deliveryEvents = statusEvents.filter(
      (e) =>
        str(e.event_type)?.toLowerCase() === 'delivered' ||
        str(e.event_type)?.toLowerCase() === 'received',
    );
    if (deliveryEvents.length > 0) {
      // Use the earliest delivered/received event
      deliveryEvents.sort((a, b) => {
        const da = parseDate(a.event_at);
        const db = parseDate(b.event_at);
        if (!da && !db) return 0;
        if (!da) return 1;
        if (!db) return -1;
        return da.getTime() - db.getTime();
      });
      arrivalAt = str(deliveryEvents[0].event_at);
    } else if (str(tl.delivered_at)) {
      arrivalAt = str(tl.delivered_at);
    } else if (dispatchedDate) {
      // Assumption: dispatched_at + 5d
      arrivalAt = addDays(dispatchedDate, 5).toISOString();
      arrivalIsEstimated = true;
    }

    const arrivalDate = parseDate(arrivalAt);

    // Days to ship
    const requestDate = parseDate(requestAt);
    const daysToShip =
      requestDate && dispatchedDate ? daysBetween(requestDate, dispatchedDate) : null;

    // Heat: latest lead_quality from calls
    let heat: string | null = null;
    for (let i = callRows.length - 1; i >= 0; i--) {
      const lq = str(callRows[i].lead_quality);
      if (lq) {
        heat = lq;
        break;
      }
    }

    // Last call
    const lastCallAt = str(tl.last_call_at) ?? str(callRows[callRows.length - 1]?.call_date) ?? null;

    // ---- Interaction counts segmented ----
    // Phase classifier — relative to dispatched_at and arrival
    function classifyPhase(eventAt: string | null): 'pre' | 'durante' | 'post' | 'unknown' {
      if (!eventAt || !dispatchedDate) return 'unknown';
      const evDate = parseDate(eventAt);
      if (!evDate) return 'unknown';
      if (evDate < dispatchedDate) return 'pre';
      if (arrivalDate && evDate > arrivalDate) return 'post';
      return 'durante';
    }

    let interactionsPre = 0;
    let interactionsDurante = 0;
    let interactionPost = 0;

    for (const e of emailEvents) {
      const phase = classifyPhase(str(e.event_at));
      if (phase === 'pre') interactionsPre++;
      else if (phase === 'durante') interactionsDurante++;
      else if (phase === 'post') interactionPost++;
    }
    for (const c of callRows) {
      const phase = classifyPhase(str(c.call_date));
      if (phase === 'pre') interactionsPre++;
      else if (phase === 'durante') interactionsDurante++;
      else if (phase === 'post') interactionPost++;
    }

    // ---- Deep-dive: build full timeline ----
    const timelineEvents: TrackingEvent[] = [];

    // Status events
    for (const e of statusEvents) {
      timelineEvents.push({
        eventType: str(e.event_type) ?? 'status',
        eventAt: str(e.event_at),
        direction: null,
        subject: null,
        outcome: null,
        objection: null,
        leadQuality: null,
        keyQuote: null,
        durationSeconds: null,
        phase: classifyPhase(str(e.event_at)),
      });
    }

    // Email events
    for (const e of emailEvents) {
      timelineEvents.push({
        eventType: 'email',
        eventAt: str(e.event_at),
        direction: str(e.direction),
        subject: str(e.subject),
        outcome: null,
        objection: null,
        leadQuality: null,
        keyQuote: null,
        durationSeconds: null,
        phase: classifyPhase(str(e.event_at)),
      });
    }

    // Call events
    for (const c of callRows) {
      timelineEvents.push({
        eventType: 'call',
        eventAt: str(c.call_date),
        direction: str(c.direction),
        subject: null,
        outcome: str(c.outcome),
        objection: str(c.objection),
        leadQuality: str(c.lead_quality),
        keyQuote: str(c.key_quote),
        durationSeconds: toNum(c.duration_seconds),
        phase: classifyPhase(str(c.call_date)),
      });
    }

    // Sort timeline chronologically
    timelineEvents.sort((a, b) => {
      const da = parseDate(a.eventAt);
      const db = parseDate(b.eventAt);
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return da.getTime() - db.getTime();
    });

    // Latest objection from calls
    let latestObjection: string | null = null;
    for (let i = callRows.length - 1; i >= 0; i--) {
      const obj = str(callRows[i].objection);
      if (obj) {
        latestObjection = obj;
        break;
      }
    }

    // Win/lose hypothesis: synthesize from outcome + call signal
    function buildHypothesis(): string | null {
      const parts: string[] = [];
      if (outcome) {
        if (outcome.account_status) parts.push(`cuenta: ${outcome.account_status}`);
        if (str(outcome.reason_won_lost)) parts.push(`razon: ${str(outcome.reason_won_lost)}`);
        if (toBool(outcome.sb_liked_box) === true) parts.push('le gusto la caja');
        else if (toBool(outcome.sb_liked_box) === false) parts.push('no le gusto la caja');
      }
      if (heat) parts.push(`heat: ${heat}`);
      if (latestObjection) parts.push(`objecion: ${latestObjection}`);
      if (parts.length === 0) return null;
      return parts.join(' · ');
    }

    const deepDive: SampleDeepDive = {
      timeline: timelineEvents,
      likedBox: outcome ? toBool(outcome.sb_liked_box) : null,
      closeReason: outcome ? str(outcome.close_reason) : null,
      reasonWonLost: outcome ? str(outcome.reason_won_lost) : null,
      objection: latestObjection,
      hypothesis: buildHypothesis(),
      zohoNotes: outcome ? str(outcome.zoho_notes) : null,
      prebooksCount: outcome ? (toNum(outcome.prebooks_count) ?? null) : null,
      totalRevenue: outcome ? (toNum(outcome.total_revenue) ?? null) : null,
      lastOrderDate: outcome ? str(outcome.last_order_date) : null,
    };

    samples.push({
      leadMasterId: lid,
      businessName,
      status,
      closeStatus,
      sinMatch,
      heat,
      requestAt,
      dispatchedAt,
      dispatchedFmt: fmtDate(dispatchedAt),
      daysToShip,
      arrivalAt,
      arrivalFmt: fmtDate(arrivalAt),
      arrivalIsEstimated,
      lastCallAt,
      interactionsPre,
      interactionsDurante,
      interactionPost,
      callsCount: toNum(tl.calls_count) ?? callRows.length,
      emailsCount: toNum(tl.emails_count) ?? emailEvents.length,
      deepDive,
    });
  }

  // ------------------------------------------------------------------
  // 5. Compute rollup
  // ------------------------------------------------------------------

  const wonCount = samples.filter((s) => s.closeStatus === 'won').length;
  const lostCount = samples.filter((s) => s.closeStatus === 'lost').length;
  const pendingCount = samples.filter((s) => s.closeStatus === 'pending').length;
  const closedCount = wonCount + lostCount;
  const closeRate = closedCount > 0 ? Math.round((wonCount / closedCount) * 100) / 100 : null;

  // Avg days to ship
  const shipDays = samples.map((s) => s.daysToShip).filter((d): d is number => d !== null);
  const avgDaysToShip =
    shipDays.length > 0
      ? Math.round((shipDays.reduce((a, b) => a + b, 0) / shipDays.length) * 10) / 10
      : null;

  // Avg interactions (total per sample)
  const totalInteractions = samples.map(
    (s) => s.interactionsPre + s.interactionsDurante + s.interactionPost,
  );
  const avgInteractions =
    totalInteractions.length > 0
      ? Math.round((totalInteractions.reduce((a, b) => a + b, 0) / totalInteractions.length) * 10) / 10
      : null;

  // Most common objection
  const objectionCounts = new Map<string, number>();
  for (const s of samples) {
    const obj = s.deepDive.objection;
    if (obj) {
      objectionCounts.set(obj, (objectionCounts.get(obj) ?? 0) + 1);
    }
  }
  let mostCommonObjection: string | null = null;
  let maxObj = 0;
  for (const [obj, cnt] of objectionCounts) {
    if (cnt > maxObj) {
      maxObj = cnt;
      mostCommonObjection = obj;
    }
  }

  // % that had a quote (quote_total present in v_sample_timeline wide)
  // We already fetched timelineRows — count those with quote_total != null
  const quotedCount = timelineRows.filter((r) => toNum(r.quote_total) !== null).length;
  const pctQuoted =
    timelineRows.length > 0
      ? Math.round((quotedCount / timelineRows.length) * 100)
      : null;

  // Liked / molesta counts from outcome
  const likedCount = outcomeData.filter(
    (o) => toBool(o.tag_liked_sb) === true || toBool(o.sb_liked_box) === true,
  ).length;
  const molestoCount = outcomeData.filter(
    (o) => toBool(o.tag_molesta_mala_orden) === true,
  ).length;

  const rollup: PeriodRollup = {
    sampleCount: samples.length,
    avgDaysToShip,
    avgInteractions,
    wonCount,
    lostCount,
    pendingCount,
    closeRate,
    mostCommonObjection,
    pctQuoted,
    likedCount,
    molestoCount,
  };

  return { rollup, samples };
}
