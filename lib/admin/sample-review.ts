// Sample Review admin model — types + DB read/compose helpers for the Sample Review surface.
// v1 | 2026-06-09 | Job_PM (CPO)
//
// PURPOSE
//   Data/logic layer behind the "Sample Review" admin surface. Reads the sample cohort
//   (SB_READY) + comms/qualification signal from PRODUCTION (swhglnjyuorkycpgkmec, READ-ONLY),
//   reads the loop-state from BACKUP (ibckhcjvyxzrhvdiazbx, service role), composes one row
//   model per sample, and computes Job's DIRECTIONAL hypotheses (win hypothesis, quality read,
//   proposed box composition).
//
// DATA HONESTY
//   - We read RAW PROD tables directionally. Rose will later supply certified views
//     (v_sample_review, etc.). Every row therefore carries dataNote = "directional ...".
//   - NO invented numeric scores. Facu killed invented models (2026-06-09). All judgments are
//     prose grounded in REAL signal (qualification text + engagement volume + talk time + liked).
//
// SWAP-LATER CONTRACT
//   Every PROD read lives in a small named helper (readCohort / readEngagement /
//   readQualification / readTimeline). When Rose ships certified views, swapping each helper to
//   read the view is a ONE-FUNCTION change — callers and the row composer stay untouched.
//
// NULL-SAFETY
//   The PROD client may be null (env not configured), and tables/columns may be absent. Every
//   helper degrades to empty/null and NEVER throws. The BACKUP client is required for loop tables.
//
// SERVER-ONLY: these functions run in server components / API routes (service role).

import { getProdReadClient } from '@/lib/supabase/prod-server';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';

// ---------------------------------------------------------------------------
// Shared contract — other files import these types. Do not rename.
// ---------------------------------------------------------------------------

export interface SampleCommsItem {
  type: 'call' | 'email' | 'message';
  at: string | null;
  direction: string | null;
  durationSeconds: number | null;
  summary: string | null;
  analysis: string | null;
}

export interface SampleExternalProfile {
  hasWebsite: boolean | null;
  websiteUrl: string | null;
  reviewsRating: number | null;
  reviewsCount: number | null;
  socials: string | null;
  runsAds: boolean | null;
  sells: string | null;
  priceRange: string | null;
  provenance: string;
}

export type SampleReviewStatus =
  | 'draft'
  | 'in_review'
  | 'aligned'
  | 'rejected'
  | 'question_open'
  | 'answered';

export interface SampleReviewRow {
  loopId: string | null;
  leadMasterId: number | null;
  businessName: string;
  cohortDate: string | null;
  status: SampleReviewStatus;
  facuDecision: string | null;
  questionText: string | null;
  jjAnswer: string | null;
  jjScore: number | string | null;
  jjReasoning: string | null;
  currentSupplier: string | null;
  pricesTheyPay: string | null;
  productsInterest: string | null;
  objection: string | null;
  pitchResonated: string | null;
  keyQuote: string | null;
  businessType: string | null;
  callsCount: number;
  talkSeconds: number;
  emailsCount: number;
  messagesCount: number;
  addressComplete: boolean;
  addressSource: string | null;
  preShipOk: boolean;
  preShipBlockReason: string | null;
  boxType: string | null;
  productsSent: string | null;
  likedBox: boolean | null;
  likedAt: string | null;
  trackingNumber: string | null;
  trackingStatus: string | null;
  dispatchDate: string | null;
  deliveredAt: string | null;
  dispatchState: 'pending' | 'shipped' | 'delivered';
  timeline: SampleCommsItem[];
  winHypothesis: string;
  qualityRead: { verdict: 'good' | 'bad' | 'unclear'; why: string };
  proposedComposition: string | null;
  externalProfile: SampleExternalProfile | null;
  dataNote: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DATA_NOTE =
  'directional — reads raw PROD tables; pending Rose certified views (v_sample_review)';

// ---------------------------------------------------------------------------
// Internal raw shapes (loosely typed — PROD columns are read directionally and
// may be absent; we never rely on a column being present).
// ---------------------------------------------------------------------------

interface CohortRaw {
  business_name: string | null;
  lead_master_id: number | null;
  zoho_id: string | null;
  sb_status: string | null;
  products_sent: string | null;
  box_type: string | null;
  pre_ship_validated: boolean | null;
  pre_ship_block_reason: string | null;
  sb_receipt_confirmed: unknown;
  liked_at: string | null;
  ship_name: string | null;
  ship_address: string | null;
  ship_city: string | null;
  ship_state: string | null;
  ship_zip: string | null;
  ship_phone: string | null;
  ship_country: string | null;
  address_source: string | null;
  tracking_number: string | null;
  tracking_status: string | null;
  sheet_dispatch_date: string | null;
  tracking_delivered_at: string | null;
}

interface EngagementAgg {
  callsCount: number;
  talkSeconds: number;
  messagesCount: number;
  emailsCount: number;
}

interface QualificationRaw {
  sb_qualification: string | null;
  sb_qualification_logc: string | null;
  sb_objection: string | null;
  sb_current_supplier: string | null;
  sb_prices_they_pay: string | null;
  sb_products_interest: string | null;
  sb_pitch_resonated: string | null;
  sb_key_quote: string | null;
  sb_business_type: string | null;
  // lead_quality is derived from call analysis, not zoho_leads — carried alongside.
  lead_quality: string | null;
}

interface LoopRaw {
  id: string;
  lead_master_id: number | null;
  business_name: string | null;
  cohort_date: string | null;
  status: string | null;
  facu_decision: string | null;
  question_text: string | null;
  jj_answer: string | null;
  rejected_reason: string | null;
  proposed_composition: unknown;
  confirmed_composition: unknown;
  updated_at: string | null;
}

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

function s(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const str = String(v).trim();
  return str.length ? str : null;
}

function asBoolish(v: unknown): boolean | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'boolean') return v;
  const str = String(v).trim().toLowerCase();
  if (['true', 't', 'yes', 'y', '1', 'liked'].includes(str)) return true;
  if (['false', 'f', 'no', 'n', '0'].includes(str)) return false;
  // Any non-empty timestamp-like / textual affirmative value means "liked".
  return true;
}

