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

// Build a Map from normalized-variety -> ALL real http PROD photo URLs (deduped,
// max 6). Unlike getProdRealPhotoMap which keeps only the first (freshest) URL,
// this accumulates all distinct real-http URLs across every row for the variety.
// Same PROD query and realHttpUrl guard — no placeholder paths, no fabrication.
// Returns null when PROD is unreachable.
export async function getProdAllPhotosMap(): Promise<Map<string, string[]> | null> {
  const prod = getProdReadClient();
  if (!prod) return null;

  try {
    const { data, error } = await prod
      .from('floropolis_inventory')
      .select('variety, images, scrape_date')
      .not('variety', 'is', null)
      .order('scrape_date', { ascending: false, nullsFirst: false })
      .limit(10000);
    if (error || !data) return null;

    const map = new Map<string, string[]>();
    for (const row of data as { variety: string | null; images: unknown }[]) {
      const key = normVariety(row.variety);
      if (!key) continue;
      // Collect ALL real http URLs from this row's images field.
      const urls: string[] = [];
      if (Array.isArray(row.images)) {
        for (const el of row.images) {
          const u = realHttpUrl(el);
          if (u) urls.push(u);
        }
      } else {
        const u = realHttpUrl(row.images);
        if (u) urls.push(u);
      }
      if (urls.length === 0) continue;
      const existing = map.get(key) ?? [];
      for (const u of urls) {
        if (!existing.includes(u) && existing.length < 6) {
          existing.push(u);
        }
      }
      map.set(key, existing);
    }
    return map;
  } catch {
    return null;
  }
}

// Make realHttpUrl accessible to sibling files that need to extract individual
// URLs from JSONB (e.g. the image-candidates route). It is already used above.
export { realHttpUrl as extractRealHttpUrl };

// ---------------------------------------------------------------------------
// VARIETY ATTRIBUTE PARSING (color / tint) — pure, in-memory, no DB
// ---------------------------------------------------------------------------
//
// The image-candidates route ranks photo OPTIONS for a variety. To do that
// HONESTLY it must know what the variety NAME says it should look like: its
// COLOR (red / blue / pink ...) and whether it is TINTED (dyed gypso et al.).
// These are TEXT annotations of provenance, NOT pixel verification — a free
// stock SEARCH lead's colorOk reflects QUERY intent, an AI url is unverifiable
// (always colorOk/tintOk=false), and a PROD url is matched on the variety key.
//
// The color synonym sets MIRROR the canonical tinted vocabulary already encoded
// in lib/product-images.ts:704-711 (blue->light-blue, red->viva-magenta, etc.)
// so a naive 'blue' substring does NOT false-negative a real PROD 'light blue'
// / 'viva magenta' variant. Synonym MATCH, never exact equality (per RISKS).

export interface VarietyAttributes {
  color: string | null; // canonical color token parsed from the name, or null
  colorSynonyms: string[]; // all spellings that COUNT as this color (for matching)
  tint: 'tinted' | 'natural' | null; // explicit tint signal in the name, or null
}

// Canonical color -> the spellings (incl. tinted-variant PROD keys) that mean it.
// Mirrors lib/product-images.ts tintedColorMap + the *-blue / *-magenta PROD keys
// so colorOk matches PROD variants spelled differently than the bare color word.
const COLOR_SYNONYMS: Record<string, string[]> = {
  red: ['red', 'viva magenta', 'vivamagenta', 'magenta', 'scarlet', 'crimson'],
  pink: ['pink', 'light pink', 'lightpink', 'hot pink', 'hotpink', 'fuchsia', 'fucsia', 'rose pink'],
  blue: ['blue', 'light blue', 'lightblue', 'dark blue', 'darkblue', 'navy', 'lagoon'],
  green: ['green', 'apple green', 'applegreen', 'lime', 'emerald'],
  white: ['white', 'pure white', 'purewhite', 'ivory', 'cream'],
  yellow: ['yellow', 'gold', 'golden', 'lemon'],
  orange: ['orange', 'peach', 'coral', 'apricot'],
  purple: ['purple', 'lavender', 'lilac', 'violet', 'mauve'],
  burgundy: ['burgundy', 'burdeaux', 'bordeaux', 'wine', 'maroon'],
  brown: ['brown', 'mocca', 'mocha', 'chocolate'],
  black: ['black'],
};

// Words in a variety name that explicitly assert it is dyed/tinted, vs natural.
const TINTED_WORDS = ['tinted', 'tint', 'dyed', 'painted', 'sprayed'];
const NATURAL_WORDS = ['natural', 'untinted', 'plain'];

/**
 * Parse the COLOR + TINT a variety NAME claims. Pure / in-memory / NULL-safe.
 * Color is resolved against COLOR_SYNONYMS (synonym match, not exact), so
 * "gypsophila tinted blue" -> color 'blue' (synonyms incl. 'light blue'), and
 * "anthurium red large" -> color 'red' (synonyms incl. 'viva magenta'). When no
 * color word is present, color is null (the caller must NOT claim a color match).
 */
export function parseVarietyAttributes(variety: string | null | undefined): VarietyAttributes {
  const raw = (variety ?? '').toLowerCase();
  // Normalize separators to single spaces, keep word boundaries for phrase match.
  const spaced = ` ${raw.replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()} `;

  let tint: VarietyAttributes['tint'] = null;
  if (NATURAL_WORDS.some((w) => spaced.includes(` ${w} `))) tint = 'natural';
  if (TINTED_WORDS.some((w) => spaced.includes(` ${w} `))) tint = 'tinted';

  // Resolve color: pick the canonical color whose LONGEST synonym phrase appears
  // in the name (longest-first so "light blue" wins over bare "blue", "viva
  // magenta" over "magenta"). null when nothing matches.
  let color: string | null = null;
  let colorSynonyms: string[] = [];
  let bestLen = 0;
  for (const [canon, syns] of Object.entries(COLOR_SYNONYMS)) {
    for (const syn of syns) {
      if (spaced.includes(` ${syn} `) && syn.length > bestLen) {
        bestLen = syn.length;
        color = canon;
        colorSynonyms = syns;
      }
    }
  }
  return { color, colorSynonyms, tint };
}

