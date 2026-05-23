// Catalog-v2 model: weighted quality_score + importance_score + priority_to_fix.
// v1.1 | 2026-05-20 | Job_PM catalog-v2 [V8 SHADOW]
//
// ============================================================================
// RACI — DATA OWNERSHIP (enforced by file boundary)
// ============================================================================
//
// ROSE (Accountable — source of truth for all raw data):
//   - box_master.weight_kg         pricing_constants (fedex_rate, fuel_mult, gpm_target)
//   - floropolis_inventory_mirror  (price, farm_cost, units_per_box, arrival_date, country, tier…)
//   - catalog_quality_weights      catalog_quality_thresholds   catalog_classifications
//   - tier_visibility_windows      (accepted windows — Rose validates, Facu approves changes)
//
// THIS FILE (catalog-model.ts) — the ONLY place allowed to run business arithmetic:
//   - Derives computed fields FROM Rose's raw inputs (gpm, shipping_per_stem, margin_per_stem,
//     gap_to_perfect, quality_score, priority_to_fix…)
//   - Exports them as typed fields on CatalogV2Row
//   - No business logic may live anywhere else in the admin stack
//
// page.tsx (Responsible — display/filter only, ZERO business arithmetic):
//   - Reads CatalogV2Row fields — formats, filters, sorts, renders
//   - Prohibited: any arithmetic operator (*,/,+,-) applied to Rose's raw inputs
//   - If a computed display value is missing from CatalogV2Row → add it HERE, not there
//
// FACU (Approves):
//   - Config changes (tier windows, weights, thresholds) flow: Facu proposes → Rose validates
//   - Pending Rose sign-off, the change is not live in the DB
//
// ============================================================================
//
// Why this exists:
//   Round 2 W2 SHOP-FILTER dropped the admin catalog from 707 to 110 SKUs by
//   treating the 16-gate threshold as a per-SKU publishable filter. Facu called
//   it a "DESASTRE": the 16 gates are a DATA QUALITY signal, not a binary
//   publish-or-hide. This module replaces the filter with a weighted 0-100
//   score per SKU computed against catalog_quality_weights, plus an importance
//   score from the featured-products framework. The admin page renders the FULL
//   universe (T2 + T3 + K2K live) with priority_to_fix sorting.
//
// Inputs:
//   - mirror rows  (floropolis_inventory_mirror)
//   - validator classifications  (catalog_classifications.failing_gates[])
//   - weights      (catalog_quality_weights)
//   - thresholds   (catalog_quality_thresholds.perfect_min_score)
//   - importance seed (lib/admin/featured-scores-seed.ts)
//
// Universe definition (per feedback_admin_design_principles section 1):
//   "T2 vendor agreements" + "T3 vendor agreements" + "K2K live SKUs"
//   In today's mirror schema:
//     - tier='T2'  -> T2 commitment
//     - tier='T3'  -> T3 sourceable
//     - cost_source ILIKE '%_k2k_%' AND live=true  -> K2K live
//   De-dupe by SKU id (the same row can satisfy multiple buckets).
//
// quality_score:
//   sum(weight WHERE gate is PASSING) -- 0..100.
//   When validator emits a failing_gate, that gate's weight is SUBTRACTED.
//   Gates with evaluated=false in the weights table are PRESUMED PASSING today
//   (we don't have data to fail them on); their weight still counts toward 100
//   so the perfect threshold remains correctly calibrated.
//
// status_band derives from quality_score:
//   100: perfect
//   90-99: almost_perfect
//   75-89: needs_minor_fix
//   50-74: has_issues
//   <50:   broken
//
// importance_score:
//   Lookup against FEATURED_SCORE_SEED (7 SKUs today). null = no seed match.
//
// priority_to_fix:
//   (importance_score ?? 0) * (100 - quality_score)
//   importance=null -> 0 (don't elevate ungraded SKUs in the queue).

