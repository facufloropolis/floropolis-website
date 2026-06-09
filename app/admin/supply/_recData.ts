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
}

const EMPTY_COMPETITOR: CompetitorContext = {
  found: false,
  avgPerStem: null,
  minPerStem: null,
  maxPerStem: null,
  sources: [],
  rowCount: 0,
};

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
        // Competitor variety CONTAINS the rec variety (case-insensitive).
        const { data, error } = await prod
          .from('competitor_prices')
          .select('source, price_per_stem')
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
        for (const row of data as { source: string | null; price_per_stem: number | string | null }[]) {
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
  // 'yes'  -> a real PROD photo exists for this variety (recover, self-contained)
  // 'no'   -> no PROD photo on record -> run the sourcing ladder
  // 'unknown' -> PROD unreachable -> we do not claim either way
  state: 'yes' | 'no' | 'unknown';
  url: string | null; // first image URL when state === 'yes'
}

// Extract the first non-empty string URL out of the jsonb images value, which
// is an array of URL strings in PROD (floropolis_inventory.images).
function firstImageUrl(images: unknown): string | null {
  if (Array.isArray(images)) {
    for (const el of images) {
      if (typeof el === 'string' && el.trim().length > 0) return el.trim();
    }
    return null;
  }
  if (typeof images === 'string') {
    const s = images.trim();
    return s.length > 0 && s !== 'null' && s !== '[]' ? s : null;
  }
  return null;
}

/**
 * Discover, for each variety, whether a real PROD product photo exists.
 * Source discovered by probing PROD information_schema: floropolis_inventory
 * (157 distinct varieties) has an `images` jsonb array keyed by `variety`.
 * Small enough to pull whole into memory in ONE query, then match in JS.
 *
 * Returns a Map keyed by lowercased variety. Never throws; on PROD failure the
 * Map is empty and callers treat missing entries as state 'unknown'.
 */
export async function getProdPhotoStatus(
  varieties: string[],
): Promise<Map<string, PhotoStatus>> {
  const out = new Map<string, PhotoStatus>();
  const prod = getProdReadClient();
  if (!prod) return out; // unreachable -> callers render 'unknown'

  const wanted = new Set(
    varieties.map((v) => (v ?? '').trim().toLowerCase()).filter(Boolean),
  );
  if (wanted.size === 0) return out;

  try {
    // floropolis_inventory is the PROD catalog photo table (variety -> images[]).
    const { data, error } = await prod
      .from('floropolis_inventory')
      .select('variety, images')
      .not('variety', 'is', null)
      .limit(10000);
    if (error || !data) return out; // empty Map -> 'unknown' for all

    // Build best photo per variety (prefer a row that actually has a URL).
    for (const row of data as { variety: string | null; images: unknown }[]) {
      const key = (row.variety ?? '').trim().toLowerCase();
      if (!key || !wanted.has(key)) continue;
      const url = firstImageUrl(row.images);
      const prev = out.get(key);
      if (url) {
        out.set(key, { state: 'yes', url });
      } else if (!prev) {
        out.set(key, { state: 'no', url: null });
      }
    }
    // Any wanted variety not present in floropolis_inventory at all = no PROD photo.
    for (const v of wanted) {
      if (!out.has(v)) out.set(v, { state: 'no', url: null });
    }
  } catch {
    return new Map(); // unreachable -> 'unknown'
  }

  return out;
}

// ---------------------------------------------------------------------------
// Learning indicator (loop feedback per rec_type / gap_type)
// ---------------------------------------------------------------------------

export interface LearningStat {
  decisions: number;
  approvals: number; // decision === 'approve'
}

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
      const cur = out.get(key) ?? { decisions: 0, approvals: 0 };
      cur.decisions += 1;
      if ((row.decision ?? '').trim().toLowerCase() === 'approve') cur.approvals += 1;
      out.set(key, cur);
    }
  } catch {
    return out;
  }
  return out;
}