/**
 * Does a candidate's TEXT provenance (PROD variety key, free-stock query, AI
 * prompt) match the parsed COLOR? Synonym-aware (not exact equality), so a PROD
 * key 'gypsophila tinted light blue' matches a parsed color 'blue'. Returns:
 *   true  -> the candidate text carries a synonym of the wanted color
 *   false -> wanted a color but the text carries a DIFFERENT known color
 *   null  -> no color was parsed (nothing to assert) OR text carries no color
 * The caller treats null as "not a verified color match" (honest, down-ranks).
 */
export function colorMatches(
  attrs: VarietyAttributes,
  candidateText: string | null | undefined,
): boolean | null {
  if (!attrs.color) return null; // no wanted color -> nothing to claim
  const hay = ` ${(candidateText ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()} `;
  if (!hay.trim()) return null;
  // Positive: any synonym of the WANTED color appears.
  for (const syn of attrs.colorSynonyms) {
    if (hay.includes(` ${syn} `)) return true;
  }
  // Negative: a DIFFERENT canonical color's synonym appears -> wrong color.
  for (const [canon, syns] of Object.entries(COLOR_SYNONYMS)) {
    if (canon === attrs.color) continue;
    for (const syn of syns) {
      if (hay.includes(` ${syn} `)) return false;
    }
  }
  return null; // text carries no recognizable color -> unverified, not a match
}

/**
 * Does a candidate's TEXT provenance match the parsed TINT signal? Returns:
 *   true  -> name wants tinted AND text says tinted (or wants natural AND natural)
 *   false -> name wants tinted but text is plain/natural (or vice-versa)
 *   null  -> no tint was parsed from the name (nothing to assert)
 * A plain (untinted) gypso candidate for a "tinted blue" variety -> false.
 */
