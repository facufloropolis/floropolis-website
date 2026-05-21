// Single-row 16-gate classifier (TypeScript port of inventory_data_validator.py).
// v1 | 2026-05-18 | Job_PM CAT-S4 [V8 SHADOW]
//
// Used by /api/admin/catalog/sku/[id]/update to eagerly re-classify a single
// SKU after an admin edit -- so the detail page reflects the new gate state
// on router.refresh() instead of waiting for the nightly validator cron.
//
// Source of truth for gate behavior remains the Python validator. This file
// must stay in sync with scripts/jobs/inventory_data_validator.py. Gates
// 14 (last_harvested_date) and 15 (vase_life_days) are intentionally NOT
// evaluated because the mirror schema lacks those columns. When Rose adds
// them, mirror the additions here AND in the Python validator together.

const FORMULA_DEVIATION_THRESHOLD_PCT = 5;
const COST_VERIFIED_WINDOW_DAYS = 30;

const EVALUATED_GATE_IDS = new Set([
  'price_zero',
  'margin_unknown',
  'formula_deviation',
  'missing_cost_source',
  'cost_unverified',
  'open_price_alert',
  'missing_box_dims',
  'missing_units_or_bunch',
  'missing_unit',
  'missing_image',
  'missing_contents_description',
  'missing_arrival_date',
  't2_outside_5d_window',
  't3_outside_14d_window',
  'missing_vendor_name',
]);


// Hardcoded box weight fallback (matches Python _BOX_DIM_KG_FALLBACK).
const BOX_DIM_KG_FALLBACK: Record<string, number> = {
  QB: 6.8,
  'QB-M': 5.3,
  'QB-OLI': 6.8,
  'QB-MF': 6.05,
  HB: 11.7,
  EB: 4.25,
  'EB-M': 3.99,
  'EB-MF': 4.76,
  'SB-M': 2.94,
  QBV: 8.75,
  FB: 20.9,
  '1/8-MF': 4.76,
};

export interface MirrorRow {
  id: number;
  name?: string | null;
  variety?: string | null;
  vendor?: string | null;
  tier?: string | null;
  price?: number | string | null;
  stock?: number | string | null;
  farm_cost?: number | string | null;
  cost_source?: string | null;
  cost_verified_at?: string | null;
  margin_status?: string | null;
  has_open_price_alert?: boolean | null;
  arrival_date?: string | null;
  live?: boolean | null;
  box_type?: string | null;
  units_per_box?: number | string | null;
  total_stems?: number | string | null;
  stems_per_bunch?: number | string | null;
  unit?: string | null;
  contents_note?: string | null;
  images?: unknown;
}

export interface ClassifierConfig {
  pricingConstants: Record<string, number>; // gpm_target, fedex_rate_per_kg, fuel_surcharge_mult
  boxMaster: Record<string, number>;        // UPPERCASED box_type -> weight_kg
  // gate_id -> tier from catalog_quality_weights. Falls back to 'publishable_gap' when missing.
  gateTiers: Record<string, 'blocking' | 'publishable_gap' | 'perfect_gap'>;
}

export interface Classification {
  sku_id: number;
  status: 'blocked' | 'publishable' | 'perfect';
  failing_gates: string[];
  gate_score: number;
  vendor: string | null;
  tier: string | null;
  variety: string | null;
}

function toNum(v: unknown): number {
  if (v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function parseDate(v: unknown): Date | null {
  if (!v || typeof v !== 'string') return null;
  // Tolerate "YYYY-MM-DD" or full ISO
  const s = v.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isFinite(d.getTime()) ? d : null;
}

function todayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / (24 * 60 * 60 * 1000));
}

function resolveBoxWeight(
  boxTypeRaw: string | null | undefined,
  boxMaster: Record<string, number>,
): number | null {
  if (!boxTypeRaw) return null;
  const bt = boxTypeRaw.toUpperCase().trim();
  const lookup = (k: string): number | undefined => boxMaster[k] ?? BOX_DIM_KG_FALLBACK[k];
  const direct = lookup(bt);
  if (direct != null) return direct;
  if (bt.includes('/')) {
    const components = bt
      .split('/')
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
    const weights: number[] = [];
    for (const c of components) {
      const w = lookup(c);
      if (w != null) weights.push(w);
    }
    if (weights.length > 0) return Math.min(...weights);
  }
  return null;
}

function computeExpectedPrice(
  row: MirrorRow,
  config: ClassifierConfig,
): number | null {
  const cost = toNum(row.farm_cost);
  if (cost <= 0) return null;

  const gpm = config.pricingConstants.gpm_target ?? 0.33;
  const fedex = config.pricingConstants.fedex_rate_per_kg ?? 6.5;
  const fuel = config.pricingConstants.fuel_surcharge_mult ?? 1.25;

  const vendor = (row.vendor ?? '').toLowerCase();
  if (vendor.includes('usa')) {
    return Math.round((cost / (1 - gpm)) * 10000) / 10000;
  }

  const stemsPerBox = toNum(row.units_per_box) || toNum(row.total_stems);
  if (stemsPerBox <= 0) return null;

  const dimKg = resolveBoxWeight(row.box_type ?? null, config.boxMaster);
  if (dimKg == null) return null;

  const deliveryPerBox = Math.ceil(dimKg) * fedex * fuel;
  const deliveryPerStem = deliveryPerBox / stemsPerBox;
  const priceExDelivery = cost / (1 - gpm);
  return Math.round((priceExDelivery + deliveryPerStem) * 10000) / 10000;
}

