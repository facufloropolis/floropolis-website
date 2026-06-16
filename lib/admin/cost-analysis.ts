// lib/admin/cost-analysis.ts
// v1 | 2026-06-16 | Job_PM (CPO)
//
// COST lens for the inventory-verify gate (Flow B). For a NEW-cost proposal, runs a
// 3-lens COMPARATIVE read (read-only, zero writes) and returns a verdict WITH the
// numbers — never a fabricated confidence:
//
//   similar    — peer median/range over canonical_cost JOIN dim_sku for the SAME
//                category (the most populated, reliable lens).
//   variety    — same variety across OTHER vendors + history. VERIFIED THIN: 0 of
//                224 varieties in canonical_cost have >1 distinct vendor, so the
//                cross-vendor history join returns 0 rows. history is therefore
//                null / 'sin referencia' by construction, NOT an error.
//   competitor — benchmark_pps from market_variety_crosswalk via
//                lower(our_variety_l)=lower(variety). null when no crosswalk row
//                (never fabricated). Labelled 'benchmark (pps)' because the basis is
//                price-per-stem, NOT directly comparable to farm_cost.
//
// verdict ∈ {decente|caro|sospechoso} computed ONLY against the peer median with a
// configurable ±COST_OUTLIER_PCT band:
//   below band   -> 'sospechoso' (suspiciously cheap vs peers)
//   within band  -> 'decente'
//   above band   -> 'caro'
// The competitor lens is INFORMATIONAL (different basis); it never flips the verdict
// alone, it only adds a flag.
//
// HARD BAR: read-only. ZERO writes to dim_sku / *_mirror / any table. SERVER-ONLY.

import type { SupabaseClient } from '@supabase/supabase-js';

/** Outlier band around the peer median. Configurable; default ±25%. */
export const COST_OUTLIER_PCT = 0.25;

const num = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown): string | null => {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
};

export interface SkuCostProposal {
  variety?: unknown;
  category?: unknown;
  farm_cost?: unknown;
  farmCost?: unknown; // tolerate camelCase from the UI
}

export interface CostSimilarLens {
  median: number | null;
  range: [number, number] | null;
  n: number;
  source: string;
}

export interface CostVarietyLens {
  otherVendors: string[];
  history: null | 'sin referencia';
  coverage: 'sin referencia' | 'parcial' | 'completa';
}

export interface CostCompetitorLens {
  benchmark_pps: number;
  n_rows: number;
  confidence: number | null;
  competitor: string | null;
  coverage: 'exacta' | 'parcial';
  basis: 'pps'; // price-per-stem, NOT farm_cost basis — label distinctly
}

export type CostVerdict = 'decente' | 'caro' | 'sospechoso';

export interface CostAnalysis {
  similar: CostSimilarLens;
  variety: CostVarietyLens;
  competitor: CostCompetitorLens | null;
  verdict: CostVerdict;
  flags: string[];
  provenance: Record<string, string>;
}

/**
 * Read-only 3-lens cost comparison. NULL-safe; any DB error degrades the affected
 * lens to its honest empty shape (n:0 / null) rather than throwing — the caller
 * (the gate) surfaces partial coverage as a coverage-gap, it does not block.
 */
