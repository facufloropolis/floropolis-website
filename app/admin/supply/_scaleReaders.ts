// Scale-axis readers for the Supply Engine backend.
// v1 | 2026-06-10 | Job_PM (CPO)
//
// HARD BAR (Facu): solve at SCALE, never SKU-by-SKU. The engine
// (v_supply_recommendations) is SKU-level: it fires ONE gap_type per SKU on a
// priority cascade, so the SAME structural fix repeats across dozens of SKUs as
// dozens of identical rows. These readers collapse those repeats into ONE batch
// rec per the RIGHT scale axis, so the UI can offer "one action -> N varieties":
//
//   - FULFILLMENT  -> vendor x box_type, driven by the ACTUAL failing_gates token
//     each gapped SKU carries (verified on live data: the fulfillment lever is
//     NOT box dims — every fulfillment SKU is Megaflor x EB whose box already has
//     FedEx dims, and the real gate is missing_units_or_bunch, i.e. dim_sku has a
//     selling_unit but no stems_per_unit). So we read failing_gates per SKU,
//     bucket the group by its dominant fulfillment token (missing_units_or_bunch
//     / missing_box_dims / missing_unit / missing_vendor_name), and offer the
//     matching apply (set units per vendor x box). We never probe box dims to
//     decide the action — the gate token is the source of truth.
//   - CONTENT -> category x box_type. The contents note is a property of the
//     category-in-a-box (e.g. "Rose in QB ~N stems"), not of one variety. One
//     authored note covers the whole category x box.
//
// All readers: REAL data only (no fabrication), NULL-safe, never throw. BACKUP
// via getBackupServiceClient. dim_sku.box_type is lowercased ('eb'); box_master
// uses 'EB' / variant codes -> we match case-insensitively on box_family.

import { getBackupServiceClient } from '@/lib/supabase/backup-server';

// ---------------------------------------------------------------------------
// Shared row shapes (only the columns we read)
// ---------------------------------------------------------------------------

interface RecLite {
  sku_id: string;
  gap_type: string | null;
  variety: string | null;
  vendor: string | null;
  priority_score: number | string | null;
}

interface SkuLite {
  sku_id: string;
  vendor_canonical_name: string | null;
  variety_normalized: string | null;
  box_type: string | null;
  category: string | null;
  selling_unit?: string | null;
  stems_per_unit: number | null;
  quarantined: boolean | null;
}

