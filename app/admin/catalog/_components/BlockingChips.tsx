// BlockingChips — inline "what's blocking" chip strip for /admin/catalog rows.
// v1 | 2026-05-28 | Job_PM Catalog Ship 1 [V8 SHADOW]
//
// Renders chips for failing BLOCKING-tier gates only (lean v2.1 set per
// kb/projects/perfect_inventory_bar.md). Drops perfect-gap + publishable-gap
// gates — the chip strip is "what blocks publishing", nothing else.
//
// Categories (chip color):
//   pricing      (red)   — missing_cost_source, price_zero
//   trust        (amber) — missing_image, missing_unit, missing_vendor_name
//   fulfillment  (blue)  — t2_outside_5d_window, t3_outside_14d_window,
//                          missing_arrival_date
//
// catalog-model.ts folds the three lead_time gates into a single 'lead_time'
// entry in failed_gates (so the weight bucket sums correctly). We re-derive the
// specific failing lead-time gate here from sku.tier + sku.arrival_date + today
// so the chip points at the right edit form.
//
// Click → opens InlineEditPanel (client component). Server component itself —
// no useState / useEffect — gate derivation runs at render time on the server.
//
// RACI: read-only computation off CatalogV2Row + raw mirror image state. No
// writes from this component. Writes happen in /api/admin/catalog/inline-edit.

import type { CatalogV2Row } from '@/lib/admin/catalog-model';
import InlineEditPanel from './InlineEditPanel';

// ---------------------------------------------------------------------------
// Lean v2.1 blocking gate set + per-gate chip metadata
// ---------------------------------------------------------------------------

export type ChipCategory = 'pricing' | 'trust' | 'fulfillment';

export type GateId =
  | 'missing_cost_source'
  | 'price_zero'
  | 'missing_image'
  | 'missing_unit'
  | 'missing_vendor_name'
  | 'missing_contents_description'
  | 't2_outside_5d_window'
  | 't3_outside_14d_window'
  | 'missing_arrival_date';

export interface ChipDescriptor {
  gate_id: GateId;
  category: ChipCategory;
  short_label: string;
  // Field on floropolis_inventory_mirror the InlineEditPanel will UPDATE.
  target_field: string;
  // Current value (read-only context) shown at the top of the edit form.
  before_value: string | number | null;
}

const CHIP_LABEL: Record<GateId, string> = {
  missing_cost_source: 'cost_source missing',
  price_zero: 'price = 0',
  missing_image: 'image missing',
  missing_unit: 'unit missing',
  missing_vendor_name: 'vendor missing',
  missing_contents_description: 'contents missing',
  t2_outside_5d_window: 'T2 outside 5–180d',
  t3_outside_14d_window: 'T3 outside 14–180d',
  missing_arrival_date: 'arrival_date missing',
};

const CHIP_CATEGORY: Record<GateId, ChipCategory> = {
  missing_cost_source: 'pricing',
  price_zero: 'pricing',
  missing_image: 'trust',
  missing_unit: 'trust',
  missing_vendor_name: 'trust',
  missing_contents_description: 'trust',
  t2_outside_5d_window: 'fulfillment',
  t3_outside_14d_window: 'fulfillment',
  missing_arrival_date: 'fulfillment',
};

// Mirror field the inline edit writes to (single source of truth for executor).
const CHIP_TARGET_FIELD: Record<GateId, string> = {
  missing_cost_source: 'cost_source',
  price_zero: 'price',
  missing_image: 'images',
  missing_unit: 'unit',
  missing_vendor_name: 'vendor',
  missing_contents_description: 'contents_note',
  t2_outside_5d_window: 'arrival_date',
  t3_outside_14d_window: 'arrival_date',
  missing_arrival_date: 'arrival_date',
};

const BLOCKING_GATE_SET = new Set<string>(Object.keys(CHIP_LABEL));

// ---------------------------------------------------------------------------
// Derive failing blocking gates from CatalogV2Row
// ---------------------------------------------------------------------------

/**
 * Un-fold the lead_time bucket back to the specific gate that fired.
 * catalog-model.ts (line ~439) folds t2_outside_5d_window / t3_outside_14d_window /
 * missing_arrival_date into a single 'lead_time' entry on failed_gates. We need
 * to know which one actually fired so the chip + InlineEditPanel target the
 * right field. Re-derivation matches Rose's classifier logic:
 *   - tier T2: window is 5–180 days from today (spec v2.1 §2.1)
 *   - tier T3: window is 14–180 days
 *   - no arrival_date set → missing_arrival_date
 */