function jsonbToString(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return v.trim().length ? v : null;
  try {
    const str = JSON.stringify(v);
    return str && str !== '{}' && str !== 'null' ? str : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// PROD READ HELPERS (one function each → swap to Rose's certified views later)
// ---------------------------------------------------------------------------

/**
 * readCohort — the sample cohort from sample_box_status. Includes BOTH ship-ready
 * (SB_READY) and already-shipped (SB_RECEIVED) samples so the surface can separate
 * "pendientes de dispatch" from "ya enviados (follow-up)".
 * Swap target: SELECT * FROM v_sample_review (cohort slice).
 * Optionally narrowed to a single lead for the detail view.
 */
async function readCohort(leadMasterId?: number): Promise<CohortRaw[]> {
  const prod = getProdReadClient();
  if (!prod) return [];
  try {
    let q = prod
      .from('sample_box_status')
      .select(
        'business_name, lead_master_id, zoho_id, sb_status, products_sent, box_type, ' +
          'pre_ship_validated, pre_ship_block_reason, sb_receipt_confirmed, liked_at, ' +
          'ship_name, ship_address, ship_city, ship_state, ship_zip, ship_phone, ' +
          'ship_country, address_source, ' +
          'tracking_number, tracking_status, sheet_dispatch_date, tracking_delivered_at',
      )
      .in('sb_status', ['SB_READY', 'SB_RECEIVED'])
      // Exclude the internal test account (pollutes the cohort).
      .not('business_name', 'ilike', '%floropolis%test%');
    if (typeof leadMasterId === 'number') q = q.eq('lead_master_id', leadMasterId);
    const { data, error } = await q;
    if (error || !data) return [];
    return data as unknown as CohortRaw[];
  } catch {
    return [];
  }
}

/**
 * readEngagement — per-lead comms volume aggregates from calls / messages / rep_emails.
 * Swap target: SELECT ... FROM v_sample_review (engagement columns).
 * zoho_crm_emails has no lead_master_id, so v1 counts rep_emails only (see dataNote).
 */
async function readEngagement(
  leadMasterIds: number[],
): Promise<Map<number, EngagementAgg>> {
  const out = new Map<number, EngagementAgg>();
  for (const id of leadMasterIds) {
    out.set(id, { callsCount: 0, talkSeconds: 0, messagesCount: 0, emailsCount: 0 });
  }
  const prod = getProdReadClient();
  if (!prod || leadMasterIds.length === 0) return out;

  // calls: count + sum(duration_seconds)
  try {
    const { data } = await prod
      .from('calls')
      .select('lead_master_id, duration_seconds')
      .in('lead_master_id', leadMasterIds);
    if (data) {
      for (const r of data as Array<{ lead_master_id: number | null; duration_seconds: number | null }>) {
        if (r.lead_master_id == null) continue;
        const agg = out.get(r.lead_master_id);
        if (!agg) continue;
        agg.callsCount += 1;
        agg.talkSeconds += Number(r.duration_seconds) || 0;
      }
    }
  } catch {
    /* degrade: leave zeros */
  }

  // messages: count
  try {
    const { data } = await prod
      .from('messages')
      .select('lead_master_id')
      .in('lead_master_id', leadMasterIds);
    if (data) {
      for (const r of data as Array<{ lead_master_id: number | null }>) {
        if (r.lead_master_id == null) continue;
        const agg = out.get(r.lead_master_id);
        if (agg) agg.messagesCount += 1;
      }
    }
  } catch {
    /* degrade */
  }

  // rep_emails: count (zoho_crm_emails omitted in v1 — no lead_master_id join)
  try {
    const { data } = await prod
      .from('rep_emails')
      .select('lead_master_id')
      .in('lead_master_id', leadMasterIds);
    if (data) {
      for (const r of data as Array<{ lead_master_id: number | null }>) {
        if (r.lead_master_id == null) continue;
        const agg = out.get(r.lead_master_id);
        if (agg) agg.emailsCount += 1;
      }
    }
  } catch {
    /* degrade */
  }

  return out;
}

let _qualTableCache: string | null | undefined; // undefined=unprobed, null=not found

/**
 * probeQualificationTable — discover (once) the public table holding 'SB_Qualification'.
 * The exact table is not assumed; we probe information_schema case-insensitively.
 * Returns the table name (e.g. 'zoho_leads') or null if absent. Never throws.
 * Swap target: drop this probe once Rose's certified view supplies qualification.
 */
async function probeQualificationTable(): Promise<string | null> {
  if (_qualTableCache !== undefined) return _qualTableCache;
  const prod = getProdReadClient();
  if (!prod) {
    _qualTableCache = null;
    return null;
  }
  try {
    const { data, error } = await prod
      .from('information_schema.columns')
      .select('table_name')
      .eq('table_schema', 'public')
      .ilike('column_name', 'SB_Qualification')
      .limit(1);
    if (error || !data || data.length === 0) {
      _qualTableCache = null;
      return null;
    }
    _qualTableCache = (data[0] as { table_name: string }).table_name ?? null;
    return _qualTableCache;
  } catch {
    _qualTableCache = null;
    return null;
  }
}

/**
 * readQualification — qualification fields keyed by zoho_id, plus lead_quality from
 * v_je_call_analysis keyed by lead_master_id. NULL-safe: if the table/columns are absent
 * (probe miss), returns empty maps and the row composer fills nulls.
 * Swap target: SELECT ... FROM v_sample_review (qualification columns, all keys resolved).
 *
 * Returns two maps because qualification lives on a zoho_id-keyed table while lead_quality
 * is call-derived (lead_master_id-keyed).
 */
async function readQualification(
  cohort: CohortRaw[],
): Promise<{ byZoho: Map<string, QualificationRaw>; leadQualityByLead: Map<number, string> }> {
  const byZoho = new Map<string, QualificationRaw>();
  const leadQualityByLead = new Map<number, string>();
  const prod = getProdReadClient();
  if (!prod) return { byZoho, leadQualityByLead };

  const zohoIds = Array.from(
    new Set(cohort.map((c) => s(c.zoho_id)).filter((z): z is string => !!z)),
  );
  const leadIds = Array.from(
    new Set(
      cohort
        .map((c) => c.lead_master_id)
        .filter((l): l is number => typeof l === 'number'),
    ),
  );

  // lead_quality from v_je_call_analysis (best non-null per lead).
  if (leadIds.length) {
    // v_je_call_analysis is keyed by call, not lead — it carries business_name not
    // lead_master_id reliably. We fetch lead_quality via the calls/analysis path only if
    // the view exposes a lead key; degrade silently otherwise. We attempt a join through
    // the calls table's lead_master_id is not possible here, so we read the view's own
    // lead_quality grouped by business_name as a directional fallback below.
    try {
      const { data } = await prod
        .from('v_je_call_analysis')
        .select('business_name, lead_quality, call_date')
        .order('call_date', { ascending: false });
      if (data) {
        const byName = new Map<string, string>();
        for (const r of data as Array<{ business_name: string | null; lead_quality: string | null }>) {
          const name = s(r.business_name);
          const lq = s(r.lead_quality);
          if (name && lq && !byName.has(name.toLowerCase())) {
            byName.set(name.toLowerCase(), lq);
          }
        }
        for (const c of cohort) {
          const name = s(c.business_name);
          if (c.lead_master_id != null && name) {
            const lq = byName.get(name.toLowerCase());
            if (lq) leadQualityByLead.set(c.lead_master_id, lq);
          }
        }
      }
    } catch {
      /* degrade: no lead_quality */
    }
  }

  // Qualification fields from the probed table (keyed by zoho_id).
  const table = await probeQualificationTable();
  if (!table || zohoIds.length === 0) return { byZoho, leadQualityByLead };

  try {
    const { data, error } = await prod
      .from(table)
      .select(
        'zoho_id, sb_qualification, sb_qualification_logc, sb_objection, sb_current_supplier, ' +
          'sb_prices_they_pay, sb_products_interest, sb_pitch_resonated, sb_key_quote, sb_business_type',
      )
      .in('zoho_id', zohoIds);
    if (!error && data) {
      for (const r of data as unknown as Array<Record<string, unknown>>) {
        const zoho = s(r.zoho_id);
        if (!zoho) continue;
        byZoho.set(zoho, {
          sb_qualification: s(r.sb_qualification),
          sb_qualification_logc: s(r.sb_qualification_logc),
          sb_objection: s(r.sb_objection),
          sb_current_supplier: s(r.sb_current_supplier),
          sb_prices_they_pay: s(r.sb_prices_they_pay),
          sb_products_interest: s(r.sb_products_interest),
          sb_pitch_resonated: s(r.sb_pitch_resonated),
          sb_key_quote: s(r.sb_key_quote),
          sb_business_type: s(r.sb_business_type),
          lead_quality: null,
        });
      }
    }
  } catch {
    /* degrade: nulls */
  }

  return { byZoho, leadQualityByLead };
}

/**
 * readTimeline — unified comms timeline for ONE lead from activity_timeline, enriched by
 * v_je_call_analysis on the call rows. NULL-safe: empty array on any failure.
 * Swap target: SELECT ... FROM v_sample_review_timeline.
 */
async function readTimeline(leadMasterId: number): Promise<SampleCommsItem[]> {
  const prod = getProdReadClient();
  if (!prod || typeof leadMasterId !== 'number') return [];

  const items: SampleCommsItem[] = [];

  try {
    const { data } = await prod
      .from('activity_timeline')
      .select('activity_type, activity_at, direction, duration_seconds, content_summary')
      .eq('lead_master_id', leadMasterId)
      .order('activity_at', { ascending: true });
    if (data) {
      for (const r of data as Array<{
        activity_type: string | null;
        activity_at: string | null;
        direction: string | null;
        duration_seconds: number | null;
        content_summary: string | null;
      }>) {
        const t = (s(r.activity_type) || '').toLowerCase();
        const type: SampleCommsItem['type'] = t.includes('call')
          ? 'call'
          : t.includes('email')
            ? 'email'
            : 'message';
        items.push({
          type,
          at: s(r.activity_at),
          direction: s(r.direction),
          durationSeconds:
            r.duration_seconds == null ? null : Number(r.duration_seconds) || 0,
          summary: s(r.content_summary),
          analysis: null,
        });
      }
    }
  } catch {
    return [];
  }

  // Enrich call items with analysis from v_je_call_analysis (matched directionally by
  // call_date proximity to activity_at). Best-effort; failures leave analysis null.
  try {
    const { data } = await prod
      .from('v_je_call_analysis')
      .select('call_date, direction, duration_seconds, outcome, objection, key_quote, lead_quality, pricing_discussed');
    if (data) {
      const analyses = (data as Array<{
        call_date: string | null;
        outcome: string | null;
        objection: string | null;
        key_quote: string | null;
        lead_quality: string | null;
        pricing_discussed: unknown;
        duration_seconds: number | null;
      }>).filter((a) => s(a.call_date));
      for (const item of items) {
        if (item.type !== 'call' || !item.at) continue;
        const itemTime = Date.parse(item.at);
        if (Number.isNaN(itemTime)) continue;
        let best: (typeof analyses)[number] | null = null;
        let bestDelta = Infinity;
        for (const a of analyses) {
          const at = Date.parse(a.call_date as string);
          if (Number.isNaN(at)) continue;
          const delta = Math.abs(at - itemTime);
          if (delta < bestDelta) {
            bestDelta = delta;
            best = a;
          }
        }
        // Within 1 day → treat as the same call.
        if (best && bestDelta <= 24 * 60 * 60 * 1000) {
          const parts: string[] = [];
          if (s(best.outcome)) parts.push(`outcome: ${s(best.outcome)}`);
          if (s(best.lead_quality)) parts.push(`quality: ${s(best.lead_quality)}`);
          if (s(best.objection)) parts.push(`objection: ${s(best.objection)}`);
          if (asBoolish(best.pricing_discussed)) parts.push('pricing discussed');
          if (s(best.key_quote)) parts.push(`quote: "${s(best.key_quote)}"`);
          item.analysis = parts.length ? parts.join(' · ') : null;
        }
      }
    }
  } catch {
    /* degrade: call items keep analysis=null */
  }

  return items;
}

// ---------------------------------------------------------------------------
// BACKUP READ HELPER (loop state)
// ---------------------------------------------------------------------------

/**
 * readLoopState — sample_review_loop rows from BACKUP. Matched to a cohort row by
 * lead_master_id, with business_name (lowercased) as a fallback key.
 */
async function readLoopState(): Promise<{
  byLead: Map<number, LoopRaw>;
  byName: Map<string, LoopRaw>;
}> {
  const byLead = new Map<number, LoopRaw>();
  const byName = new Map<string, LoopRaw>();
  let backup;
  try {
    backup = getBackupServiceClient();
  } catch {
    return { byLead, byName };
  }
  try {
    const { data, error } = await backup
      .from('sample_review_loop')
      .select(
        'id, lead_master_id, business_name, cohort_date, status, facu_decision, ' +
          'question_text, jj_answer, rejected_reason, proposed_composition, ' +
          'confirmed_composition, updated_at',
      );
    if (error || !data) return { byLead, byName };
    for (const r of data as unknown as LoopRaw[]) {
      if (r.lead_master_id != null && !byLead.has(r.lead_master_id)) {
        byLead.set(r.lead_master_id, r);
      }
      const name = s(r.business_name);
      if (name && !byName.has(name.toLowerCase())) {
        byName.set(name.toLowerCase(), r);
      }
    }
  } catch {
    /* degrade: empty maps → all samples default to in_review */
  }
  return { byLead, byName };
}

// ---------------------------------------------------------------------------
// JOB-COMPUTED DIRECTIONAL HYPOTHESES (no invented numeric scores)
// ---------------------------------------------------------------------------

/**
 * computeWinHypothesis — one-paragraph "why we win this customer", synthesized from real
 * qualification + lead_quality signal. If inputs are mostly null, says so honestly.
 */
function computeWinHypothesis(q: {
  currentSupplier: string | null;
  pricesTheyPay: string | null;
  productsInterest: string | null;
  pitchResonated: string | null;
  objection: string | null;
  leadQuality: string | null;
}): string {
  const signals: string[] = [];
  if (q.currentSupplier)
    signals.push(`they currently buy from ${q.currentSupplier}`);
  if (q.pricesTheyPay) signals.push(`paying ${q.pricesTheyPay} today`);
  if (q.productsInterest) signals.push(`interested in ${q.productsInterest}`);
  if (q.pitchResonated) signals.push(`the pitch landed on: ${q.pitchResonated}`);
  if (q.leadQuality) signals.push(`call analysis read them as ${q.leadQuality} quality`);

  const populated = signals.length;
  if (populated <= 1) {
    return 'Insufficient signal to form a win hypothesis — need qualification from JJ (current supplier, prices they pay, products of interest, what resonated).';
  }

  let para = `Why we win: ${signals.join('; ')}.`;
  if (q.objection) {
    para += ` Open objection to clear: ${q.objection}.`;
  }
  para +=
    ' This is a directional read of recorded qualification — confirm against JJ before acting.';
  return para;
}

/**
 * computeQualityRead — good/bad/unclear from REAL signal only. No invented score.
 */
function computeQualityRead(input: {
  callsCount: number;
  talkSeconds: number;
  messagesCount: number;
  emailsCount: number;
  likedBox: boolean | null;
  hasQualification: boolean;
  leadQuality: string | null;
}): { verdict: 'good' | 'bad' | 'unclear'; why: string } {
  const { callsCount, talkSeconds, messagesCount, emailsCount, likedBox, hasQualification, leadQuality } =
    input;
  const totalTouches = callsCount + messagesCount + emailsCount;
  const talkMin = Math.round(talkSeconds / 60);
  const lq = (leadQuality || '').toLowerCase();

  // Strong positive: liked the box, or real talk time + qualification on file.
  if (likedBox === true && (talkSeconds >= 120 || hasQualification)) {
    return {
      verdict: 'good',
      why: `Liked the box and engaged (${callsCount} calls, ${talkMin}m talk, ${totalTouches} total touches)${hasQualification ? '; qualification on file' : ''}.`,
    };
  }
  if (lq.includes('high') || lq.includes('hot') || lq.includes('good')) {
    return {
      verdict: 'good',
      why: `Call analysis rates them ${leadQuality}; ${talkMin}m talk across ${callsCount} calls.`,
    };
  }
  if (talkSeconds >= 300 && hasQualification) {
    return {
      verdict: 'good',
      why: `Substantial engagement (${talkMin}m talk, ${totalTouches} touches) with qualification captured.`,
    };
  }

  // Negative: explicit dislike, or essentially no engagement at all.
  if (likedBox === false) {
    return {
      verdict: 'bad',
      why: `Did not like the box${totalTouches ? ` despite ${totalTouches} touches` : ''}.`,
    };
  }
  if (lq.includes('low') || lq.includes('cold') || lq.includes('bad')) {
    return { verdict: 'bad', why: `Call analysis rates them ${leadQuality}.` };
  }
  if (totalTouches === 0 && !hasQualification && likedBox == null) {
    return {
      verdict: 'bad',
      why: 'No recorded calls, messages, or emails and no qualification — cold sample.',
    };
  }

  // Otherwise: not enough to judge.
  const missing: string[] = [];
  if (!hasQualification) missing.push('qualification from JJ');
  if (likedBox == null) missing.push('box-liked confirmation');
  if (totalTouches === 0) missing.push('any logged comms');
  return {
    verdict: 'unclear',
    why: `Mixed/thin signal (${totalTouches} touches, ${talkMin}m talk)${missing.length ? `; missing: ${missing.join(', ')}` : ''}.`,
  };
}

/**
 * computeProposedComposition — directional box-contents proposal from productsInterest.
 * Returns null if no productsInterest signal exists.
 */
function computeProposedComposition(productsInterest: string | null): string | null {
  if (!productsInterest) return null;
  return `Directional proposal — lead box on what they asked for (${productsInterest}); confirm assortment + grades with JJ before composing.`;
}

// ---------------------------------------------------------------------------
// External profile (Rose's florist_external_profile — PROD, join by lead_master_id)
// ---------------------------------------------------------------------------

async function readExternalProfiles(
  leadMasterIds: number[],
): Promise<Map<number, SampleExternalProfile>> {
  const out = new Map<number, SampleExternalProfile>();
  const prod = getProdReadClient();
  if (!prod || leadMasterIds.length === 0) return out;
  const toNum = (v: unknown): number | null => {
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  };
  try {
    const { data, error } = await prod
      .from('florist_external_profile')
      .select(
        'lead_master_id, has_website, website_url, google_rating, google_review_count, ' +
          'yelp_rating, yelp_review_count, instagram_url, facebook_url, social_platforms, ' +
          'runs_meta_ads, runs_google_ads, what_they_sell, primary_products, price_range, ' +
          'yelp_price_range, source, not_found',
      )
      .in('lead_master_id', leadMasterIds);
    if (error || !Array.isArray(data)) return out;
    for (const r of data as unknown as Record<string, unknown>[]) {
      const lid = toNum(r.lead_master_id);
      if (lid === null || r.not_found === true) continue;
      const socials: string[] = [];
      if (s(r.instagram_url)) socials.push('IG');
      if (s(r.facebook_url)) socials.push('FB');
      const runsAds =
        r.runs_meta_ads === true || r.runs_google_ads === true
          ? true
          : r.runs_meta_ads === false || r.runs_google_ads === false
            ? false
            : null;
      out.set(lid, {
        hasWebsite: typeof r.has_website === 'boolean' ? r.has_website : null,
        websiteUrl: s(r.website_url),
        reviewsRating: toNum(r.google_rating) ?? toNum(r.yelp_rating),
        reviewsCount: toNum(r.google_review_count) ?? toNum(r.yelp_review_count),
        socials: socials.length ? socials.join(', ') : s(r.social_platforms),
        runsAds,
        sells: s(r.what_they_sell) ?? s(r.primary_products),
        priceRange: s(r.price_range) ?? s(r.yelp_price_range),
        provenance: s(r.source) ?? 'external_research',
      });
    }
  } catch {
    /* degrade to empty — NULL-safe */
  }
  return out;
}

// ---------------------------------------------------------------------------
// Row composer
// ---------------------------------------------------------------------------

function composeRow(args: {
  cohort: CohortRaw;
  engagement: EngagementAgg | undefined;
  qual: QualificationRaw | undefined;
  leadQuality: string | null;
  loop: LoopRaw | undefined;
  timeline: SampleCommsItem[];
  externalProfile?: SampleExternalProfile | null;
}): SampleReviewRow {
  const { cohort, engagement, qual, leadQuality, loop, timeline, externalProfile } = args;

  const eng: EngagementAgg = engagement ?? {
    callsCount: 0,
    talkSeconds: 0,
    messagesCount: 0,
    emailsCount: 0,
  };

  const businessName =
    s(cohort.business_name) || s(loop?.business_name) || '(unknown business)';

  // Loop-state merge — default in_review when no loop row exists.
  const allowed: SampleReviewStatus[] = [
    'draft',
    'in_review',
    'aligned',
    'rejected',
    'question_open',
    'answered',
  ];
  const rawStatus = s(loop?.status) as SampleReviewStatus | null;
  const status: SampleReviewStatus =
    rawStatus && allowed.includes(rawStatus) ? rawStatus : 'in_review';

  // Qualification (NULL-safe).
  const currentSupplier = qual?.sb_current_supplier ?? null;
  const pricesTheyPay = qual?.sb_prices_they_pay ?? null;
  const productsInterest = qual?.sb_products_interest ?? null;
  const objection = qual?.sb_objection ?? null;
  const pitchResonated = qual?.sb_pitch_resonated ?? null;
  const keyQuote = qual?.sb_key_quote ?? null;
  const businessType = qual?.sb_business_type ?? null;
  const jjScore = qual?.sb_qualification ?? null; // raw qualification value (string|null) — NOT invented
  const jjReasoning = qual?.sb_qualification_logc ?? null;
  const hasQualification = !!(
    currentSupplier ||
    pricesTheyPay ||
    productsInterest ||
    objection ||
    pitchResonated ||
    keyQuote ||
    jjScore ||
    jjReasoning
  );

  // Address completeness (all core ship fields present).
  const addressComplete = !!(
    s(cohort.ship_address) &&
    s(cohort.ship_city) &&
    s(cohort.ship_state) &&
    s(cohort.ship_zip)
  );

  // Pre-ship gate.
  const preShipOk = cohort.pre_ship_validated === true;
  const preShipBlockReason = preShipOk ? null : s(cohort.pre_ship_block_reason);

  const likedAt = s(cohort.liked_at);
  const likedBox = cohort.liked_at != null ? asBoolish(cohort.liked_at) : null;

  // Dispatch state (NULL-safe). delivered > shipped > pending.
  //   delivered → tracking_delivered_at present
  //   shipped   → sb_status === 'SB_RECEIVED' OR a tracking number exists
  //   pending   → otherwise (still ship-ready, not yet dispatched)
  const trackingNumber = s(cohort.tracking_number);
  const trackingStatus = s(cohort.tracking_status);
  const dispatchDate = s(cohort.sheet_dispatch_date);
  const deliveredAt = s(cohort.tracking_delivered_at);
  const dispatchState: SampleReviewRow['dispatchState'] = deliveredAt
    ? 'delivered'
    : s(cohort.sb_status) === 'SB_RECEIVED' || trackingNumber
      ? 'shipped'
      : 'pending';

  const winHypothesis = computeWinHypothesis({
    currentSupplier,
    pricesTheyPay,
    productsInterest,
    pitchResonated,
    objection,
    leadQuality,
  });

  const qualityRead = computeQualityRead({
    callsCount: eng.callsCount,
    talkSeconds: eng.talkSeconds,
    messagesCount: eng.messagesCount,
    emailsCount: eng.emailsCount,
    likedBox,
    hasQualification,
    leadQuality,
  });

  // proposed_composition: prefer the confirmed/proposed jsonb from the loop if present,
  // else Job's directional proposal from productsInterest.
  const loopComposition =
    jsonbToString(loop?.confirmed_composition) ?? jsonbToString(loop?.proposed_composition);
  const proposedComposition =
    loopComposition ?? computeProposedComposition(productsInterest);

  return {
    loopId: loop?.id ?? null,
    leadMasterId: cohort.lead_master_id ?? loop?.lead_master_id ?? null,
    businessName,
    cohortDate: s(loop?.cohort_date),
    status,
    facuDecision: s(loop?.facu_decision),
    questionText: s(loop?.question_text),
    jjAnswer: s(loop?.jj_answer),
    jjScore,
    jjReasoning,
    currentSupplier,
    pricesTheyPay,
    productsInterest,
    objection,
    pitchResonated,
    keyQuote,
    businessType,
    callsCount: eng.callsCount,
    talkSeconds: eng.talkSeconds,
    emailsCount: eng.emailsCount,
    messagesCount: eng.messagesCount,
    addressComplete,
    addressSource: s(cohort.address_source),
    preShipOk,
    preShipBlockReason,
    boxType: s(cohort.box_type),
    productsSent: s(cohort.products_sent),
    likedBox,
    likedAt,
    trackingNumber,
    trackingStatus,
    dispatchDate,
    deliveredAt,
    dispatchState,
    timeline,
    winHypothesis,
    qualityRead,
    proposedComposition,
    externalProfile: externalProfile ?? null, // Rose's florist_external_profile; null → UI "pending".
    dataNote: DATA_NOTE,
  };
}

// ---------------------------------------------------------------------------
// PUBLIC API
// ---------------------------------------------------------------------------

/**
 * getSampleReviewCohort — all ship-ready (SB_READY) + already-shipped (SB_RECEIVED)
 * samples, loop-state merged, each carrying its dispatchState. Timeline is omitted
 * (empty) for list speed; use getSampleReviewDetail for the full timeline.
 */
export async function getSampleReviewCohort(): Promise<SampleReviewRow[]> {
  const cohort = await readCohort();
  if (cohort.length === 0) return [];

  const leadIds = Array.from(
    new Set(
      cohort
        .map((c) => c.lead_master_id)
        .filter((l): l is number => typeof l === 'number'),
    ),
  );

  const [engagement, qualification, loopState, externalProfiles] = await Promise.all([
    readEngagement(leadIds),
    readQualification(cohort),
    readLoopState(),
    readExternalProfiles(leadIds),
  ]);

  return cohort.map((c) => {
    const zoho = s(c.zoho_id);
    const name = s(c.business_name);
    const loop =
      (c.lead_master_id != null ? loopState.byLead.get(c.lead_master_id) : undefined) ??
      (name ? loopState.byName.get(name.toLowerCase()) : undefined);
    return composeRow({
      cohort: c,
      engagement: c.lead_master_id != null ? engagement.get(c.lead_master_id) : undefined,
      qual: zoho ? qualification.byZoho.get(zoho) : undefined,
      leadQuality:
        c.lead_master_id != null
          ? qualification.leadQualityByLead.get(c.lead_master_id) ?? null
          : null,
      loop,
      timeline: [],
      externalProfile: c.lead_master_id != null ? externalProfiles.get(c.lead_master_id) ?? null : null,
    });
  });
}

// ---------------------------------------------------------------------------
// FLORA-QUALIFIED COHORT (front of the samples loop)
// ---------------------------------------------------------------------------
//
// The accounts JJ qualified with a REAL FLORA score, ready to REVIEW + approve
// for a sample box. These are NOT in sample_box_status yet (qualified-to-send,
// not boxed) — approving one is the loop's next step (create the box, downstream).
//
// Source: PROD zoho_accounts WHERE sb_qualification_flora IS NOT NULL AND
// sb_qualif_by_jj = true, ORDER BY sb_qualification_flora DESC. Verified 2026-06-09
// (project swhglnjyuorkycpgkmec, read-only).
//
// INTEL DISCOVERY (probed information_schema 2026-06-09): zoho_accounts does NOT
// carry the sb_current_supplier / sb_prices_they_pay / sb_objection / etc. columns
// that the sample_box_status path uses. The qualification intel for these accounts
// lives as FREE TEXT in `description` (JJ's notes: confirmed address, box pref,
// prices they pay, products of interest, order volume). We surface that raw, plus a
// best-effort directional parse (box preference + a price line). Structured columns
// that DO exist: account_name, zoho_id, phone, website, industry, account_type,
// billing_city/state, priority, annual_revenue, reason_won_lost (ENVIAR/NURTURING),
// qualification_sub_score, sb_content. All read NULL-safe.

export interface FloraCohortRow {
  // synthetic, stable, positive 31-bit id derived from account_name — used ONLY as the
  // decide-route key (the route requires a numeric leadMasterId; these accounts have no
  // lead_master_id because they are not boxed yet). NOT a real lead_master_id.
  decideKey: number;
  zohoId: string | null;
  accountName: string;
  floraScore: number | null;
  byJJ: boolean;
  decision: string | null; // reason_won_lost: ENVIAR / NURTURING (null today)
  reasoning: string | null; // description — JJ's free-text qualification notes
  subScore: string | null; // qualification_sub_score
  currentSupplier: string | null; // not a column on zoho_accounts → null (kept for parity)
  pricesTheyPay: string | null; // directional parse from description, else null
  boxPreference: string | null; // directional parse from description ("Box: roses")
  productsInterest: string | null; // directional parse from description, else null
  businessType: string | null; // account_type ?? industry
  phone: string | null;
  website: string | null;
  city: string | null;
  state: string | null;
  // Real lead_master_id resolved from v_sample_review by business_name (case-insensitive).
  // Null when no match found or on any read error. Used to fetch ClientIntel on the UI.
  leadMasterId: number | null;
}

/**
 * floraDecideKey — deterministic positive 31-bit hash of the (lowercased) account name.
 * The decide route (/api/admin/samples/decide) hard-requires a finite numeric
 * leadMasterId and keys the sample_review_loop row by it. FLORA-qualified accounts have
 * no real lead_master_id (not boxed yet), so we hand the route a stable synthetic key per
 * account: same account → same key (idempotent decisions), different accounts → different
 * keys (6 short distinct names, zero collision risk). Well within JS-safe-int + bigint.
 */
function floraDecideKey(accountName: string): number {
  let h = 5381;
  const str = accountName.trim().toLowerCase();
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h + str.charCodeAt(i)) | 0; // djb2, 32-bit
  }
  return (h & 0x7fffffff) || 1; // positive, non-zero
}