function toNumOrNull(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function maxPrio(a: number, b: number | string | null | undefined): number {
  const n = toNumOrNull(b) ?? 0;
  return n > a ? n : a;
}

// box_type / box_family canonical key for joining the two tables.
function boxKey(v: string | null | undefined): string {
  return (v ?? '').trim().toLowerCase();
}

// ---------------------------------------------------------------------------
// FULFILLMENT batch recs — scale axis: vendor x box_type
// ---------------------------------------------------------------------------

// The fulfillment sub-gates the view buckets into this lever (view CASE order:
// missing_box_dims | missing_units_or_bunch | missing_unit | missing_vendor_name).
export type FulfillmentGate =
  | 'missing_units_or_bunch'
  | 'missing_box_dims'
  | 'missing_unit'
  | 'missing_vendor_name'
  | 'unknown';

const FULFILLMENT_GATES: FulfillmentGate[] = [
  'missing_box_dims',
  'missing_units_or_bunch',
  'missing_unit',
  'missing_vendor_name',
];

export interface FulfillmentBatchRec {
  vendor: string;
  boxType: string; // dim_sku.box_type (lowercased, e.g. 'eb')
  skuCount: number;
  varieties: number;
  priorityScore: number; // max across the group
  // The ACTUAL failing gate driving this group (from failing_gates, not a probe).
  gate: FulfillmentGate;
  // For the units gate: do all gap SKUs sell by stem (-> stems_per_unit=1 is a
  // one-click factual fill) or do some need a real value the human must supply?
  allStemSold: boolean;
  needsValueCount: number; // SKUs in the group whose units value is NOT derivable
  applyKind: 'units' | 'box_dims' | 'manual'; // which executor/path the UI offers
  action: string; // honest, scale-framed Spanish action
}

// Pick the dominant fulfillment gate present across a group's failing_gates.
function dominantFulfillmentGate(tokenCounts: Map<string, number>): FulfillmentGate {
  for (const g of FULFILLMENT_GATES) {
    if ((tokenCounts.get(g) ?? 0) > 0) return g;
  }
  return 'unknown';
}

/**
 * Collapse the engine's `fulfillment` lever into ONE batch rec per vendor x
 * box_type, driven by the REAL failing_gates token each SKU carries (NOT a
 * box-dims probe). On live data the gate is missing_units_or_bunch, so the
 * worked solution is "set units per vendor x box" (one-click factual fill of
 * stems_per_unit=1 for stem-sold SKUs). Never throws; returns [] on any failure.
 */
export async function getFulfillmentBatchRecs(): Promise<FulfillmentBatchRec[]> {
  try {
    const svc = getBackupServiceClient();

    const { data: recRaw, error: recErr } = await svc
      .from('v_supply_recommendations')
      .select('sku_id, gap_type, variety, vendor, failing_gates, priority_score')
      .eq('gap_type', 'fulfillment')
      .limit(5000);
    if (recErr || !recRaw || recRaw.length === 0) return [];
    interface FRec extends RecLite {
      failing_gates: unknown;
    }
    const recs = recRaw as unknown as FRec[];
    const skuIds = recs.map((r) => r.sku_id);

    // dim_sku gives the structural axis (vendor x box_type) + selling_unit so we
    // can say whether the units fill is one-click (stem) or needs a real value.
    const { data: skuRaw, error: skuErr } = await svc
      .from('dim_sku')
      .select('sku_id, vendor_canonical_name, variety_normalized, box_type, category, selling_unit, stems_per_unit, quarantined')
      .in('sku_id', skuIds);
    if (skuErr) return [];
    const skuById = new Map<string, SkuLite>();
    for (const s of (skuRaw ?? []) as SkuLite[]) skuById.set(s.sku_id, s);

    interface Acc {
      vendor: string;
      boxType: string;
      skuCount: number;
      varietySet: Set<string>;
      priorityScore: number;
      tokenCounts: Map<string, number>;
      stemSold: number;
      nonStem: number;
    }
    const acc = new Map<string, Acc>();
    for (const r of recs) {
      const s = skuById.get(r.sku_id);
      const vendor = (s?.vendor_canonical_name ?? r.vendor ?? '').trim() || '--';
      const boxType = boxKey(s?.box_type);
      if (!boxType) continue; // honesty: no axis -> can't batch this row by box
      const key = `${vendor.toLowerCase()}|${boxType}`;
      const variety = (s?.variety_normalized ?? r.variety ?? '').trim().toLowerCase();
      const sellingUnit = (s?.selling_unit ?? '').trim().toLowerCase();
      const isStem = sellingUnit === 'stem';
      const gates = Array.isArray(r.failing_gates)
        ? (r.failing_gates as unknown[]).filter((g): g is string => typeof g === 'string')
        : [];
      let cur = acc.get(key);
      if (!cur) {
        cur = {
          vendor,
          boxType,
          skuCount: 0,
          varietySet: new Set<string>(),
          priorityScore: 0,
          tokenCounts: new Map<string, number>(),
          stemSold: 0,
          nonStem: 0,
        };
        acc.set(key, cur);
      }
      cur.skuCount += 1;
      if (variety) cur.varietySet.add(variety);
      cur.priorityScore = maxPrio(cur.priorityScore, r.priority_score);
      for (const g of gates) {
        if ((FULFILLMENT_GATES as string[]).includes(g)) {
          cur.tokenCounts.set(g, (cur.tokenCounts.get(g) ?? 0) + 1);
        }
      }
      if (isStem) cur.stemSold += 1;
      else cur.nonStem += 1;
    }

    const out: FulfillmentBatchRec[] = [];
    for (const a of acc.values()) {
      const nVar = a.varietySet.size;
      const boxLabel = a.boxType.toUpperCase();
      const gate = dominantFulfillmentGate(a.tokenCounts);
      const vesuffix = `${nVar} variedad${nVar === 1 ? '' : 'es'} (${a.skuCount} SKU)`;

      let applyKind: FulfillmentBatchRec['applyKind'] = 'manual';
      let action: string;
      let needsValueCount = 0;
      const allStemSold = a.nonStem === 0;

      if (gate === 'missing_units_or_bunch' || gate === 'missing_unit') {
        applyKind = 'units';
        needsValueCount = a.nonStem; // non-stem SKUs need a real value (no fabrication)
        action = allStemSold
          ? `Cargar units de ${a.vendor} ${boxLabel}: venta por stem -> stems_per_unit=1 (factual, un click) -> desbloquea ${vesuffix}`
          : `Cargar units de ${a.vendor} ${boxLabel} -> desbloquea ${vesuffix}` +
            ` (${a.stemSold} por stem cargan 1 click; ${a.nonStem} no-stem necesitan valor real)`;
      } else if (gate === 'missing_box_dims') {
        applyKind = 'box_dims';
        action = `Cargar dims FedEx de ${a.vendor} ${boxLabel} en box_master -> desbloquea ${vesuffix}`;
      } else if (gate === 'missing_vendor_name') {
        applyKind = 'manual';
        action = `Cargar vendor_name canonico de estas ${vesuffix} (gap: missing_vendor_name)`;
      } else {
        applyKind = 'manual';
        action = `Fulfillment de ${a.vendor} ${boxLabel}: gap sin token reconocido -> revisar ${vesuffix}`;
      }

      out.push({
        vendor: a.vendor,
        boxType: a.boxType,
        skuCount: a.skuCount,
        varieties: nVar,
        priorityScore: a.priorityScore,
        gate,
        allStemSold,
        needsValueCount,
        applyKind,
        action,
      });
    }

    out.sort((x, y) => y.priorityScore - x.priorityScore);
    return out;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// CONTENT batch recs — scale axis: category x box_type
// ---------------------------------------------------------------------------

export interface ContentBatchRec {
  category: string;
  boxType: string;
  skuCount: number;
  varieties: number;
  priorityScore: number;
  missingStems: number; // SKUs in the group with no stems_per_unit
  action: string;
  // A representative variety in the group, so the UI can fetch the sibling
  // content inference (inferContentForVariety) for the whole category x box.
  sampleVariety: string | null;
}

/**
 * Collapse the engine's `content` lever into ONE batch rec per category x
 * box_type. The contents note is a property of the category-in-a-box, so one
 * authored note covers the whole group. Never throws; [] on failure.
 */
export async function getContentBatchRecs(): Promise<ContentBatchRec[]> {
  try {
    const svc = getBackupServiceClient();

    const { data: recRaw, error: recErr } = await svc
      .from('v_supply_recommendations')
      .select('sku_id, gap_type, variety, vendor, priority_score')
      .eq('gap_type', 'content')
      .limit(5000);
    if (recErr || !recRaw || recRaw.length === 0) return [];
    const recs = recRaw as unknown as RecLite[];
    const skuIds = recs.map((r) => r.sku_id);

    const { data: skuRaw, error: skuErr } = await svc
      .from('dim_sku')
      .select('sku_id, vendor_canonical_name, variety_normalized, box_type, category, stems_per_unit, quarantined')
      .in('sku_id', skuIds);
    if (skuErr) return [];
    const skuById = new Map<string, SkuLite>();
    for (const s of (skuRaw ?? []) as SkuLite[]) skuById.set(s.sku_id, s);

    interface Acc {
      category: string;
      boxType: string;
      skuCount: number;
      varietySet: Set<string>;
      priorityScore: number;
      missingStems: number;
      sampleVariety: string | null;
    }
    const acc = new Map<string, Acc>();
    for (const r of recs) {
      const s = skuById.get(r.sku_id);
      const category = (s?.category ?? '').trim() || 'sin categoria';
      const boxType = boxKey(s?.box_type) || 'sin box';
      const key = `${category.toLowerCase()}|${boxType}`;
      const variety = (s?.variety_normalized ?? r.variety ?? '').trim().toLowerCase();
      const noStems = s?.stems_per_unit == null;
      const cur = acc.get(key);
      if (!cur) {
        acc.set(key, {
          category,
          boxType,
          skuCount: 1,
          varietySet: new Set(variety ? [variety] : []),
          priorityScore: toNumOrNull(r.priority_score) ?? 0,
          missingStems: noStems ? 1 : 0,
          sampleVariety: variety || null,
        });
      } else {
        cur.skuCount += 1;
        if (variety) cur.varietySet.add(variety);
        cur.priorityScore = maxPrio(cur.priorityScore, r.priority_score);
        if (noStems) cur.missingStems += 1;
        if (!cur.sampleVariety && variety) cur.sampleVariety = variety;
      }
    }

    const out: ContentBatchRec[] = Array.from(acc.values()).map((a) => {
      const nVar = a.varietySet.size;
      const boxLabel = a.boxType.toUpperCase();
      return {
        category: a.category,
        boxType: a.boxType,
        skuCount: a.skuCount,
        varieties: nVar,
        priorityScore: a.priorityScore,
        missingStems: a.missingStems,
        sampleVariety: a.sampleVariety,
        action: `Escribir contents_note de ${a.category} en ${boxLabel} una vez -> cubre ${nVar} variedad${nVar === 1 ? '' : 'es'} (${a.skuCount} SKU)`,
      };
    });
    out.sort((x, y) => y.priorityScore - x.priorityScore);
    return out;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// CONTENT INFERENCE — infer stems-per-unit from category SIBLINGS in similar boxes
// ---------------------------------------------------------------------------

export interface ContentInference {
  variety: string;
  category: string | null;
  boxType: string | null;
  inferredStems: number | null; // null => no sibling reference (NEVER fabricated)
  method: 'sibling_mode' | 'sibling_avg' | 'none';
  siblingCount: number; // how many siblings carried a real stems value
  examples: { variety: string; stems: number }[]; // the comparatives we used
  note: string; // ASCII-clean Spanish explanation
}

/**
 * For a variety whose box content (stems_per_unit) is unknown, infer it from
 * category SIBLINGS in the SAME box_type that DO carry a real stems value.
 * Returns the inferred count + the comparative examples used. Honest: when no
 * sibling carries a value (the common case for Rose x QB here), inferredStems
 * is null and method='none' — we NEVER invent a number.
 *
 * Scale note: the inference is keyed on category x box_type, so the same answer
 * applies to every sibling variety in that group (use with getContentBatchRecs).
 */
export async function inferContentForVariety(
  variety: string,
): Promise<ContentInference> {
  const vIn = (variety ?? '').trim();
  const empty: ContentInference = {
    variety: vIn,
    category: null,
    boxType: null,
    inferredStems: null,
    method: 'none',
    siblingCount: 0,
    examples: [],
    note: 'sin variedad valida',
  };
  if (!vIn) return empty;

  try {
    const svc = getBackupServiceClient();
    const vNorm = vIn.toLowerCase();

    // Find the target's category x box_type (any non-quarantined SKU of it).
    const { data: tgtRaw } = await svc
      .from('dim_sku')
      .select('variety_normalized, box_type, category, stems_per_unit, quarantined')
      .ilike('variety_normalized', vNorm)
      .limit(50);
    const tgt = ((tgtRaw ?? []) as SkuLite[]).find((s) => s.quarantined !== true);
    if (!tgt || !tgt.category) {
      return { ...empty, note: `Sin categoria conocida para "${vIn}" -> no se puede inferir por hermanos` };
    }
    const category = tgt.category.trim();
    const boxType = boxKey(tgt.box_type);

    // Pull category siblings in the SAME box_type that carry a real stems value.
    const { data: sibRaw } = await svc
      .from('dim_sku')
      .select('variety_normalized, box_type, category, stems_per_unit, quarantined')
      .ilike('category', category)
      .limit(5000);
    const siblings = ((sibRaw ?? []) as SkuLite[]).filter((s) => {
      if (s.quarantined === true) return false;
      if (boxKey(s.box_type) !== boxType) return false;
      const v = (s.variety_normalized ?? '').trim().toLowerCase();
      if (v === vNorm) return false; // exclude the target itself
      return s.stems_per_unit != null && Number.isFinite(s.stems_per_unit) && s.stems_per_unit > 0;
    });

    if (siblings.length === 0) {
      return {
        variety: vIn,
        category,
        boxType: boxType || null,
        inferredStems: null,
        method: 'none',
        siblingCount: 0,
        examples: [],
        note: `${category} en ${(boxType || '?').toUpperCase()}: ningun hermano tiene stems cargado -> sin referencia (pendiente, no se inventa)`,
      };
    }

    // mode (most common) first; fall back to rounded average.
    const freq = new Map<number, number>();
    let sum = 0;
    const exMap = new Map<number, string>(); // stems -> one example variety
    for (const s of siblings) {
      const n = s.stems_per_unit as number;
      freq.set(n, (freq.get(n) ?? 0) + 1);
      sum += n;
      const ev = (s.variety_normalized ?? '').trim();
      if (ev && !exMap.has(n)) exMap.set(n, ev);
    }
    let modeStems: number | null = null;
    let modeCount = 0;
    for (const [n, c] of freq.entries()) {
      if (c > modeCount) {
        modeCount = c;
        modeStems = n;
      }
    }
    const uniform = freq.size === 1;
    const method: ContentInference['method'] =
      uniform || modeCount > 1 ? 'sibling_mode' : 'sibling_avg';
    const inferredStems =
      method === 'sibling_mode' ? modeStems : Math.round(sum / siblings.length);

    // Up to 3 distinct comparative examples.
    const examples: { variety: string; stems: number }[] = [];
    for (const [n, ev] of exMap.entries()) {
      examples.push({ variety: ev, stems: n });
      if (examples.length >= 3) break;
    }

    const exStr = examples.map((e) => `${e.variety} (${e.stems})`).join(', ');
    const note = `${category} en ${(boxType || '?').toUpperCase()} historicamente ~${inferredStems} stems (${method === 'sibling_mode' ? 'moda' : 'promedio'} de ${siblings.length} hermano${siblings.length === 1 ? '' : 's'}); ej: ${exStr}`;

    return {
      variety: vIn,
      category,
      boxType: boxType || null,
      inferredStems,
      method,
      siblingCount: siblings.length,
      examples,
      note,
    };
  } catch {
    return empty;
  }
}
