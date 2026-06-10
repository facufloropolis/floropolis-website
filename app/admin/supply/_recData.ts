// Server-side enrichment helpers for the Supply Engine recommendation cards.
// v1 | 2026-06-09 | Job_PM (CPO)
//
// Each recommendation card carries REAL, verified context (never invented):
//   - competitor price (PROD competitor_prices, joined by variety substring)
//   - a VERIFIED image solution (does a real PROD photo exist for the variety?)
//   - a learning indicator (BACKUP supply_recommendation_feedback per rec_type)
//
// All functions are NULL-safe and never throw. When PROD is unreachable or a
// variety has no match, they return the "pending / no reference" shape and the
// card degrades to "--" — we never fabricate a number.
//
// Match strategy (variety join):
//   The engine's variety is short + lowercase (e.g. "antonia garden").
//   competitor_prices.variety is the longer marketing string
//   (e.g. "Antonia Garden Rose"). So we match where the COMPETITOR variety
//   CONTAINS the rec variety as a case-insensitive substring. We only enrich
//   the varieties actually displayed (top-N per lever), so the fan-out is bounded.

import { getProdReadClient } from '@/lib/supabase/prod-server';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';

// ---------------------------------------------------------------------------
// Competitor price context
// ---------------------------------------------------------------------------

export interface CompetitorContext {
  found: boolean;
  avgPerStem: number | null; // avg price_per_stem across matched rows
  minPerStem: number | null;
  maxPerStem: number | null;
  sources: string[]; // distinct source names (PetalJet, FiftyFlowers, ...)
  rowCount: number;
  // True when the match was tightened by word-boundary on the variety token,
  // so the "Mercado" line is trustworthy at scale (not a broad substring smear).
  tightened: boolean;
}

const EMPTY_COMPETITOR: CompetitorContext = {
  found: false,
  avgPerStem: null,
  minPerStem: null,
  maxPerStem: null,
  sources: [],
  rowCount: 0,
  tightened: false,
};