export function tintMatches(
  attrs: VarietyAttributes,
  candidateText: string | null | undefined,
): boolean | null {
  if (!attrs.tint) return null; // name made no tint claim -> nothing to assert
  const hay = ` ${(candidateText ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()} `;
  const textTinted = TINTED_WORDS.some((w) => hay.includes(` ${w} `));
  const textNatural = NATURAL_WORDS.some((w) => hay.includes(` ${w} `));
  if (attrs.tint === 'tinted') {
    if (textTinted) return true;
    if (textNatural) return false;
    return false; // wants tinted, text shows no tint signal -> NOT a tinted match
  }
  // wants natural
  if (textTinted) return false;
  return true;
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

// ===========================================================================
// IMPROVEMENT LOOPS — the engine gets BETTER proposal-by-proposal.
// ===========================================================================
//
// Today the feedback is CAPTURED (supply_recommendation_feedback) but DEAD:
// v_supply_recommendations.learned_delta = 0 on every row (verified 2026-06-10:
// 937 rows, distinct learned_delta = {0}). So an approved rec-type ranks the
// same as a rejected one next load — no learning. These four computed loops fix
// that IN THE READER (Job's lane), with NO Rose view change:
//
//   LOOP 1  LEARNING RE-RANK    -> learnedAdjustmentMap() : net weight per
//                                  (variety, rec_type) from the decision log,
//                                  added to priority_score before sorting.
//   LOOP 2  OUTCOME / CLOSURE   -> getLoopClosure() : real closed loops from
//                                  supply_solution_feedback (a pick that MOVED
//                                  the metric) -> closure-rate per lever ->
//                                  boost pending recs of a lever that WORKS.
//   LOOP 3  GROUPING            -> groupByScaleAxis() : collapse N pending recs
//                                  that share a scale axis (vendor x rec_type),
//                                  or a decision repeated N times on an axis,
//                                  into ONE batch rec ("N variedades, una accion").
//   LOOP 4  REFLECTION          -> getLoopReflection() : the visible improvement
//                                  curve for LoopLearningPanel.
//
// ALL: REAL data only (read the two feedback tables + the view), NULL-safe,
// never throw, honest empty states. BACKUP via getBackupServiceClient.

// ---------------------------------------------------------------------------
// LOOP 1 — LEARNING RE-RANK
// ---------------------------------------------------------------------------
//
// Aggregate the net learned weight per (variety, rec_type) AND per rec_type from
// supply_recommendation_feedback. We honor an explicit weight_delta when the row
// carries one; when it is 0/absent (the current reality — every row is
// weight_delta=0) we DERIVE a directional vote from the decision so the loop is
// not dead: approve = +1 (rank this kind higher), reject = -1 (lower),
// correct/defer = 0 (the rec FRAMING was wrong, not its rank — neutral, per the
// spec). The net is summed; a positive net lifts a rec, a negative net sinks it.

const APPROVE_DECISIONS = new Set(['approve', 'approved', 'accept']);
const REJECT_DECISIONS = new Set(['reject', 'rejected', 'decline']);
// correct / defer => neutral (0): captured as context, not a rank vote.

// How much one derived vote (when weight_delta is 0) moves the priority. Small,
// so learning nudges ordering across loads without swamping the base score.
const DERIVED_VOTE_WEIGHT = 1;

// Cap the absolute learned adjustment so a long pile of votes can reorder near
// neighbours but never let learning fully override the base priority signal.
const MAX_LEARNED_ADJUSTMENT = 12;

function decisionVote(decision: string | null | undefined): number {
  const d = (decision ?? '').trim().toLowerCase();
  // 'correct' = Facu confirmed the rec was right → a POSITIVE learning vote, consistent with the
  // display indicator (POSITIVE_DECISIONS). Without this the loop is wired but DEAD: verified
  // 2026-06-11 that 100% of feedback was 'correct' (13 rows) → zero learned adjustment → ranking
  // never moved. Including 'correct' brings the read→learn→re-rank loop alive.
  if (POSITIVE_DECISIONS.has(d) || APPROVE_DECISIONS.has(d)) return DERIVED_VOTE_WEIGHT;
  if (REJECT_DECISIONS.has(d)) return -DERIVED_VOTE_WEIGHT;
  return 0; // defer / unknown -> neutral
}

export interface LearnedRerank {
  // net learned weight keyed by `${recType}|${variety}` (both lowercased)
  byVarietyType: Map<string, number>;
  // net learned weight keyed by rec_type only (lowercased) -> the type-level prior
  byType: Map<string, number>;
  totalRows: number;
}

const EMPTY_RERANK: LearnedRerank = {
  byVarietyType: new Map(),
  byType: new Map(),
  totalRows: 0,
};

function clampAdj(n: number): number {
  if (n > MAX_LEARNED_ADJUSTMENT) return MAX_LEARNED_ADJUSTMENT;
  if (n < -MAX_LEARNED_ADJUSTMENT) return -MAX_LEARNED_ADJUSTMENT;
  return n;
}

/**
 * LOOP 1: read the decision log and return the net learned weight per
 * (variety, rec_type) and per rec_type. Never throws; empty maps on failure.
 */
export async function getLearnedRerank(): Promise<LearnedRerank> {
  try {
    const backup = getBackupServiceClient();
    const { data, error } = await backup
      .from('supply_recommendation_feedback')
      .select('rec_type, target_variety, decision, weight_delta')
      .limit(10000);
    if (error || !data) return EMPTY_RERANK;

    const byVarietyType = new Map<string, number>();
    const byType = new Map<string, number>();
    let totalRows = 0;

    for (const row of data as {
      rec_type: string | null;
      target_variety: string | null;
      decision: string | null;
      weight_delta: number | string | null;
    }[]) {
      const recType = (row.rec_type ?? '').trim().toLowerCase();
      if (!recType) continue;
      totalRows += 1;
      const variety = (row.target_variety ?? '').trim().toLowerCase();

      // Explicit weight_delta wins; if it is 0/absent, derive from the decision.
      const explicit =
        typeof row.weight_delta === 'number'
          ? row.weight_delta
          : parseFloat(row.weight_delta ?? '');
      const delta =
        Number.isFinite(explicit) && explicit !== 0 ? explicit : decisionVote(row.decision);
      if (delta === 0) continue;

      byType.set(recType, (byType.get(recType) ?? 0) + delta);
      if (variety) {
        const k = `${recType}|${variety}`;
        byVarietyType.set(k, (byVarietyType.get(k) ?? 0) + delta);
      }
    }
    return { byVarietyType, byType, totalRows };
  } catch {
    return EMPTY_RERANK;
  }
}

/**
 * The learned adjustment to ADD to a rec's base priority_score before sorting.
 * Combines the specific (variety x rec_type) signal with the rec_type-level
 * prior (half weight, so a type the engine is learning to favour lifts even
 * varieties with no direct feedback yet). Clamped so learning re-ranks without
 * overriding the base score. NULL-safe.
 */
export function learnedAdjustment(
  rerank: LearnedRerank | null | undefined,
  recType: string | null | undefined,
  variety: string | null | undefined,
): number {
  if (!rerank) return 0;
  const rt = (recType ?? '').trim().toLowerCase();
  if (!rt) return 0;
  const v = (variety ?? '').trim().toLowerCase();
  const specific = v ? rerank.byVarietyType.get(`${rt}|${v}`) ?? 0 : 0;
  const typePrior = (rerank.byType.get(rt) ?? 0) * 0.5;
  return clampAdj(specific + typePrior);
}

// ---------------------------------------------------------------------------
// LOOP 2 — OUTCOME PRIORITIZATION (loop-closure)
// ---------------------------------------------------------------------------
//
// A loop ACTUALLY closed when a worked solution MOVED the metric. The real
// record of that is supply_solution_feedback: outcome='pick' with
// metric_after > metric_before (e.g. image_count 0 -> 1). We also count an
// outcome='reject' as a DECIDED-but-not-closed solution attempt. closure-rate
// per lever = closed / decided. A lever with a working solution path (closure
// rate > 0) BOOSTS the priority of its still-pending recs, because we have
// proof the action works. Today the table is empty (0 rows) -> every closure
// rate is null and the boost is 0, surfaced honestly as "sin loops cerrados aun".

const PICK_OUTCOMES = new Set(['pick', 'apply', 'applied', 'recover']);
const REJECT_OUTCOMES = new Set(['reject', 'rejected', 'ungettable']);

// How strongly a proven-closing lever boosts its pending recs. Multiplied by the
// lever's closure-rate (0..1), so a lever that closes every attempt boosts most.
const CLOSURE_BOOST_MAX = 8;

export interface LeverClosure {
  lever: string; // normalized rec_type / lever key
  closed: number; // picks whose metric moved up
  decided: number; // picks + rejects (real solution attempts)
  closureRate: number | null; // closed / decided ; null when decided === 0
}

export interface LoopClosure {
  byLever: Map<string, LeverClosure>;
  totalClosed: number;
  totalDecided: number;
}

const EMPTY_CLOSURE: LoopClosure = {
  byLever: new Map(),
  totalClosed: 0,
  totalDecided: 0,
};

/**
 * LOOP 2: read the outcome log and compute the real loop-closure-rate per lever.
 * Never throws; empty on failure (honest "sin loops cerrados aun").
 */
export async function getLoopClosure(): Promise<LoopClosure> {
  try {
    const backup = getBackupServiceClient();
    const { data, error } = await backup
      .from('supply_solution_feedback')
      .select('lever, outcome, metric_before, metric_after')
      .limit(10000);
    if (error || !data) return EMPTY_CLOSURE;

    const byLever = new Map<string, LeverClosure>();
    let totalClosed = 0;
    let totalDecided = 0;

    for (const row of data as {
      lever: string | null;
      outcome: string | null;
      metric_before: number | string | null;
      metric_after: number | string | null;
    }[]) {
      const lever = (row.lever ?? '').trim().toLowerCase();
      if (!lever) continue;
      const outcome = (row.outcome ?? '').trim().toLowerCase();
      const isPick = PICK_OUTCOMES.has(outcome);
      const isReject = REJECT_OUTCOMES.has(outcome);
      if (!isPick && !isReject) continue;

      const before =
        typeof row.metric_before === 'number'
          ? row.metric_before
          : parseFloat(row.metric_before ?? '');
      const after =
        typeof row.metric_after === 'number'
          ? row.metric_after
          : parseFloat(row.metric_after ?? '');
      // A loop CLOSED only when a pick moved the metric up (real movement).
      const moved =
        isPick && Number.isFinite(before) && Number.isFinite(after) && after > before;

      const cur =
        byLever.get(lever) ?? { lever, closed: 0, decided: 0, closureRate: null };
      cur.decided += 1;
      totalDecided += 1;
      if (moved) {
        cur.closed += 1;
        totalClosed += 1;
      }
      cur.closureRate = cur.decided > 0 ? cur.closed / cur.decided : null;
      byLever.set(lever, cur);
    }
    return { byLever, totalClosed, totalDecided };
  } catch {
    return EMPTY_CLOSURE;
  }
}

/**
 * The closure-driven boost to ADD to a pending rec's priority. A lever with a
 * proven solution path (closureRate > 0) lifts its still-open recs because we
 * have evidence the action closes. Returns 0 when the lever has no closed loop
 * yet (honest: no proof -> no boost). NULL-safe.
 */
export function closureBoost(
  closure: LoopClosure | null | undefined,
  recType: string | null | undefined,
): number {
  if (!closure) return 0;
  const rt = (recType ?? '').trim().toLowerCase();
  const lc = closure.byLever.get(rt);
  if (!lc || lc.closureRate == null) return 0;
  return CLOSURE_BOOST_MAX * lc.closureRate;
}

// Map a raw rec_type/gap_type to the closure lever key, so a rec_type of
// 'image_improve' shares the proven 'image' solution path. price/quality keep
// their own key (no executor yet -> they will simply have no closures).
export function closureLeverKey(recType: string | null | undefined): string {
  const bucket = leverBucket(recType);
  return bucket ?? (recType ?? '').trim().toLowerCase();
}

// ---------------------------------------------------------------------------
// LOOP 3 — GROUPING (collapse repeats on a scale axis into ONE batch rec)
// ---------------------------------------------------------------------------
//
// content + fulfillment already collapse to a scale axis in _scaleReaders.ts.
// The per-variety levers (image / price / quality) do NOT, so the SAME
// structural fix repeats as many rows (e.g. one vendor with 8 unpriced
// varieties = 8 near-identical price cards). LOOP 3 detects when many pending
// recs share a scale axis (vendor x rec_type) OR when the same DECISION repeated
// N times on that axis, and collapses them into ONE batch rec so Facu acts once.
// Below GROUP_MIN the recs stay as individual cards (grouping only when it pays).

export const GROUP_MIN = 3; // collapse only when an axis has at least this many varieties

export interface GroupedRec {
  axisKey: string; // `${vendor}|${recType}` (lowercased) — stable key
  vendor: string;
  recType: string; // the engine gap_type the group shares
  lever: SupplyLever; // canonical bucket (for the section it renders in)
  varieties: number; // distinct varieties collapsed
  skuCount: number; // total SKUs across the group
  maxPriority: number; // top base priority in the group
  learnedAdj: number; // LOOP 1 adjustment applied to the group (type prior)
  closureAdj: number; // LOOP 2 boost applied to the group
  rankScore: number; // maxPriority + learnedAdj + closureAdj (what we sort on)
  sampleVarieties: string[]; // up to 4 example variety names (display)
  repeatedDecisions: number; // how many feedback decisions repeated on this axis
  action: string; // honest, scale-framed Spanish action
}

// Minimal shape the grouper needs from the page's per-variety rows.
export interface GroupableRow {
  variety: string;
  vendor: string;
  gapType: string;
  lever: SupplyLever;
  skuCount: number;
  priorityScore: number;
}

/**
 * LOOP 3: collapse per-variety rows that share a (vendor x rec_type) scale axis
 * into ONE batch rec. Returns BOTH the grouped batch recs (axes with >= GROUP_MIN
 * varieties) and the leftover ungrouped rows (axes too small to batch), so the
 * page renders batches first, then singletons. Applies the LOOP 1 + LOOP 2
 * adjustments to the group's rank. `decisionsByAxis` counts feedback decisions
 * that repeated on each axis (the "same decision repeated N times" trigger).
 * Pure / synchronous / NULL-safe.
 */
export function groupByScaleAxis(
  rows: GroupableRow[],
  rerank: LearnedRerank | null,
  closure: LoopClosure | null,
  decisionsByAxis: Map<string, number>,
): { groups: GroupedRec[]; ungrouped: GroupableRow[] } {
  interface Acc {
    vendor: string;
    recType: string;
    lever: SupplyLever;
    varietySet: Set<string>;
    skuCount: number;
    maxPriority: number;
    members: GroupableRow[];
  }
  const acc = new Map<string, Acc>();
  for (const r of rows) {
    const vendor = (r.vendor ?? '').trim() || '--';
    const recType = (r.gapType ?? '').trim().toLowerCase();
    if (!recType) continue;
    const axisKey = `${vendor.toLowerCase()}|${recType}`;
    let cur = acc.get(axisKey);
    if (!cur) {
      cur = {
        vendor,
        recType,
        lever: r.lever,
        varietySet: new Set<string>(),
        skuCount: 0,
        maxPriority: 0,
        members: [],
      };
      acc.set(axisKey, cur);
    }
    const v = (r.variety ?? '').trim().toLowerCase();
    if (v) cur.varietySet.add(v);
    cur.skuCount += r.skuCount;
    if (r.priorityScore > cur.maxPriority) cur.maxPriority = r.priorityScore;
    cur.members.push(r);
  }

  const groups: GroupedRec[] = [];
  const ungrouped: GroupableRow[] = [];

  for (const [axisKey, a] of acc.entries()) {
    const nVar = a.varietySet.size;
    const repeated = decisionsByAxis.get(axisKey) ?? 0;
    // Collapse when the axis is broad (>= GROUP_MIN varieties) OR when the SAME
    // decision repeated on it >= GROUP_MIN times (a learned, repeatable action).
    const shouldGroup = nVar >= GROUP_MIN || repeated >= GROUP_MIN;
    if (!shouldGroup) {
      ungrouped.push(...a.members);
      continue;
    }
    const learnedAdj = learnedAdjustment(rerank, a.recType, null); // type-level prior
    const closureAdj = closureBoost(closure, a.recType);
    const sampleVarieties = a.members
      .slice()
      .sort((x, y) => y.priorityScore - x.priorityScore)
      .map((m) => m.variety)
      .filter((v, i, arr) => arr.indexOf(v) === i)
      .slice(0, 4);
    const leverLabel = a.recType;
    const action =
      `${a.vendor}: ${nVar} variedad${nVar === 1 ? '' : 'es'} con gap ${leverLabel}` +
      ` (${a.skuCount} SKU) -> una accion a escala` +
      (repeated >= GROUP_MIN ? ` (decision repetida ${repeated}x: el motor ya aprendio el patron)` : '');
    groups.push({
      axisKey,
      vendor: a.vendor,
      recType: a.recType,
      lever: a.lever,
      varieties: nVar,
      skuCount: a.skuCount,
      maxPriority: a.maxPriority,
      learnedAdj,
      closureAdj,
      rankScore: a.maxPriority + learnedAdj + closureAdj,
      sampleVarieties,
      repeatedDecisions: repeated,
      action,
    });
  }

  groups.sort((x, y) => y.rankScore - x.rankScore);
  return { groups, ungrouped };
}

// Count feedback decisions per (vendor x rec_type) axis, so LOOP 3 can fire on
// "same decision repeated N times". The decision log has no vendor column, so we
// resolve each feedback variety to its vendor via the view's variety->vendor map
// (passed in by the caller, who already loaded the engine rows). NULL-safe.
export async function getDecisionsByAxis(
  vendorByVariety: Map<string, string>,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  try {
    const backup = getBackupServiceClient();
    const { data, error } = await backup
      .from('supply_recommendation_feedback')
      .select('rec_type, target_variety, decision')
      .limit(10000);
    if (error || !data) return out;
    for (const row of data as {
      rec_type: string | null;
      target_variety: string | null;
      decision: string | null;
    }[]) {
      const recType = (row.rec_type ?? '').trim().toLowerCase();
      const variety = (row.target_variety ?? '').trim().toLowerCase();
      if (!recType || !variety) continue;
      const vendor = (vendorByVariety.get(variety) ?? '').trim().toLowerCase();
      if (!vendor) continue;
      const axisKey = `${vendor}|${recType}`;
      out.set(axisKey, (out.get(axisKey) ?? 0) + 1);
    }
  } catch {
    return out;
  }
  return out;
}

// ---------------------------------------------------------------------------
// LOOP 4 — REFLECTION (the visible improvement curve for the panel)
// ---------------------------------------------------------------------------

export interface LeverReflection {
  lever: string; // rec_type key (image / image_improve / content / fulfillment / price / quality)
  decisions: number; // total feedback decisions on this rec_type
  approvals: number; // derived approve votes
  rejections: number; // derived reject votes
  corrections: number; // correct / defer (neutral framing feedback)
  netWeight: number; // LOOP 1 net learned weight for this type
  closed: number; // LOOP 2 closed loops for this lever
  decidedSolutions: number; // LOOP 2 solution attempts (pick + reject)
  closureRate: number | null; // LOOP 2 closure-rate
  direction: 'priorizando' | 'despriorizando' | 'neutral'; // what the engine learned
}

export interface LoopReflection {
  levers: LeverReflection[];
  totalDecisions: number;
  totalClosed: number;
  totalDecidedSolutions: number;
  overallClosureRate: number | null;
  batchedRecs: number; // # batch recs LOOP 3 produced (set by the page)
  batchedVarieties: number; // # varieties those batches cover (set by the page)
  learnedDeltaDead: boolean; // true => view.learned_delta is still all-zero (the dead loop)
}

/**
 * LOOP 4: assemble the reflection across all four loops for LoopLearningPanel.
 * `batchedRecs` / `batchedVarieties` are passed in by the page (LOOP 3 runs on
 * the page's already-loaded rows). `learnedDeltaDead` reflects whether the view
 * still ships learned_delta=0 (the gap these reader-side loops close). Reads the
 * two feedback tables; never throws; honest zeros when there is no data.
 */
export async function getLoopReflection(opts: {
  batchedRecs: number;
  batchedVarieties: number;
  learnedDeltaDead: boolean;
}): Promise<LoopReflection> {
  const empty: LoopReflection = {
    levers: [],
    totalDecisions: 0,
    totalClosed: 0,
    totalDecidedSolutions: 0,
    overallClosureRate: null,
    batchedRecs: opts.batchedRecs,
    batchedVarieties: opts.batchedVarieties,
    learnedDeltaDead: opts.learnedDeltaDead,
  };
  try {
    const backup = getBackupServiceClient();
    const [decRes, solRes, rerank] = await Promise.all([
      backup
        .from('supply_recommendation_feedback')
        .select('rec_type, decision, weight_delta')
        .limit(10000),
      getLoopClosure(),
      getLearnedRerank(),
    ]);

    interface Agg {
      decisions: number;
      approvals: number;
      rejections: number;
      corrections: number;
    }
    const byType = new Map<string, Agg>();
    let totalDecisions = 0;
    if (!decRes.error && decRes.data) {
      for (const row of decRes.data as {
        rec_type: string | null;
        decision: string | null;
      }[]) {
        const rt = (row.rec_type ?? '').trim().toLowerCase();
        if (!rt) continue;
        totalDecisions += 1;
        const cur =
          byType.get(rt) ?? { decisions: 0, approvals: 0, rejections: 0, corrections: 0 };
        cur.decisions += 1;
        const d = (row.decision ?? '').trim().toLowerCase();
        if (APPROVE_DECISIONS.has(d)) cur.approvals += 1;
        else if (REJECT_DECISIONS.has(d)) cur.rejections += 1;
        else cur.corrections += 1; // correct / defer => neutral framing feedback
        byType.set(rt, cur);
      }
    }

    // Union of types seen in decisions OR in closures, so a lever that only has
    // closures (no decisions) still surfaces, and vice versa.
    const allKeys = new Set<string>([
      ...byType.keys(),
      ...solRes.byLever.keys(),
      ...rerank.byType.keys(),
    ]);

    const levers: LeverReflection[] = [];
    for (const key of allKeys) {
      const agg = byType.get(key) ?? {
        decisions: 0,
        approvals: 0,
        rejections: 0,
        corrections: 0,
      };
      const net = rerank.byType.get(key) ?? 0;
      const lc = solRes.byLever.get(closureLeverKey(key)) ?? solRes.byLever.get(key);
      const direction: LeverReflection['direction'] =
        net > 0 ? 'priorizando' : net < 0 ? 'despriorizando' : 'neutral';
      levers.push({
        lever: key,
        decisions: agg.decisions,
        approvals: agg.approvals,
        rejections: agg.rejections,
        corrections: agg.corrections,
        netWeight: net,
        closed: lc?.closed ?? 0,
        decidedSolutions: lc?.decided ?? 0,
        closureRate: lc?.closureRate ?? null,
        direction,
      });
    }
    levers.sort((a, b) => b.decisions - a.decisions || b.closed - a.closed);

    return {
      levers,
      totalDecisions,
      totalClosed: solRes.totalClosed,
      totalDecidedSolutions: solRes.totalDecided,
      overallClosureRate:
        solRes.totalDecided > 0 ? solRes.totalClosed / solRes.totalDecided : null,
      batchedRecs: opts.batchedRecs,
      batchedVarieties: opts.batchedVarieties,
      learnedDeltaDead: opts.learnedDeltaDead,
    };
  } catch {
    return empty;
  }
}

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

// 'correcciones' is NOT an engine bucket (no v_supply_recommendations gap_type maps
// to it); it is a data-quality lever fed by lib/admin/corrections-flags.ts. It is in
// the union so the shared SupplyLever type covers every tab, but it is intentionally
// absent from SUPPLY_LEVERS (the engine-bucket list) and the bucket readers below.
export type SupplyLever = 'image' | 'content' | 'fulfillment' | 'price' | 'quality' | 'correcciones';

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
  correcciones: [], // not engine-derived (fed by corrections-flags.ts), never mask-detected here
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

// ===========================================================================
// GROUPED VARIETY CARD — collapse N per-SKU review rows into ONE per-variety card
// ===========================================================================
//
// SHARED CONTRACT (supply-card-v2). The image/content review queues emit one row
// PER SKU (per size): a variety in 4 lengths => 4 near-identical cards, and
// ImageReviewPanel renders one card per SKU today (ImageReviewPanel.tsx:121).
// But the backend ALREADY applies a picked asset to ALL of a variety's gap SKUs
// (loop-ledger.closeAssetGate takes skuIds[]). So the UI must collapse to ONE
// decision per VARIETY, with the candidate photos/texts as OPTIONS inside, and a
// single approve closes the gate for every size at once.
//
// This reader builds that shape: ONE GroupedVarietyCard per normalized variety,
// all sizes' sku_ids in skuIds[], deduped candidate options. variety_synonyms are
// NOT applied (per memory ref), so we collapse on normVariety (the same key the
// PROD photo map uses) — two display spellings of one variety still merge.

export interface GroupedCandidate {
  url: string; // candidate image URL (or, for content, the candidate text)
  source: string; // prod_propagate | vendor | free_stock | ai_pollinations | auto_generated
  colorOk?: boolean;
  tintOk?: boolean;
  reviewId?: number; // the underlying image_review/content_review row id (for per-option ops)
}

export interface GroupedVarietyCard {
  variety: string; // display variety (first spelling seen for the normalized key)
  category: string | null;
  levers: string[]; // which review levers contributed ('image' | 'content')
  skuIds: string[]; // ALL sizes' sku_ids (deduped) — closeAssetGate closes them all at once
  candidates: GroupedCandidate[]; // photo/text OPTIONS, deduped across the N sku rows
  importance: number; // top priority_score across the variety's sku rows (0 when unknown)
  currentQuality: number | null; // not derivable from the review queue alone -> null (honest)
}

interface VarietyAcc {
  variety: string;
  category: string | null;
  levers: Set<string>;
  skuIds: Set<string>;
  candidates: Map<string, GroupedCandidate>; // keyed by url to dedupe across sizes
  importance: number;
}

/**
 * Collapse the pending image + content review queues into ONE card per VARIETY.
 *
 * - skuIds[]: every distinct sku_id across all the variety's sizes/levers, so a
 *   single approve calls closeAssetGate(svc, { skuIds: <all N>, gate }) ONCE.
 * - candidates[]: deduped by URL across the N sku rows. Because all sizes of a
 *   variety share the same PROD photos (getProdAllPhotosMap is per normalized
 *   variety), the same option would otherwise repeat N-fold — we dedupe so each
 *   option shows once. We also FOLD IN the variety's full PROD photo set so the
 *   card offers every real recoverable photo, not just the seeded candidate.
 * - importance: max priority_score seen across the variety's rows (honest 0 when
 *   the review tables carry no priority).
 *
 * REAL data only. NULL-safe. Never throws (empty array on failure). The PROD
 * fold-in degrades gracefully when PROD is unreachable (getProdAllPhotosMap=null).
 *
 * `lever`: 'image' collapses image_review; 'content' collapses content_review.
 */
export async function getGroupedVarietyCards(
  lever: 'image' | 'content',
): Promise<GroupedVarietyCard[]> {
  let backup;
  try {
    backup = getBackupServiceClient();
  } catch {
    return [];
  }

  const byVariety = new Map<string, VarietyAcc>();

  const ensure = (rawVariety: string | null): VarietyAcc | null => {
    const key = normVariety(rawVariety);
    if (!key) return null; // no variety key -> cannot collapse honestly
    let acc = byVariety.get(key);
    if (!acc) {
      acc = {
        variety: (rawVariety ?? '').trim() || key,
        category: null,
        levers: new Set<string>(),
        skuIds: new Set<string>(),
        candidates: new Map<string, GroupedCandidate>(),
        importance: 0,
      };
      byVariety.set(key, acc);
    }
    return acc;
  };

  try {
    if (lever === 'image') {
      const { data, error } = await backup
        .from('image_review')
        .select('id, sku_id, variety, candidate_url, source, tier')
        .eq('status', 'pending')
        .order('tier', { ascending: true })
        .limit(2000);
      if (error || !Array.isArray(data)) return [];
      for (const r of data as Array<{
        id: number;
        sku_id: string | null;
        variety: string | null;
        candidate_url: string | null;
        source: string | null;
        tier: number | null;
      }>) {
        const acc = ensure(r.variety);
        if (!acc) continue;
        acc.levers.add('image');
        const sku = typeof r.sku_id === 'string' ? r.sku_id.trim() : '';
        if (sku) acc.skuIds.add(sku);
        const url = typeof r.candidate_url === 'string' ? r.candidate_url.trim() : '';
        if (url && !acc.candidates.has(url)) {
          acc.candidates.set(url, {
            url,
            source: (r.source ?? '').trim() || 'unknown',
            reviewId: r.id,
          });
        }
      }

      // FOLD IN the full PROD photo set per variety (deduped) so the card offers
      // every REAL recoverable photo as an option, not only the seeded candidate.
      // Degrades to no-op when PROD is unreachable (map === null).
      const prodPhotos = await getProdAllPhotosMap();
      if (prodPhotos) {
        for (const [key, acc] of byVariety.entries()) {
          const urls = prodPhotos.get(key);
          if (!urls) continue;
          for (const url of urls) {
            if (!acc.candidates.has(url)) {
              acc.candidates.set(url, { url, source: 'prod_propagate' });
            }
          }
        }
      }
    } else {
      const { data, error } = await backup
        .from('content_review')
        .select('id, sku_id, variety, candidate_text')
        .eq('status', 'pending')
        .order('variety', { ascending: true })
        .limit(2000);
      if (error || !Array.isArray(data)) return [];
      for (const r of data as Array<{
        id: number;
        sku_id: string | null;
        variety: string | null;
        candidate_text: string | null;
      }>) {
        const acc = ensure(r.variety);
        if (!acc) continue;
        acc.levers.add('content');
        const sku = typeof r.sku_id === 'string' ? r.sku_id.trim() : '';
        if (sku) acc.skuIds.add(sku);
        const text = typeof r.candidate_text === 'string' ? r.candidate_text.trim() : '';
        if (text && !acc.candidates.has(text)) {
          acc.candidates.set(text, { url: text, source: 'auto_generated', reviewId: r.id });
        }
      }
    }
  } catch {
    return [];
  }

  const cards: GroupedVarietyCard[] = [];
  for (const acc of byVariety.values()) {
    cards.push({
      variety: acc.variety,
      category: acc.category,
      levers: Array.from(acc.levers),
      skuIds: Array.from(acc.skuIds),
      candidates: Array.from(acc.candidates.values()),
      importance: acc.importance,
      currentQuality: null,
    });
  }
  // Most candidate options first (richest decisions on top), then by name.
  cards.sort(
    (a, b) =>
      b.candidates.length - a.candidates.length || a.variety.localeCompare(b.variety),
  );
  return cards;
}

// ===========================================================================
// COVERAGE LOOP — "que datos de competidor faltan y cuanto importan"
// ===========================================================================
//
// Job's cost lens compares each variety against competitor benchmark
// (market_variety_crosswalk.benchmark_pps) + peer cost. When that reference is
// ABSENT or WEAK, the proposal does NOT block ("sin referencia" is honest), it
// records a PRIORITIZED coverage-gap on the improvement_loop_state spine
// (domain='benchmark_coverage') so Rose/Talin can fill the data. This reader
// computes the live thin-coverage universe (READ-ONLY) so the panel + the
// recorder agree on which varieties + lens are missing and how much they matter.
//
// THIN = absent (no crosswalk row for the variety) OR weak (low confidence /
// few competitor rows / null benchmark_pps). Verified 2026-06-16: of 216 engine
// varieties, 111 are ABSENT from market_variety_crosswalk and 11 are WEAK
// (confidence < 0.5 OR n_rows < 10 OR benchmark_pps NULL). Importance comes from
// supply_importance_signal.weight (0 floor + provenance tag when absent).
//
// REAL data only (v_supply_recommendations + market_variety_crosswalk +
// supply_importance_signal), NULL-safe, never throws, honest empties. The
// recorder (lib/admin/coverage-gap.recordCoverageGap) WRITES; this only READS.

// Thresholds for a WEAK (present-but-thin) competitor reference. A row failing
// ANY of these is thin enough that the cost verdict cannot lean on it honestly.
const COVERAGE_MIN_CONFIDENCE = 0.5; // below -> weak
const COVERAGE_MIN_ROWS = 10; // fewer competitor rows -> weak

export interface CoverageGapCandidate {
  variety: string; // normalized (lower, single-spaced) variety key
  missingLens: ('competitor' | 'peer')[]; // which reference lens is thin/absent
  reason: 'absent' | 'weak'; // competitor lens: no row vs present-but-thin
  importance: number; // supply_importance_signal.weight (0 floor)
  importanceProvenance: string | null; // provenance tag (honest 'sin referencia')
  crosswalkRows: number; // n_rows behind the (weak) competitor reference, 0 if absent
  benchmarkPps: number | null; // present-but-weak pps, else null
  confidence: number | null; // crosswalk confidence, null if absent
  priority: number; // importance x frequency-1 (frequency starts at 1 here)
}

export interface CoverageGapScan {
  candidates: CoverageGapCandidate[]; // descending by importance (then variety)
  engineVarieties: number; // distinct varieties seen in the engine
  absent: number; // varieties with NO crosswalk row
  weak: number; // varieties present but thin
  covered: number; // varieties with a strong competitor reference
  warnings: string[]; // DB errors surfaced (never swallowed)
}

/**
 * Scan the live engine for varieties whose competitor reference is thin/absent.
 * Read-only: joins v_supply_recommendations varieties against
 * market_variety_crosswalk (competitor lens) + supply_importance_signal (weight).
 * Returns prioritized candidates the recorder turns into coverage-gap rows.
 * Never throws; DB errors land in warnings[]. The PEER lens is reported as thin
 * ONLY when the competitor lens is also thin (no independent peer table is read
 * here — peer cost lives in canonical_cost, consumed by the cost analyzer in a
 * separate area; this scan does not build that, per RISKS scope-leakage).
 */
export async function scanCoverageGaps(): Promise<CoverageGapScan> {
  const out: CoverageGapScan = {
    candidates: [],
    engineVarieties: 0,
    absent: 0,
    weak: 0,
    covered: 0,
    warnings: [],
  };
  let backup;
  try {
    backup = getBackupServiceClient();
  } catch (e) {
    out.warnings.push(`coverage scan: backup client ${(e as Error).message}`);
    return out;
  }

  const norm = (v: string | null | undefined) => (v ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

  // 1) Distinct engine varieties (the universe that needs a price reference).
  const { data: recRows, error: recErr } = await backup
    .from('v_supply_recommendations')
    .select('variety')
    .limit(5000);
  if (recErr) {
    out.warnings.push(`coverage scan: v_supply_recommendations ${recErr.message}`);
    return out;
  }
  const engineSet = new Set<string>();
  for (const r of (recRows ?? []) as { variety: string | null }[]) {
    const v = norm(r.variety);
    if (v) engineSet.add(v);
  }
  out.engineVarieties = engineSet.size;

  // 2) Competitor crosswalk coverage, keyed by normalized our_variety_l. Keep the
  //    STRONGEST row per variety (highest confidence) as the lens reference.
  const { data: xwRows, error: xwErr } = await backup
    .from('market_variety_crosswalk')
    .select('our_variety_l, n_rows, confidence, benchmark_pps')
    .limit(5000);
  if (xwErr) {
    out.warnings.push(`coverage scan: market_variety_crosswalk ${xwErr.message}`);
    return out;
  }
  interface XwAgg {
    nRows: number;
    confidence: number | null;
    benchmarkPps: number | null;
  }
  const xwByVariety = new Map<string, XwAgg>();
  for (const r of (xwRows ?? []) as {
    our_variety_l: string | null;
    n_rows: number | string | null;
    confidence: number | string | null;
    benchmark_pps: number | string | null;
  }[]) {
    const v = norm(r.our_variety_l);
    if (!v) continue;
    const conf =
      r.confidence == null || !Number.isFinite(Number(r.confidence)) ? null : Number(r.confidence);
    const nRows = Number.isFinite(Number(r.n_rows)) ? Number(r.n_rows) : 0;
    const pps =
      r.benchmark_pps == null || !Number.isFinite(Number(r.benchmark_pps))
        ? null
        : Number(r.benchmark_pps);
    const cur = xwByVariety.get(v);
    // Strongest (highest confidence, then most rows) row wins as the reference.
    if (!cur || (conf ?? 0) > (cur.confidence ?? 0) || ((conf ?? 0) === (cur.confidence ?? 0) && nRows > cur.nRows)) {
      xwByVariety.set(v, { nRows, confidence: conf, benchmarkPps: pps });
    }
  }

  // 3) Importance weight per variety (0 floor + provenance tag when absent).
  const { data: sigRows, error: sigErr } = await backup
    .from('supply_importance_signal')
    .select('variety_l, weight, provenance');
  if (sigErr) {
    // Importance is enrichment, not a hard dependency — degrade to weight 0 and
    // keep scanning (honest 'sin referencia' floor), but surface the error.
    out.warnings.push(`coverage scan: supply_importance_signal ${sigErr.message}`);
  }
  const importanceByVariety = new Map<string, { weight: number; provenance: string | null }>();
  for (const r of (sigRows ?? []) as {
    variety_l: string | null;
    weight: number | string | null;
    provenance: string | null;
  }[]) {
    const v = norm(r.variety_l);
    if (!v) continue;
    const w = Number.isFinite(Number(r.weight)) ? Math.max(0, Number(r.weight)) : 0;
    importanceByVariety.set(v, { weight: w, provenance: (r.provenance ?? null) || null });
  }

  // 4) Classify every engine variety: covered (strong) vs weak vs absent.
  for (const v of engineSet) {
    const xw = xwByVariety.get(v);
    const imp = importanceByVariety.get(v);
    const importance = imp?.weight ?? 0;
    const importanceProvenance = imp?.provenance ?? null;

    let reason: 'absent' | 'weak' | null = null;
    let crosswalkRows = 0;
    let benchmarkPps: number | null = null;
    let confidence: number | null = null;

    if (!xw) {
      reason = 'absent';
    } else {
      crosswalkRows = xw.nRows;
      benchmarkPps = xw.benchmarkPps;
      confidence = xw.confidence;
      const weak =
        xw.benchmarkPps == null ||
        (xw.confidence != null && xw.confidence < COVERAGE_MIN_CONFIDENCE) ||
        xw.nRows < COVERAGE_MIN_ROWS;
      if (weak) reason = 'weak';
    }

    if (reason === null) {
      out.covered += 1;
      continue;
    }
    if (reason === 'absent') out.absent += 1;
    else out.weak += 1;

    // When the competitor lens is thin AND no importance weight exists, the peer
    // lens is the only remaining reference signal -> flag it thin too so Rose can
    // fill either. (Peer cost lives in canonical_cost; not read here, per scope.)
    const missingLens: ('competitor' | 'peer')[] = ['competitor'];
    if (importance === 0) missingLens.push('peer');

    out.candidates.push({
      variety: v,
      missingLens,
      reason,
      importance,
      importanceProvenance,
      crosswalkRows,
      benchmarkPps,
      confidence,
      // priority at scan time = importance (frequency is 1 until the gap recurs;
      // the recorded row's frequency then drives importance x frequency).
      priority: importance > 0 ? importance : 1,
    });
  }

  out.candidates.sort(
    (a, b) => b.priority - a.priority || a.variety.localeCompare(b.variety),
  );
  return out;
}