export async function analyzeCost(
  svc: SupabaseClient,
  proposal: SkuCostProposal,
): Promise<CostAnalysis> {
  const variety = str(proposal.variety);
  const category = str(proposal.category);
  const farmCost = num(proposal.farm_cost) ?? num(proposal.farmCost);

  const flags: string[] = [];
  const provenance: Record<string, string> = {
    similar: 'canonical_cost JOIN dim_sku (peer median by category)',
    variety: 'canonical_cost JOIN dim_sku (same-variety cross-vendor) — verified 0 cross-vendor rows',
    competitor: 'market_variety_crosswalk (lower(our_variety_l)=lower(variety)) — benchmark_pps',
  };

  // ── Lens 1: SIMILAR (peer median by category) ────────────────────────────────
  const similar: CostSimilarLens = {
    median: null,
    range: null,
    n: 0,
    source: category
      ? `canonical_cost x dim_sku.category=${category}`
      : 'canonical_cost x dim_sku.category',
  };
  if (category) {
    const { data, error } = await svc
      .from('canonical_cost')
      .select('farm_cost, dim_sku!inner(category)')
      .eq('dim_sku.category', category)
      .gt('farm_cost', 0)
      .limit(20000);
    if (error) {
      flags.push('similar_lens_db_error');
    } else if (Array.isArray(data)) {
      const costs = data
        .map((r) => num((r as { farm_cost?: unknown }).farm_cost))
        .filter((n): n is number => n != null && n > 0)
        .sort((a, b) => a - b);
      similar.n = costs.length;
      if (costs.length > 0) {
        similar.median = medianOf(costs);
        similar.range = [round4(costs[0]), round4(costs[costs.length - 1])];
        similar.median = round4(similar.median);
      }
    }
  } else {
    flags.push('no_category_for_peer_median');
  }

  // ── Lens 2: VARIETY (same variety across other vendors + history) ─────────────
  // VERIFIED: 0 of 224 varieties in canonical_cost span >1 vendor → this lens is
  // structurally thin. We still RUN the join (honest, not hardcoded) and report the
  // real result; in practice otherVendors is empty and history is 'sin referencia'.
  const varietyLens: CostVarietyLens = {
    otherVendors: [],
    history: null,
    coverage: 'sin referencia',
  };
  if (variety) {
    const { data, error } = await svc
      .from('canonical_cost')
      .select('farm_cost, dim_sku!inner(variety_normalized, vendor_canonical_name)')
      .ilike('dim_sku.variety_normalized', variety)
      .gt('farm_cost', 0)
      .limit(2000);
    if (error) {
      flags.push('variety_lens_db_error');
    } else if (Array.isArray(data)) {
      const vendors = new Set<string>();
      for (const r of data) {
        const v = str((r as { dim_sku?: { vendor_canonical_name?: unknown } }).dim_sku?.vendor_canonical_name);
        if (v) vendors.add(v);
      }
      varietyLens.otherVendors = Array.from(vendors);
      // History needs ≥2 vendors to be a cross-vendor reference; otherwise honest null.
      if (vendors.size >= 2) {
        varietyLens.coverage = 'parcial';
        varietyLens.history = null; // populated only when a real multi-vendor series exists
      } else {
        varietyLens.history = 'sin referencia';
        varietyLens.coverage = 'sin referencia';
      }
    }
  } else {
    varietyLens.history = 'sin referencia';
  }

  // ── Lens 3: COMPETITOR (benchmark_pps) ────────────────────────────────────────
  let competitor: CostCompetitorLens | null = null;
  if (variety) {
    const { data, error } = await svc
      .from('market_variety_crosswalk')
      .select('benchmark_pps, n_rows, confidence, competitor, our_variety_l')
      .ilike('our_variety_l', variety)
      .order('confidence', { ascending: false, nullsFirst: false })
      .limit(1);
    if (error) {
      flags.push('competitor_lens_db_error');
    } else if (Array.isArray(data) && data.length > 0) {
      const row = data[0] as Record<string, unknown>;
      const pps = num(row.benchmark_pps);
      if (pps != null) {
        const conf = num(row.confidence);
        competitor = {
          benchmark_pps: pps,
          n_rows: Number(num(row.n_rows) ?? 0),
          confidence: conf,
          competitor: str(row.competitor),
          coverage: conf != null && conf >= 0.9 ? 'exacta' : 'parcial',
          basis: 'pps',
        };
      }
    }
  }
  if (!competitor) flags.push('no_competitor_benchmark');

  // ── VERDICT (peer median only; competitor is informational, different basis) ──
  let verdict: CostVerdict = 'decente';
  if (farmCost == null) {
    flags.push('no_farm_cost_in_proposal');
  } else if (similar.median != null && similar.median > 0) {
    const lo = similar.median * (1 - COST_OUTLIER_PCT);
    const hi = similar.median * (1 + COST_OUTLIER_PCT);
    if (farmCost > hi) {
      verdict = 'caro';
      flags.push(`above_peer_band:${round4(hi)}`);
    } else if (farmCost < lo) {
      verdict = 'sospechoso';
      flags.push(`below_peer_band:${round4(lo)}`);
    } else {
      verdict = 'decente';
    }
  } else {
    // No peer reference → cannot judge against peers; honest, not a guess.
    flags.push('no_peer_median_verdict_unanchored');
  }

  // Competitor signal as an ADDED flag (never flips verdict — pps ≠ farm_cost basis).
  if (competitor && farmCost != null && competitor.benchmark_pps > 0) {
    if (farmCost > competitor.benchmark_pps) {
      flags.push('above_competitor_pps');
    }
  }

  return { similar, variety: varietyLens, competitor, verdict, flags, provenance };
}

function medianOf(sortedAsc: number[]): number {
  const n = sortedAsc.length;
  if (n === 0) return 0;
  const mid = Math.floor(n / 2);
  return n % 2 === 1 ? sortedAsc[mid] : (sortedAsc[mid - 1] + sortedAsc[mid]) / 2;
}
function round4(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}