/**
 * parseDescriptionIntel — best-effort directional extraction from JJ's free-text
 * description. NEVER throws; every field degrades to null. Pure string heuristics, no
 * invented values: a "price line" is only emitted when the text literally mentions a
 * price ($ or "stem"); a box preference only when "Box:" is present.
 */
function parseDescriptionIntel(description: string | null): {
  pricesTheyPay: string | null;
  boxPreference: string | null;
  productsInterest: string | null;
} {
  const desc = s(description);
  if (!desc) return { pricesTheyPay: null, boxPreference: null, productsInterest: null };

  const lines = desc
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  // Box preference — "Box: roses" / "Box: summer".
  let boxPreference: string | null = null;
  for (const l of lines) {
    const m = /^box\s*:\s*(.+)$/i.exec(l);
    if (m && s(m[1])) {
      boxPreference = s(m[1]);
      break;
    }
  }

  // Price line — the first non-label line that mentions a price ($ or "stem").
  let pricesTheyPay: string | null = null;
  let productsInterest: string | null = null;
  for (const l of lines) {
    if (/^(confirmed address|box|preferences|ship date|notes)\s*:/i.test(l)) continue;
    if (pricesTheyPay === null && /(\$|\/\s*stem|per stem|stem\b|cm\b)/i.test(l)) {
      pricesTheyPay = l.length > 240 ? l.slice(0, 237) + '...' : l;
    }
    if (productsInterest === null && /(rose|carna|garden|freedom|lili|daisy|daisies|stock|snapdragon|larkspur|astramaria)/i.test(l)) {
      productsInterest = l.length > 240 ? l.slice(0, 237) + '...' : l;
    }
    if (pricesTheyPay && productsInterest) break;
  }

  return { pricesTheyPay, boxPreference, productsInterest };
}