// A competitor row matches a rec variety when the competitor variety contains
// the rec variety as a WHOLE-WORD token (word boundary), not just any substring.
// This stops a short rec token ("rose") from matching unrelated products across
// the 257k-row competitor table and skewing the average (the NOTE fix). We still
// pull a bounded set with ilike, then filter to word-boundary matches in JS.
function varietyWordMatch(competitorVariety: string, recVariety: string): boolean {
  const hay = ` ${competitorVariety.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
  const needle = recVariety.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (!needle) return false;
  return hay.includes(` ${needle} `);
}

// Pretty-print a known source slug; unknown slugs pass through capitalized.
const SOURCE_LABELS: Record<string, string> = {
  petaljet: 'PetalJet',
  fiftyflowers: 'FiftyFlowers',
  flowerexplosion: 'FlowerExplosion',
  mayesh: 'Mayesh',
};

export function sourceLabel(slug: string): string {
  const s = slug.trim().toLowerCase();
  if (SOURCE_LABELS[s]) return SOURCE_LABELS[s];
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : slug;
}

// Escape PostgREST ilike wildcards/commas in a variety value so the filter is
// literal (variety values are tame, but stay safe + never throw).
function sanitizeForIlike(v: string): string {
  return v.replace(/[%_,()]/g, ' ').trim();
}

/**
 * Fetch competitor-price context for a SET of varieties in one bounded pass.
 * Returns a Map keyed by lowercased rec variety. Never throws; on any failure
 * returns an empty Map (cards degrade to "sin referencia de mercado").
 *
 * Implementation: one PROD query per distinct variety, run in parallel and
 * aggregated in JS. We only call this with the displayed varieties (bounded),
 * so the fan-out stays small. price_per_stem is the canonical per-stem number.
 */
export async function getCompetitorContext(
  varieties: string[],
): Promise<Map<string, CompetitorContext>> {
  const out = new Map<string, CompetitorContext>();
  const prod = getProdReadClient();
  if (!prod) return out; // not configured -> every card shows "sin referencia"

  const distinct = Array.from(
    new Set(
      varieties
        .map((v) => (v ?? '').trim().toLowerCase())
        .filter((v) => v.length >= 3), // <3 chars is too ambiguous to match safely
    ),
  );

  await Promise.all(
    distinct.map(async (variety) => {
      const safe = sanitizeForIlike(variety);
      if (!safe) {
        out.set(variety, { ...EMPTY_COMPETITOR });
        return;
      }
      try {
        // Pull a bounded candidate set with the broad ilike (the index-friendly
        // filter), then TIGHTEN in JS to whole-word matches so a short variety
        // token cannot smear across unrelated products (the NOTE fix).
        const { data, error } = await prod
          .from('competitor_prices')
          .select('source, price_per_stem, variety')
          .ilike('variety', `%${safe}%`)
          .not('price_per_stem', 'is', null)
          .limit(2000);
        if (error || !data || data.length === 0) {
          out.set(variety, { ...EMPTY_COMPETITOR });
          return;
        }
        const sourceSet = new Set<string>();
        let sum = 0;
        let min = Number.POSITIVE_INFINITY;
        let max = Number.NEGATIVE_INFINITY;
        let n = 0;
        for (const row of data as {
          source: string | null;
          price_per_stem: number | string | null;
          variety: string | null;
        }[]) {
          // Whole-word match only: drop broad substring false positives.
          if (!varietyWordMatch(row.variety ?? '', variety)) continue;
          const pps =
            typeof row.price_per_stem === 'number'
              ? row.price_per_stem
              : parseFloat(row.price_per_stem ?? '');
          if (!Number.isFinite(pps) || pps <= 0) continue;
          sum += pps;
          if (pps < min) min = pps;
          if (pps > max) max = pps;
          n += 1;
          if (row.source) sourceSet.add(row.source.trim().toLowerCase());
        }
        if (n === 0) {
          out.set(variety, { ...EMPTY_COMPETITOR });
          return;
        }
        out.set(variety, {
          found: true,
          avgPerStem: sum / n,
          minPerStem: Number.isFinite(min) ? min : null,
          maxPerStem: Number.isFinite(max) ? max : null,
          sources: Array.from(sourceSet).map(sourceLabel).sort(),
          rowCount: n,
          tightened: true,
        });
      } catch {
        out.set(variety, { ...EMPTY_COMPETITOR });
      }
    }),
  );

  return out;
}

// ---------------------------------------------------------------------------
// PROD photo existence (verified image solution)
// ---------------------------------------------------------------------------

export interface PhotoStatus {
  // 'yes'  -> a REAL PROD photo exists (http URL) -> recover, self-contained
  // 'no'   -> no real PROD photo on record -> run the sourcing ladder
  // 'unknown' -> PROD unreachable -> we do not claim either way
  state: 'yes' | 'no' | 'unknown';
  url: string | null; // the real http photo URL when state === 'yes'
}

// Normalize a variety to a comparison key: lowercased, stripped of every
// non-alphanumeric char. This lets "coldplay" match "cold play" and ignores
// the trailing "!" in "moody blues!". Used on BOTH sides of the join so the
// recover loop matches the engine's variety to PROD's scrape variety honestly.
export function normVariety(v: string | null | undefined): string {
  return (v ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// A PROD image is RECOVERABLE only if it is a real hosted photo (http/https
// URL). Local placeholder paths like "/images/shop/roses/cool-water.png" are
// generic stand-ins in the scrape table, NOT a real photo of the variety, so we
// refuse to "recover" them — that would be fabricating a photo (HARD BAR).
function realHttpUrl(images: unknown): string | null {
  const consider = (el: unknown): string | null => {
    if (typeof el !== 'string') return null;
    const s = el.trim();
    return /^https?:\/\//i.test(s) ? s : null;
  };
  if (Array.isArray(images)) {
    for (const el of images) {
      const u = consider(el);
      if (u) return u;
    }
    return null;
  }
  return consider(images);
}

// Build a Map from normalized-variety -> first real http PROD photo URL.
// Shared by the page (status badge) and the recover route (the write source),
// so both agree on exactly which varieties are self-contained. Never throws;
// returns null when PROD is unreachable so callers can render 'unknown'.
export async function getProdRealPhotoMap(): Promise<Map<string, string> | null> {
  const prod = getProdReadClient();
  if (!prod) return null; // unreachable

  try {
    const { data, error } = await prod
      .from('floropolis_inventory')
      .select('variety, images, scrape_date')
      .not('variety', 'is', null)
      .order('scrape_date', { ascending: false, nullsFirst: false })
      .limit(10000);
    if (error || !data) return null;

    const map = new Map<string, string>();
    for (const row of data as { variety: string | null; images: unknown }[]) {
      const key = normVariety(row.variety);
      if (!key || map.has(key)) continue; // first (freshest) real photo wins
      const url = realHttpUrl(row.images);
      if (url) map.set(key, url);
    }
    return map;
  } catch {
    return null; // unreachable -> 'unknown'
  }
}

/**
 * Discover, for each variety, whether a REAL PROD product photo exists (an http
 * URL — never a local placeholder path). Source: PROD floropolis_inventory
 * (157 varieties, images jsonb array). Pulled whole once, matched in JS on the
 * normalized-variety key so "coldplay" matches "cold play".
 *
 * Returns a Map keyed by lowercased variety (the caller's key). Never throws;
 * on PROD failure the Map is empty and callers treat missing entries as
 * state 'unknown'. A variety with only placeholder paths resolves to 'no'.
 */
export async function getProdPhotoStatus(
  varieties: string[],
): Promise<Map<string, PhotoStatus>> {
  const out = new Map<string, PhotoStatus>();
  const wanted = varieties
    .map((v) => (v ?? '').trim().toLowerCase())
    .filter(Boolean);
  if (wanted.length === 0) return out;

  const realMap = await getProdRealPhotoMap();
  if (realMap === null) return out; // unreachable -> callers render 'unknown'

  for (const key of wanted) {
    const url = realMap.get(normVariety(key)) ?? null;
    out.set(key, url ? { state: 'yes', url } : { state: 'no', url: null });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Learning indicator (loop feedback per rec_type / gap_type)
// ---------------------------------------------------------------------------

export interface LearningStat {
  decisions: number; // total feedback rows (any decision)
  positive: number; // decision in ('approve','correct') -> NOT a rejection
  // Back-compat alias: existing consumers read `.approvals`. It now carries the
  // SAME corrected count as `positive` (approve + correct), so older call sites
  // stop showing "0 aprobadas" for 'correct'-only feedback. Prefer `positive` +
  // learningLabel() for new code; this alias keeps page.tsx compiling without a
  // cross-file edit. Both are kept in lockstep wherever the stat is built.
  approvals: number;
}

// A feedback decision is a "positive outcome" when Facu either approved the rec
// as-is OR corrected it (re-ranked / amended) -- both keep the rec in play and
// teach the engine. Only an explicit 'reject' is a negative outcome. Counting
// 'approve' alone hid every 'correct' decision as "0 approved" (the bug fixed
// here). Verified against BACKUP supply_recommendation_feedback 2026-06-09:
// the only rows present are decision='correct', which previously read as 0.
const POSITIVE_DECISIONS = new Set(['approve', 'correct']);

/**
 * Per-rec_type decision counts from BACKUP supply_recommendation_feedback.
 * Keyed by rec_type (which equals the engine's gap_type). Never throws.
 */
export async function getLearningByRecType(): Promise<Map<string, LearningStat>> {
  const out = new Map<string, LearningStat>();
  try {
    const backup = getBackupServiceClient();
    const { data, error } = await backup
      .from('supply_recommendation_feedback')
      .select('rec_type, decision')
      .limit(10000);
    if (error || !data) return out;
    for (const row of data as { rec_type: string | null; decision: string | null }[]) {
      const key = (row.rec_type ?? '').trim().toLowerCase();
      if (!key) continue;
      const cur = out.get(key) ?? { decisions: 0, positive: 0, approvals: 0 };
      cur.decisions += 1;
      if (POSITIVE_DECISIONS.has((row.decision ?? '').trim().toLowerCase())) {
        cur.positive += 1;
        cur.approvals = cur.positive; // keep alias in lockstep with positive
      }
      out.set(key, cur);
    }
  } catch {
    return out;
  }
  return out;
}

/**
 * Honest, ASCII-clean Spanish label for a learning stat:
 *   "N decididas, M con accion positiva"
 * "accion positiva" = aprobadas O corregidas (todo lo que no es rechazo).
 * Returns "-- sin feedback" when there are no decisions yet (never fabricate).
 */
export function learningLabel(stat: LearningStat | null | undefined): string {
  if (!stat || stat.decisions <= 0) return '-- sin feedback';
  return `${stat.decisions} decididas, ${stat.positive} con accion positiva`;
}

// Re-export the alias name some call sites still use; both fields now carry the
// corrected positive count so no consumer can read "0 aprobadas" for a 'correct'.
export type { LearningStat as SupplyLearningStat };

// ---------------------------------------------------------------------------
// 5-LEVER buckets (so the UI can FILTER by lever)
// ---------------------------------------------------------------------------
//
// The engine fires ONE gap_type per SKU on a priority cascade, so a SKU that
// lacks BOTH a price and a photo only shows up under its highest-priority gap.
// To make ALL FIVE levers queryable (image, content, fulfillment, price,
// quality) we (1) bucket every engine row by its canonical lever, and (2) read
// the underlying gate signals (failing_gates jsonb) so price + fulfillment are
// surfaced even when masked behind a higher-priority lever. The five canonical
// buckets are stable filter keys for the UI; raw gap_type sub-labels are kept.

export type SupplyLever = 'image' | 'content' | 'fulfillment' | 'price' | 'quality';

export const SUPPLY_LEVERS: SupplyLever[] = [
  'image',
  'content',
  'fulfillment',
  'price',
  'quality',
];

// Map a raw engine gap_type to one of the five canonical filter buckets.
// image_improve -> image, price_improve -> price, quality_improve -> quality.
export function leverBucket(gapType: string | null | undefined): SupplyLever | null {
  const g = (gapType ?? '').trim().toLowerCase();
  if (!g) return null;
  if (g === 'image' || g === 'image_improve') return 'image';
  if (g === 'content') return 'content';
  if (g === 'fulfillment') return 'fulfillment';
  if (g === 'price' || g === 'price_improve') return 'price';
  if (g === 'quality' || g === 'quality_improve') return 'quality';
  return null; // unknown gap_type -> caller keeps it out of the 5-bucket filter
}

export interface LeverBucketStat {
  lever: SupplyLever;
  skuCount: number;
  varieties: number;
  // sub-levers folded into this bucket and how many SKUs each contributed,
  // so the UI can show "price: 33 unpriced + 5 review" without re-querying.
  subTypes: Record<string, number>;
  maxPriority: number;
  // # SKUs whose failing_gates ALSO carry this lever's gate but fire a DIFFERENT
  // (higher-priority) gap_type -> the "masked" backlog the cascade hides.
  maskedSkus: number;
}

// Which failing_gates token(s) indicate each lever is in deficit. Used to find
// the MASKED backlog (a SKU firing 'image' that ALSO carries another lever's
// gate). These MUST match the real tokens the v_supply_recommendations CASE
// reads — verified against the live view 2026-06-10, the only tokens that exist
// are missing_image (172), missing_contents_description (303),
// missing_units_or_bunch (58). The view also names missing_box_dims /
// missing_unit / missing_vendor_name (fulfillment) and missing_contents_named
// (content) in its CASE, so we include them for forward-compatibility.
//
// price + quality are NOT failing_gates-driven in the view: price comes from
// margin_status ('unpriced' / 'below_floor') and price_zero/missing_cost_source,
// quality_improve from gap_count on a PUBLISHED SKU. None of those are tokens we
// can detect on a SIBLING row's failing_gates array, so their masked-token sets
// are empty (the masked count honestly reads 0 rather than a wrong number).
const LEVER_GATE_TOKENS: Record<SupplyLever, string[]> = {
  image: ['missing_image'],
  content: ['missing_contents_description', 'missing_contents_named'],
  fulfillment: ['missing_units_or_bunch', 'missing_box_dims', 'missing_unit', 'missing_vendor_name'],
  price: [], // margin_status-driven, no failing_gates token to mask-detect
  quality: [], // gap_count-on-published driven, no single token
};

function gatesHasAny(failingGates: unknown, tokens: string[]): boolean {
  if (!Array.isArray(failingGates)) return false;
  const set = new Set(tokens.map((t) => t.toLowerCase()));
  return failingGates.some((g) => typeof g === 'string' && set.has(g.toLowerCase()));
}

/**
 * Read the engine and return ONE stat per canonical lever (all five always
 * present, even at zero, so the UI renders a stable filter bar). Each stat
 * counts the SKUs/varieties firing that lever PLUS the masked backlog (SKUs
 * whose failing_gates carry the lever's gate but fire a higher-priority gap).
 * REAL data only; NULL-safe; never throws (returns all-zero buckets on failure).
 */
export async function getLeverBuckets(): Promise<Map<SupplyLever, LeverBucketStat>> {
  const out = new Map<SupplyLever, LeverBucketStat>();
  for (const lever of SUPPLY_LEVERS) {
    out.set(lever, { lever, skuCount: 0, varieties: 0, subTypes: {}, maxPriority: 0, maskedSkus: 0 });
  }
  try {
    const backup = getBackupServiceClient();
    const { data, error } = await backup
      .from('v_supply_recommendations')
      .select('sku_id, variety, gap_type, failing_gates, priority_score')
      .limit(5000);
    if (error || !data) return out;

    interface Row {
      sku_id: string;
      variety: string | null;
      gap_type: string | null;
      failing_gates: unknown;
      priority_score: number | string | null;
    }
    const varietySets = new Map<SupplyLever, Set<string>>();
    for (const lever of SUPPLY_LEVERS) varietySets.set(lever, new Set<string>());

    for (const r of data as Row[]) {
      const gap = (r.gap_type ?? '').trim().toLowerCase();
      const bucket = leverBucket(gap);
      const variety = (r.variety ?? '').trim().toLowerCase();
      const prio =
        typeof r.priority_score === 'number'
          ? r.priority_score
          : parseFloat(r.priority_score ?? '') || 0;

      if (bucket) {
        const stat = out.get(bucket)!;
        stat.skuCount += 1;
        stat.subTypes[gap] = (stat.subTypes[gap] ?? 0) + 1;
        if (prio > stat.maxPriority) stat.maxPriority = prio;
        if (variety) varietySets.get(bucket)!.add(variety);
      }

      // Masked backlog: a SKU firing one lever may ALSO carry another lever's
      // gate in failing_gates. Count it under every OTHER lever it carries.
      for (const lever of SUPPLY_LEVERS) {
        if (lever === bucket) continue;
        if (gatesHasAny(r.failing_gates, LEVER_GATE_TOKENS[lever])) {
          out.get(lever)!.maskedSkus += 1;
        }
      }
    }

    for (const lever of SUPPLY_LEVERS) {
      out.get(lever)!.varieties = varietySets.get(lever)!.size;
    }
    return out;
  } catch {
    return out;
  }
}