export function classifySingleSku(
  row: MirrorRow,
  config: ClassifierConfig,
): Classification {
  const failing: string[] = [];
  const today = todayUtc();
  const tier = (row.tier ?? '').toUpperCase();
  const price = toNum(row.price);
  const stock = toNum(row.stock);

  // 1 price > 0
  if (price <= 0) failing.push('price_zero');

  // 2 margin_status set + not UNKNOWN
  const ms = row.margin_status ?? '';
  if (!ms || ms === 'UNKNOWN') failing.push('margin_unknown');

  // 3 formula deviation
  if (price > 0 && toNum(row.farm_cost) > 0) {
    const expected = computeExpectedPrice(row, config);
    if (expected != null && expected > 0) {
      const dps = ((price - expected) / expected) * 100;
      if (Math.abs(dps) > FORMULA_DEVIATION_THRESHOLD_PCT) {
        failing.push('formula_deviation');
      }
    }
  }

  // 4 cost_source
  if (!row.cost_source) failing.push('missing_cost_source');

  // 5 cost_verified_at within 30d
  const cv = parseDate(row.cost_verified_at);
  if (cv == null || daysBetween(today, cv) > COST_VERIFIED_WINDOW_DAYS) {
    failing.push('cost_unverified');
  }

  // 6 has_open_price_alert
  if (row.has_open_price_alert === true) failing.push('open_price_alert');

  // 7 box dims
  if (resolveBoxWeight(row.box_type ?? null, config.boxMaster) == null) {
    failing.push('missing_box_dims');
  }

  // 8 units_per_box + stems_per_bunch
  const upb = toNum(row.units_per_box);
  const spb = toNum(row.stems_per_bunch);
  const unitLower = (row.unit ?? '').toLowerCase();
  const needsBunch = unitLower === 'bunch';
  if (upb <= 0 || (needsBunch && spb <= 0)) {
    failing.push('missing_units_or_bunch');
  }

  // 9 unit set
  if (!row.unit) failing.push('missing_unit');

  // 10 images
  const imgs = row.images;
  if (imgs == null || (Array.isArray(imgs) && imgs.length === 0)) {
    failing.push('missing_image');
  }

  // 11 contents_description (mirror schema: contents_note)
  if (!row.contents_note) failing.push('missing_contents_description');

  // 12 tier-appropriate lead time
  const arrival = parseDate(row.arrival_date);
  if ((tier === 'T2' || tier === 'T3') && arrival == null) {
    failing.push('missing_arrival_date');
  }
  if (tier === 'T2' && arrival != null && stock <= 0) {
    if (daysBetween(arrival, today) < 5) failing.push('t2_outside_5d_window');
  }
  if (tier === 'T3' && arrival != null && stock <= 0) {
    if (daysBetween(arrival, today) < 14) failing.push('t3_outside_14d_window');
  }

  // 13 vendor name
  if (!row.vendor) failing.push('missing_vendor_name');

  // Extra signal: stock > 0 + live = false
  if (stock > 0 && row.live === false) failing.push('stock_live_mismatch');

  // gate_score = count of evaluated gates that PASSED
  const failingEvaluated = failing.filter((g) => EVALUATED_GATE_IDS.has(g));
  const gateScore = Math.max(
    0,
    Math.min(EVALUATED_GATE_IDS.size, EVALUATED_GATE_IDS.size - failingEvaluated.length),
  );

  // Lead-time gate IDs all map to the 'lead_time' weight bucket tier.
  const LEAD_TIME_IDS = new Set(['t2_outside_5d_window', 't3_outside_14d_window', 'missing_arrival_date']);

  function tierOf(gateId: string): 'blocking' | 'publishable_gap' | 'perfect_gap' {
    const mapped = LEAD_TIME_IDS.has(gateId) ? 'lead_time' : gateId;
    return config.gateTiers[mapped] ?? 'publishable_gap';
  }

  let status: 'blocked' | 'publishable' | 'perfect';
  if (failingEvaluated.length === 0) {
    status = 'perfect';
  } else if (failingEvaluated.some((g) => tierOf(g) === 'blocking')) {
    status = 'blocked';
  } else {
    // Only publishable_gap or perfect_gap gates failing → publishable
    status = 'publishable';
  }

  return {
    sku_id: row.id,
    status,
    failing_gates: failing,
    gate_score: gateScore,
    vendor: row.vendor ?? null,
    tier: tier || null,
    variety: row.variety ?? null,
  };
}