/**
 * resolveLeadMasterIds — resolves real lead_master_ids from v_sample_review by matching
 * account names case-insensitively. Uses the SAME PROD read client as getClientIntel.
 * Returns a Map<lowerCaseName, leadMasterId>. Degrades to empty Map on any error.
 */
async function resolveLeadMasterIds(
  accountNames: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (accountNames.length === 0) return out;
  const prod = getProdReadClient();
  if (!prod) return out;
  try {
    // v_sample_review exposes business_name + lead_master_id (same view getClientIntel uses).
    const { data, error } = await prod
      .from('v_sample_review')
      .select('lead_master_id, business_name')
      .not('business_name', 'is', null);
    if (error || !Array.isArray(data)) return out;
    // Build name→id map from the full view, then match our account names.
    const byName = new Map<string, number>();
    for (const r of data as Array<{ lead_master_id: number | null; business_name: string | null }>) {
      const n = s(r.business_name);
      const id = typeof r.lead_master_id === 'number' ? r.lead_master_id : null;
      if (n && id !== null && !byName.has(n.toLowerCase())) {
        byName.set(n.toLowerCase(), id);
      }
    }
    for (const name of accountNames) {
      const id = byName.get(name.trim().toLowerCase());
      if (id !== undefined) out.set(name.trim().toLowerCase(), id);
    }
  } catch {
    /* degrade: empty map — caller handles null */
  }
  return out;
}

