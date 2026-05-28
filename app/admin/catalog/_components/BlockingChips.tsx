// BlockingChips — inline "what's blocking" chip strip for /admin/catalog rows.
// v2 | 2026-05-28 | Job_PM Catalog Ship 1 + v2.2 amendment [V8 SHADOW]
//
// Renders chips for failing BLOCKING-tier gates per perfect_inventory_bar v2.2:
//   pricing  (red)   — missing_cost_source, price_zero
//   trust    (amber) — missing_image, missing_unit, missing_vendor_name
//
// FULFILLMENT GATES DROPPED (v2.2, Facu 2026-05-28): the lead_time family
// (t2_outside_5d_window / t3_outside_14d_window / missing_arrival_date) is
// NO LONGER a blocking-publish gate. T2/T3 publishability is on tier +
// commitment + basics; arrival_date is informational only (vendor's expected
// delivery, useful for follow-up when stale, NOT a publish blocker). Stale
// arrival now surfaces as a small inline informational hint, not a chip.
//
// catalog_quality_weights.evaluated=false for those 4 gates (lead_time +
// 3 variants) so the classifier no longer treats them as blockers either.
//
// Click chip → opens InlineEditPanel (client component). Server component
// itself — no useState / useEffect — gate derivation runs at render time.
//
// RACI: read-only computation off CatalogV2Row + raw mirror image state. No
// writes from this component. Writes happen in /api/admin/catalog/inline-edit.

import type { CatalogV2Row } from '@/lib/admin/catalog-model';
import InlineEditPanel from './InlineEditPanel';

// ---------------------------------------------------------------------------
// Lean v2.2 blocking gate set + per-gate chip metadata
// ---------------------------------------------------------------------------

export type ChipCategory = 'pricing' | 'trust';

export type GateId =
  | 'missing_cost_source'
  | 'price_zero'
  | 'missing_image'
  | 'missing_unit'
  | 'missing_vendor_name'
  | 'missing_contents_description';

export interface ChipDescriptor {
  gate_id: GateId;
  category: ChipCategory;
  short_label: string;
  target_field: string;
  before_value: string | number | null;
}

const CHIP_LABEL: Record<GateId, string> = {
  missing_cost_source: 'cost_source missing',
  price_zero: 'price = 0',
  missing_image: 'image missing',
  missing_unit: 'unit missing',
  missing_vendor_name: 'vendor missing',
  missing_contents_description: 'contents missing',
};

const CHIP_CATEGORY: Record<GateId, ChipCategory> = {
  missing_cost_source: 'pricing',
  price_zero: 'pricing',
  missing_image: 'trust',
  missing_unit: 'trust',
  missing_vendor_name: 'trust',
  missing_contents_description: 'trust',
};

const CHIP_TARGET_FIELD: Record<GateId, string> = {
  missing_cost_source: 'cost_source',
  price_zero: 'price',
  missing_image: 'images',
  missing_unit: 'unit',
  missing_vendor_name: 'vendor',
  missing_contents_description: 'contents_note',
};

const BLOCKING_GATE_SET = new Set<string>(Object.keys(CHIP_LABEL));

// ---------------------------------------------------------------------------
// Stale arrival_date detector — informational ONLY (not a chip).
// Per v2.2: T2/T3 commitment IS the publish signal. Arrival_date being
// outside the tier window means the vendor's expected delivery is stale,
// useful as a follow-up signal but NOT a publish blocker.
// ---------------------------------------------------------------------------
function staleArrivalLabel(sku: CatalogV2Row, todayMs: number): string | null {
  if (!sku.arrival_date) return null;
  const arrMs = new Date(sku.arrival_date + 'T00:00:00').getTime();
  if (!Number.isFinite(arrMs)) return null;
  const days = Math.round((arrMs - todayMs) / 86400000);
  const tier = (sku.tier || '').toUpperCase();
  if (tier === 'T2' && (days < 5 || days > 180)) return sku.arrival_date;
  if (tier === 'T3' && (days < 14 || days > 180)) return sku.arrival_date;
  return null;
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
  // + raw row-state derivations.
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

  // 1. Walk the classifier's failed_gates (source of truth Rose validates).
  //    Filter to v2.2 blocking lean set. lead_time and its variants are now
  //    diagnostic-only and never appear as chips.
  for (const fg of sku.failed_gates) {
    if (BLOCKING_GATE_SET.has(fg.gate_id)) {
      const gid = fg.gate_id as GateId;
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
        default:
          before = null;
      }
      pushChip(gid, before);
    }
  }

  // 2. Safety-net derivations off raw row state — fire even when the classifier
  //    hasn't caught up. These mirror the lean v2.2 blocking-gate definitions
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

  // 3. Informational only: stale arrival_date hint (v2.2 — NOT a blocker).
  const staleArrival = staleArrivalLabel(sku, todayMs);

  if (chips.length === 0 && !staleArrival) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.length > 0 && (
        <InlineEditPanel
          sku_id={sku.id}
          sku_name={sku.name}
          sku_vendor={sku.vendor}
          sku_status={sku.publication_status}
          chips={chips}
        />
      )}
      {staleArrival && (
        <span
          className="text-[10px] italic text-slate-400 ml-1"
          title="Informational only — vendor's expected delivery is outside the tier commitment window. T2/T3 publishability is on tier + commitment, not on arrival_date. Vendor follow-up suggested."
        >
          arrival {staleArrival} stale
        </span>
      )}
    </div>
  );
}
