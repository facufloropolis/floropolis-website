// Plain-English labels for catalog_classifications.failing_gates IDs.
// v2 | 2026-06-03 | Job_PM — current 13-gate vocab (re-key cleanup) [V8 SHADOW]
//
// Source of truth for gate copy across:
//   - /admin/catalog/approval-queue   (Facu triage)
//   - /admin/catalog                  (CAT-S3 catalog overview, when wired)
//   - SKU detail pages                (future)
//
// IDs are the current catalog_quality_weights vocabulary (13 gates: 6 blocking /
// 2 publishable_gap / 5 perfect_gap placeholders). The deprecated 25-gate copy
// (cost_unverified, open_price_alert, stock_live_mismatch, margin_unknown,
// formula_deviation, t2/t3 window gates, missing_arrival_date, missing_last_harvested,
// missing_vase_life) was removed when the validator + classifications were re-keyed
// to the current spec. Unknown IDs fall back to the raw token.

export const GATE_LABELS: Record<string, string> = {
  // blocking (6)
  price_zero: 'No price set',
  missing_cost_source: 'No cost source recorded',
  missing_vendor_name: 'Vendor not shown on PDP',
  missing_unit: 'No selling unit recorded',
  missing_box_dims: 'Box type has no validated weight kg',
  missing_image: 'No images attached',
  // publishable_gap (2)
  missing_contents_description: 'No description of what is in the box',
  missing_units_or_bunch: 'Units / stems-per-bunch not recorded',
  // perfect_gap placeholders (5, weight=0, not evaluated yet)
  customer_feedback_rating: 'No customer feedback rating yet',
  demand_general: 'General demand signal not available',
  demand_traffic: 'Traffic demand signal not available',
  exclusivity: 'Exclusivity signal not set',
  price_competitiveness: 'Price competitiveness not benchmarked',
};

export function gateLabel(id: string): string {
  return GATE_LABELS[id] ?? id;
}

// Coarse category buckets for the page filter chips.
export type GateCategory = 'price' | 'supply' | 'content' | 'demand' | 'other';

export function gateCategory(id: string): GateCategory {
  if (id === 'price_zero' || id === 'missing_cost_source') {
    return 'price';
  }
  if (
    id === 'missing_vendor_name' ||
    id === 'missing_unit' ||
    id === 'missing_box_dims' ||
    id === 'missing_units_or_bunch'
  ) {
    return 'supply';
  }
  if (id === 'missing_image' || id === 'missing_contents_description') {
    return 'content';
  }
  if (
    id === 'customer_feedback_rating' ||
    id === 'demand_general' ||
    id === 'demand_traffic' ||
    id === 'exclusivity' ||
    id === 'price_competitiveness'
  ) {
    return 'demand';
  }
  return 'other';
}