/**
 * getFloraQualifiedCohort — the FLORA-qualified accounts ready to review for a sample box,
 * ranked by FLORA score desc. Reads PROD zoho_accounts directly (read-only). NULL-safe:
 * if the PROD client is unconfigured or the query fails, returns []. The front of the
 * samples loop — approving a row here means "create the box" (downstream, not here).
 */
export async function getFloraQualifiedCohort(): Promise<FloraCohortRow[]> {
  const prod = getProdReadClient();
  if (!prod) return [];
  try {
    // Reads Rose's anon-readable view public.v_flora_cohort (NOT zoho_accounts directly):
    // zoho_accounts has RLS with 0 policies so only service role reads it; the app runs as
    // anon. Rose's view exposes ONLY the FLORA cohort (these 13 cols, the qualified rows) to
    // anon (verified: 6 rows visible as role anon, 2026-06-10). Least-privilege, camino A.
    const { data, error } = await prod
      .from('v_flora_cohort')
      .select(
        'zoho_id, account_name, sb_qualification_flora, sb_qualif_by_jj, reason_won_lost, ' +
          'qualification_sub_score, description, account_type, industry, phone, website, ' +
          'billing_city, billing_state',
      )
      .order('sb_qualification_flora', { ascending: false });
    if (error || !Array.isArray(data)) return [];

    const rawRows = data as unknown as Array<Record<string, unknown>>;

    // Collect account names to resolve real lead_master_ids from v_sample_review.
    const accountNames = rawRows
      .map((r) => s(r.account_name) || '(unknown account)');
    const leadIdMap = await resolveLeadMasterIds(accountNames);

    const rows: FloraCohortRow[] = [];
    for (const r of rawRows) {
      const accountName = s(r.account_name) || '(unknown account)';
      const reasoning = s(r.description);
      const intel = parseDescriptionIntel(reasoning);
      const floraRaw = r.sb_qualification_flora;
      const floraScore =
        typeof floraRaw === 'number'
          ? floraRaw
          : floraRaw != null && Number.isFinite(Number(floraRaw))
            ? Number(floraRaw)
            : null;
      rows.push({
        decideKey: floraDecideKey(accountName),
        zohoId: s(r.zoho_id),
        accountName,
        floraScore,
        byJJ: r.sb_qualif_by_jj === true,
        decision: s(r.reason_won_lost),
        reasoning,
        subScore: s(r.qualification_sub_score),
        currentSupplier: null,
        pricesTheyPay: intel.pricesTheyPay,
        boxPreference: intel.boxPreference,
        productsInterest: intel.productsInterest,
        businessType: s(r.account_type) ?? s(r.industry),
        phone: s(r.phone),
        website: s(r.website),
        city: s(r.billing_city),
        state: s(r.billing_state),
        leadMasterId: leadIdMap.get(accountName.trim().toLowerCase()) ?? null,
      });
    }
    return rows;
  } catch {
    return [];
  }
}