function unfoldLeadTime(sku: CatalogV2Row, todayMs: number): GateId | null {
  if (!sku.arrival_date) return 'missing_arrival_date';
  const arrMs = new Date(sku.arrival_date + 'T00:00:00').getTime();
  if (!Number.isFinite(arrMs)) return 'missing_arrival_date';
  const days = Math.round((arrMs - todayMs) / 86400000);
  const tier = (sku.tier || '').toUpperCase();
  if (tier === 'T2') {
    if (days < 5 || days > 180) return 't2_outside_5d_window';
  } else if (tier === 'T3') {
    if (days < 14 || days > 180) return 't3_outside_14d_window';
  }
  return null; // lead_time was in failed_gates but row no longer outside window
}

export interface BlockingChipsProps {
  sku: CatalogV2Row;
  // The page passes the mirror row's `images` column separately because
  // CatalogV2Row doesn't carry it. Null/empty array → missing_image fires.
  images: string[] | null;
  // contents_note from mirror (also not on CatalogV2Row).
  contents_note: string | null;
}

export default function BlockingChips({ sku, images, contents_note }: BlockingChipsProps) {
  const todayMs = (() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t.getTime();
  })();

  // Build chip descriptors from failed_gates (filtered to blocking lean set)
  // + raw row-state derivations (price_zero, missing_image, missing_unit, etc.).
  const chips: ChipDescriptor[] = [];
  const seen = new Set<GateId>();

  function pushChip(gate_id: GateId, before_value: string | number | null) {
    if (seen.has(gate_id)) return;
    seen.add(gate_id);
    chips.push({
      gate_id,
      category: CHIP_CATEGORY[gate_id],
      short_label: CHIP_LABEL[gate_id],
      target_field: CHIP_TARGET_FIELD[gate_id],
      before_value,
    });
  }

  // 1. Walk the classifier's failed_gates (the source of truth Rose validates).
  //    Filter to blocking lean set; unfold lead_time.
  for (const fg of sku.failed_gates) {
    if (fg.gate_id === 'lead_time') {
      const specific = unfoldLeadTime(sku, todayMs);
      if (specific) pushChip(specific, sku.arrival_date ?? null);
      continue;
    }
    if (BLOCKING_GATE_SET.has(fg.gate_id)) {
      const gid = fg.gate_id as GateId;
      // Derive before_value per gate from row state.
      let before: string | number | null = null;
      switch (gid) {
        case 'missing_cost_source':
          before = sku.cost_source ?? null;
          break;
        case 'price_zero':
          before = sku.price;
          break;
        case 'missing_image':
          before = images && images.length > 0 ? images[0] : null;
          break;
        case 'missing_unit':
          before = sku.unit || null;
          break;
        case 'missing_vendor_name':
          before = sku.vendor || null;
          break;
        case 'missing_contents_description':
          before = contents_note;
          break;
        case 'missing_arrival_date':
          before = sku.arrival_date ?? null;
          break;
        default:
          before = null;
      }
      pushChip(gid, before);
    }
  }

  // 2. Safety-net derivations off raw row state — fire even when the classifier
  //    hasn't caught up. These mirror the lean v2.1 blocking-gate definitions
  //    so the chip strip is honest about what's blocking publish RIGHT NOW.
  if (!sku.cost_source || sku.cost_source.trim() === '') {
    pushChip('missing_cost_source', sku.cost_source ?? null);
  }
  if (sku.price == null || sku.price === 0) {
    pushChip('price_zero', sku.price);
  }
  if (!images || images.length === 0) {
    pushChip('missing_image', null);
  }
  if (!sku.unit || sku.unit.trim() === '') {
    pushChip('missing_unit', sku.unit || null);
  }
  if (!sku.vendor || sku.vendor.trim() === '') {
    pushChip('missing_vendor_name', sku.vendor || null);
  }

  if (chips.length === 0) return null;

  return <InlineEditPanel sku_id={sku.id} sku_name={sku.name} sku_vendor={sku.vendor} sku_status={sku.publication_status} chips={chips} />;
}