import { lookupImportanceScore } from './featured-scores-seed';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface QualityWeightRow {
  gate_id: string;
  display_label: string;
  category: string;
  weight: number;
  tier: 'blocking' | 'publishable_gap' | 'perfect_gap';
  description: string | null;
  evaluated: boolean;
  updated_at: string | null;
  updated_by: string | null;
}

export interface QualityThresholdRow {
  threshold_id: string;
  value: number;
  description: string | null;
  updated_at: string | null;
  updated_by: string | null;
}

export interface ClassificationRow {
  sku_id: number;
  status: string;
  failing_gates: string[] | null;
  gate_score: number;
  vendor: string | null;
  tier: string | null;
  variety: string | null;
}

export interface MirrorRow {
  id: number;
  name: string;
  vendor: string | null;
  tier: string | null;
  category: string | null;
  variety: string | null;
  color: string | null;
  length: string | null;
  unit: string | null;
  price: number | string | null;
  farm_cost: number | string | null;
  cost_source: string | null;
  cost_verified_at: string | null;
  stock: number | string | null;
  total_stems: number | null;
  units_per_box: number | string | null;
  box_type: string | null;
  margin_status: string | null;
  live: boolean;
  active: boolean;
  arrival_date: string | null;
  country?: string | null;
}

export interface BoxMasterRow {
  box_type: string;
  weight_kg: number | string | null;
  description: string | null;
  validated_by: string | null;
  validated_at: string | null;
  active?: boolean | null;
}

export interface PricingConstantRow {
  id: string;
  value_numeric: number | string | null;
}

export type PublicationStatus = 'blocked' | 'publishable' | 'perfect';

export type StatusBand =
  | 'perfect'
  | 'almost_perfect'
  | 'needs_minor_fix'
  | 'has_issues'
  | 'broken'
  | 'unscored';

export type UniverseBucket = 't2' | 't3' | 'k2k_live';

export type GpmBand = 'green' | 'amber' | 'red';
export type Visibility = 'live' | 'hidden' | 'draft';

export interface FailedGateDetail {
  gate_id: string;
  display_label: string;
  weight: number;
  category: string;
}

export interface CatalogV2Row {
  // Identity
  id: number;
  name: string;
  vendor: string;
  tier: string;
  category: string;
  variety: string;
  color: string | null;
  length: string;
  unit: string;
  // Universe membership
  buckets: UniverseBucket[];
  // Scores
  quality_score: number | null; // null = no classification row yet
  publication_status: PublicationStatus; // blocked | publishable | perfect — derived from gate tiers
  status_band: StatusBand; // quality gradient for display
  importance_score: number | null;
  priority_to_fix: number;
  // Diagnostic
  failed_gates: FailedGateDetail[];
  unevaluated_gate_ids: string[];
  // Surfaced raw data for the table
  price: number | null;
  farm_cost: number | null;
  stock: number;
  total_stems: number;
  units_per_box: number | null;
  boxes_available: number | null;
  live: boolean;
  active: boolean;
  cost_source: string | null;
  arrival_date: string | null;
  country: string | null;
  // Box + shipping
  box_type: string | null;
  box_verified: boolean;
  box_weight_kg: number | null;
  shipping_per_stem: number | null;
  // GPM (computed from price - farm_cost - shipping_per_stem) / price
  gpm: number | null;
  gpm_band: GpmBand | null;
  // Margin per stem in $ (price - farm_cost - shipping_per_stem). null when price or cost missing.
  // shipping treated as 0 when null (US domestic: delivery baked into farm_cost; no separate leg).
  margin_per_stem: number | null;
  // Gap to perfect threshold (perfect_min_score - quality_score). null when unscored.
  gap_to_perfect: number | null;
  // Visibility (derived from live + active)
  visibility: Visibility;
  // Override marker (NULL today; surfaced by future joins to overrides table)
  active_override_id: string | null;
}