/**
 * probeZohoReadable — discriminates an EMPTY FLORA cohort between "genuinely no
 * qualified accounts" and "the PROD read client cannot see zoho_accounts" (RLS:
 * the table has RLS ON with 0 policies, so only the service role reads it; if the
 * runtime fell back to the anon key, every read returns 0 rows SILENTLY, no error).
 *
 * zoho_accounts is never actually empty, so a HEAD count of 0 (or a thrown/error)
 * means the client lacks service-role access — NOT that JJ qualified nobody. The
 * UI uses this to show an honest "no puedo leer PROD (service-role)" state instead
 * of the misleading "sin cuentas calificadas". Returns true when readable.
 */
export async function probeZohoReadable(): Promise<boolean> {
  const prod = getProdReadClient();
  if (!prod) return false;
  try {
    // Probe the SAME source the cohort reads (Rose's anon view), so an empty cohort is
    // discriminated correctly: 0 here means the view is unreachable/missing, not "no accounts".
    const { count, error } = await prod
      .from('v_flora_cohort')
      .select('zoho_id', { count: 'exact', head: true });
    if (error) return false;
    return (count ?? 0) > 0;
  } catch {
    return false;
  }
}

/**
 * getSampleReviewDetail — one sample (SB_READY or SB_RECEIVED) WITH the full comms
 * timeline. Returns null if the lead is not in the cohort.
 */
export async function getSampleReviewDetail(
  leadMasterId: number,
): Promise<SampleReviewRow | null> {
  if (typeof leadMasterId !== 'number' || Number.isNaN(leadMasterId)) return null;

  const cohort = await readCohort(leadMasterId);
  if (cohort.length === 0) return null;
  const c = cohort[0];

  const [engagement, qualification, loopState, timeline, externalProfiles] = await Promise.all([
    readEngagement([leadMasterId]),
    readQualification(cohort),
    readLoopState(),
    readTimeline(leadMasterId),
    readExternalProfiles([leadMasterId]),
  ]);

  const zoho = s(c.zoho_id);
  const name = s(c.business_name);
  const loop =
    loopState.byLead.get(leadMasterId) ??
    (name ? loopState.byName.get(name.toLowerCase()) : undefined);

  return composeRow({
    cohort: c,
    engagement: engagement.get(leadMasterId),
    qual: zoho ? qualification.byZoho.get(zoho) : undefined,
    leadQuality: qualification.leadQualityByLead.get(leadMasterId) ?? null,
    loop,
    timeline,
    externalProfile: externalProfiles.get(leadMasterId) ?? null,
  });
}
