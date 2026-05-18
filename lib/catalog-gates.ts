// Plain-English labels for catalog_classifications.failing_gates IDs.
// v1 | 2026-05-18 | Job_PM CAT-S5 [V8 SHADOW]
//
// Source of truth for gate copy across:
//   - /admin/catalog/approval-queue   (Facu triage)
//   - /admin/catalog                  (CAT-S3 catalog overview, when wired)
//   - SKU detail pages                (future)
//
// IDs come from kb/projects/perfect_inventory_bar.md (16 hard gates). Add new
// IDs here as the validator grows -- unknown IDs fall back to the raw token.

export const GATE_LABELS: Record<string, string> = {
  price_zero: 'No price set',
  margin_unknown: 'Margin status is UNKNOWN -- verify cost + recompute',
  cost_unverified: 'Cost set but never verified -- Rose needs to validate',
  open_price_alert: 'Rose flagged this price as suspect',
  missing_cost_source: 'No cost source recorded',
  missing_arrival_date: 'T2/T3 with no arrival date',
  missing_image: 'No images attached',
  formula_deviation:
    'Price does not match formula (cost / 0.67 + delivery) -- likely policy override',
  stock_live_mismatch:
    'Stock > 0 but K2K live = false (visible on Floropolis per policy)',
  missing_box_dims: 'Box type has no validated weight kg',
  missing_contents_description: 'No description of what is in the box',
  missing_vendor_name: 'Vendor not shown on PDP',
  missing_last_harvested: 'Last harvested date not tracked',
  missing_vase_life: 'Vase life expectation not set',
  t2_outside_5d_window:
    'T2 with arrival_date < 5 days from today (lead-time violation)',
  t3_outside_14d_window: 'T3 with arrival_date < 14 days from today',
};

export function gateLabel(id: string): string {
  return GATE_LABELS[id] ?? id;
}

// Coarse category buckets for the page filter chips.
export type GateCategory = 'price' | 'formula' | 't3_edge' | 'other';

export function gateCategory(id: string): GateCategory {
  if (
    id === 'price_zero' ||
    id === 'margin_unknown' ||
    id === 'cost_unverified' ||
    id === 'open_price_alert' ||
    id === 'missing_cost_source'
  ) {
    return 'price';
  }
  if (id === 'formula_deviation') return 'formula';
  if (
    id === 't2_outside_5d_window' ||
    id === 't3_outside_14d_window' ||
    id === 'missing_arrival_date'
  ) {
    return 't3_edge';
  }
  return 'other';
}