export interface UniverseCounts {
  t2: number;
  t3: number;
  k2k_live: number;
  total: number; // distinct SKUs across all 3 buckets
}

export interface CatalogSummary {
  universe: UniverseCounts;
  perfect_count: number;
  perfect_pct: number;
  scored_count: number;
  unscored_count: number;
  importance_covered_count: number;
  perfect_min_score: number;
  histogram: {
    lt_50: number;
    band_50_74: number;
    band_75_89: number;
    band_90_99: number;
    eq_100: number;
    unscored: number;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function asNum(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

export function bandFor(score: number | null): StatusBand {
  if (score == null) return 'unscored';
  if (score >= 100) return 'perfect';
  if (score >= 90) return 'almost_perfect';
  if (score >= 75) return 'needs_minor_fix';
  if (score >= 50) return 'has_issues';
  return 'broken';
}

// Gate IDs that fold into the "lead_time" weight bucket (all three are blocking).
const LEAD_TIME_GATE_IDS = new Set([
  't2_outside_5d_window',
  't3_outside_14d_window',
  'missing_arrival_date',
]);

export function publicationStatusFor(
  failedGates: FailedGateDetail[],
  weightsByGate: Map<string, QualityWeightRow>,
): PublicationStatus {
  if (failedGates.length === 0) return 'perfect';
  for (const g of failedGates) {
    const w = weightsByGate.get(g.gate_id);
    if (w && w.tier === 'blocking') return 'blocked';
  }
  for (const g of failedGates) {
    const w = weightsByGate.get(g.gate_id);
    if (w && w.tier === 'publishable_gap') return 'publishable';
  }
  // Only perfect_gap gates failing → publishable (perfect_gap is aspirational)
  return 'publishable';
}

export const PUBLICATION_STATUS_LABEL: Record<PublicationStatus, string> = {
  blocked: 'Blocked',
  publishable: 'Publishable',
  perfect: 'Perfect',
};

export const PUBLICATION_STATUS_CLS: Record<PublicationStatus, string> = {
  blocked: 'bg-red-50 text-red-700 border border-red-200',
  publishable: 'bg-amber-50 text-amber-700 border border-amber-200',
  perfect: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
};

export const STATUS_BAND_LABEL: Record<StatusBand, string> = {
  perfect: 'Perfect',
  almost_perfect: 'Almost perfect',
  needs_minor_fix: 'Needs minor fix',
  has_issues: 'Has issues',
  broken: 'Broken',
  unscored: 'Unscored',
};

export const STATUS_BAND_CLS: Record<StatusBand, string> = {
  perfect: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
  almost_perfect: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  needs_minor_fix: 'bg-amber-50 text-amber-700 border border-amber-200',
  has_issues: 'bg-orange-50 text-orange-700 border border-orange-200',
  broken: 'bg-red-50 text-red-700 border border-red-200',
  unscored: 'bg-slate-50 text-slate-500 border border-slate-200',
};

function deriveBuckets(row: MirrorRow): UniverseBucket[] {
  const out: UniverseBucket[] = [];
  if (row.tier === 'T2') out.push('t2');
  if (row.tier === 'T3') out.push('t3');
  if (row.cost_source && /_k2k_/i.test(row.cost_source) && row.live) {
    out.push('k2k_live');
  }
  return out;
}

export function deriveVisibility(row: MirrorRow): Visibility {
  if (row.live && row.active) return 'live';
  if (row.active && !row.live) return 'hidden';
  return 'draft';
}

export function gpmBandFor(gpm: number | null): GpmBand | null {
  if (gpm == null) return null;
  if (gpm >= 0.33) return 'green';
  if (gpm >= 0.25) return 'amber';
  return 'red';
}

export const GPM_BAND_CLS: Record<GpmBand, string> = {
  green: 'text-emerald-700',
  amber: 'text-amber-700',
  red: 'text-red-700',
};

export const VISIBILITY_BADGE_CLS: Record<Visibility, string> = {
  live: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
  hidden: 'bg-slate-100 text-slate-600 border border-slate-200',
  draft: 'bg-amber-100 text-amber-800 border border-amber-200',
};

// ---------------------------------------------------------------------------
// Build catalog rows
// ---------------------------------------------------------------------------

export interface BuildCatalogInputs {
  mirror: MirrorRow[];
  classifications: ClassificationRow[];
  weights: QualityWeightRow[];
  thresholds: QualityThresholdRow[];
  // Optional -- when provided, enables per-row GPM + shipping_per_stem compute.
  // When omitted, those fields are null and the GPM column renders "--".
  boxMaster?: BoxMasterRow[];
  pricingConstants?: PricingConstantRow[];
}

export interface BuildCatalogOutput {
  rows: CatalogV2Row[];
  summary: CatalogSummary;
  weights_by_gate: Map<string, QualityWeightRow>;
  perfect_min_score: number;
}

export function buildCatalog(inputs: BuildCatalogInputs): BuildCatalogOutput {
  const { mirror, classifications, weights, thresholds, boxMaster, pricingConstants } = inputs;

  // Index helpers ---------------------------------------------------------
  const weightsByGate = new Map<string, QualityWeightRow>();
  for (const w of weights) {
    if (w && typeof w.gate_id === 'string') weightsByGate.set(w.gate_id, w);
  }
  const classBySku = new Map<number, ClassificationRow>();
  for (const c of classifications) {
    if (c && c.sku_id != null) classBySku.set(c.sku_id, c);
  }
  const boxByType = new Map<string, BoxMasterRow>();
  for (const b of boxMaster ?? []) {
    if (b && typeof b.box_type === 'string') boxByType.set(b.box_type, b);
  }
  const pricingMap = new Map<string, number>();
  for (const c of pricingConstants ?? []) {
    const n = asNum(c.value_numeric);
    if (n != null) pricingMap.set(c.id, n);
  }
  const fedexRate = pricingMap.get('fedex_rate_per_kg') ?? null;
  const fuelMult = pricingMap.get('fuel_surcharge_mult') ?? null;

  const perfectThresholdRow = thresholds.find((t) => t.threshold_id === 'perfect_min_score');
  // Default to 100 if missing/malformed (Facu spec: weights table is the model;
  // threshold is the gate).
  const perfectMinRaw = perfectThresholdRow?.value;
  const perfect_min_score =
    typeof perfectMinRaw === 'number' && Number.isFinite(perfectMinRaw)
      ? perfectMinRaw
      : 100;

  // Restrict to the universe (T2 + T3 + K2K live). Anything else falls out.
  const universeRows = mirror.filter((r) => deriveBuckets(r).length > 0);

  // Compute per-row ------------------------------------------------------
  const rows: CatalogV2Row[] = universeRows.map((r) => {
    const buckets = deriveBuckets(r);
    const cls = classBySku.get(r.id) ?? null;

    // Quality score
    let quality_score: number | null = null;
    let failed_gates: FailedGateDetail[] = [];
    const unevaluated_gate_ids: string[] = [];

    if (cls) {
      // Normalize failing_gates -- can be jsonb array or null. Also includes
      // formula_deviation_<pct> variants which we normalize back to base id.
      const rawFails = Array.isArray(cls.failing_gates) ? cls.failing_gates : [];
      const normalized = new Set<string>();
      for (const g of rawFails) {
        if (typeof g !== 'string') continue;
        if (g.startsWith('formula_deviation_')) normalized.add('formula_deviation');
        else if (
          g === 't2_outside_5d_window' ||
          g === 't3_outside_14d_window' ||
          g === 'missing_arrival_date'
        ) {
          // All three fold into the "lead_time" weight bucket.
          normalized.add('lead_time');
        } else {
          normalized.add(g);
        }
      }

      let score = 0;
      for (const [gate_id, w] of weightsByGate.entries()) {
        if (!w.evaluated) {
          unevaluated_gate_ids.push(gate_id);
          // Presumed passing -- credit the weight (perfect_min_score = 100 still attainable).
          score += w.weight;
          continue;
        }
        if (normalized.has(gate_id)) {
          // failing -- record detail, do NOT credit weight
          failed_gates.push({
            gate_id,
            display_label: w.display_label,
            weight: w.weight,
            category: w.category,
          });
        } else {
          score += w.weight;
        }
      }
      // Clamp 0..100 (the seed guarantees sum=100, but be defensive).
      quality_score = Math.max(0, Math.min(100, score));
      // Sort failures by weight desc -- most impactful first in the UI.
      failed_gates.sort((a, b) => b.weight - a.weight);
    }

    const publication_status = publicationStatusFor(failed_gates, weightsByGate);

    const importance_score = lookupImportanceScore(r.name);
    const priority_to_fix =
      quality_score == null
        ? (importance_score ?? 0) * 100 // worst case: ungraded but flagged important
        : (importance_score ?? 0) * (100 - quality_score);

    // Box + shipping ------------------------------------------------------
    const box = r.box_type ? boxByType.get(r.box_type) ?? null : null;
    const boxWeight = box ? asNum(box.weight_kg) : null;
    const upbRaw = asNum(r.units_per_box);
    const unitsPerBox = upbRaw != null && upbRaw > 0 ? upbRaw : null;
    // box_master is "verified" when validated_by + validated_at are populated.
    const boxVerified = !!(box && box.validated_by && box.validated_at);
    const shipping_per_stem =
      boxWeight != null && fedexRate != null && fuelMult != null && unitsPerBox != null
        ? (Math.ceil(boxWeight) * fedexRate * fuelMult) / unitsPerBox
        : null;

    // GPM = (price - cost - shipping) / price
    // Today we have no box_share data (box_master cost_usd not in schema yet);
    // box_cost folds into shipping when it lands. Document in callsite.
    const priceN = asNum(r.price);
    const costN = asNum(r.farm_cost);
    const gpm =
      priceN != null && priceN > 0 && costN != null
        ? (priceN - costN - (shipping_per_stem ?? 0)) / priceN
        : null;
    const gpm_band = gpmBandFor(gpm);

    // Margin $ per stem — the dollar equivalent of GPM without the ratio.
    // null when price or cost is missing (not the same as zero margin).
    const margin_per_stem =
      priceN != null && costN != null
        ? priceN - costN - (shipping_per_stem ?? 0)
        : null;

    // Gap to perfect threshold — how many quality points this SKU needs to close.
    // null when unscored (quality_score=null): unscored ≠ broken, it's simply unmeasured.
    const gap_to_perfect =
      quality_score != null ? perfect_min_score - quality_score : null;

    // Available boxes (when units_per_box known).
    const totalStems =
      r.total_stems != null
        ? r.total_stems
        : Math.max(0, Math.round(asNum(r.stock) ?? 0));
    const boxes_available =
      unitsPerBox != null ? Math.floor(totalStems / unitsPerBox) : null;

    return {
      id: r.id,
      name: r.name,
      vendor: r.vendor ?? 'Unknown',
      tier: r.tier ?? '',
      category: r.category ?? '',
      variety: r.variety ?? '',
      color: r.color ?? null,
      length: r.length ?? '',
      unit: r.unit ?? '',
      buckets,
      quality_score,
      publication_status,
      status_band: bandFor(quality_score),
      importance_score,
      priority_to_fix,
      failed_gates,
      unevaluated_gate_ids,
      price: priceN,
      farm_cost: costN,
      stock: totalStems,
      total_stems: totalStems,
      units_per_box: unitsPerBox,
      boxes_available,
      live: r.live === true,
      active: r.active === true,
      cost_source: r.cost_source,
      arrival_date: r.arrival_date,
      country: r.country ?? null,
      box_type: r.box_type ?? null,
      box_verified: boxVerified,
      box_weight_kg: boxWeight,
      shipping_per_stem,
      gpm,
      gpm_band,
      margin_per_stem,
      gap_to_perfect,
      visibility: deriveVisibility(r),
      active_override_id: null,
    };
  });

  // Summary ---------------------------------------------------------------
  const universe: UniverseCounts = {
    t2: rows.filter((r) => r.buckets.includes('t2')).length,
    t3: rows.filter((r) => r.buckets.includes('t3')).length,
    k2k_live: rows.filter((r) => r.buckets.includes('k2k_live')).length,
    total: rows.length,
  };

  const histogram = {
    lt_50: 0,
    band_50_74: 0,
    band_75_89: 0,
    band_90_99: 0,
    eq_100: 0,
    unscored: 0,
  };
  let perfect_count = 0;
  let scored_count = 0;
  let importance_covered_count = 0;
  for (const r of rows) {
    if (r.importance_score != null) importance_covered_count += 1;
    if (r.quality_score == null) {
      histogram.unscored += 1;
      continue;
    }
    scored_count += 1;
    if (r.quality_score >= perfect_min_score) perfect_count += 1;
    if (r.quality_score < 50) histogram.lt_50 += 1;
    else if (r.quality_score < 75) histogram.band_50_74 += 1;
    else if (r.quality_score < 90) histogram.band_75_89 += 1;
    else if (r.quality_score < 100) histogram.band_90_99 += 1;
    else histogram.eq_100 += 1;
  }
  const summary: CatalogSummary = {
    universe,
    perfect_count,
    perfect_pct:
      universe.total > 0 ? Math.round((perfect_count / universe.total) * 1000) / 10 : 0,
    scored_count,
    unscored_count: universe.total - scored_count,
    importance_covered_count,
    perfect_min_score,
    histogram,
  };

  return { rows, summary, weights_by_gate: weightsByGate, perfect_min_score };
}

// ---------------------------------------------------------------------------
// Recommended action for "Action" column
// ---------------------------------------------------------------------------

export interface RecommendedAction {
  label: string;
  hint: string;
  href: string | null; // null = "no single-page action" (escalate)
  escalate: boolean;
}

/**
 * Pick the single most impactful action for this row, based on the
 * highest-weight failed gate. Lead time + formula deviation route to
 * Rose escalation (data quality cycle); the others route to the SKU's
 * /admin/catalog/[id] page where ProposeForms surface the relevant edit.
 */
export function recommendAction(row: CatalogV2Row): RecommendedAction {
  if (row.status_band === 'perfect') {
    return {
      label: 'Already perfect',
      hint: 'No action needed.',
      href: `/admin/catalog/${row.id}`,
      escalate: false,
    };
  }
  if (row.failed_gates.length === 0) {
    return {
      label: 'Open SKU',
      hint: 'No failing gates surfaced; review SKU page.',
      href: `/admin/catalog/${row.id}`,
      escalate: false,
    };
  }
  const top = row.failed_gates[0];
  // Gates Rose owns (data quality cycle).
  const roseGates = new Set([
    'formula_deviation',
    'lead_time',
    'open_price_alert',
    'cost_unverified',
    'missing_cost_source',
    'missing_box_dims',
  ]);
  if (roseGates.has(top.gate_id)) {
    return {
      label: `Escalate: ${top.display_label}`,
      hint: 'Routes to Rose via rose_queue (price/cost/lead-time owned upstream).',
      href: `/admin/catalog/${row.id}`,
      escalate: true,
    };
  }
  return {
    label: `Fix: ${top.display_label}`,
    hint: 'Opens SKU detail with proposal form pre-targeted.',
    href: `/admin/catalog/${row.id}`,
    escalate: false,
  };
}
