// lib/admin/cost-verify.ts
// v1 | 2026-06-16 | Job_PM (CPO)
//
// THE pre-Facu verification gate for an inventory PROPOSAL (Flow B: admin proposes,
// Rose applies). Runs BEFORE a proposal is shown to Facu. Three lenses, all reading
// ONLY certified reference tables (read-only — this module NEVER writes dim_sku, nor
// any *_mirror table):
//
//   (a) SENSE  — does the variety resolve to a known family (sku_families /
//                market_variety_crosswalk)? are the required fields present?
//   (b) UNITS  — is (box_type, pack/stems) coherent with box_master_mirror?
//                catches capacity_unit_mismatch (box family unknown, or stems > box
//                capacity). box_master_mirror exposes stems_per_box (not
//                selling_unit/stems_per_unit), so we derive coherence from a
//                box_type -> box_family mapping + the stems-per-box ceiling.
//   (c) COST   — a 3-lens COMPARATIVE analysis for a NEW farm cost:
//                  1) peers: same category x box family, farm_cost median/range
//                     over canonical_cost (joined via dim_sku);
//                  2) same variety across other vendors + any history;
//                  3) competitor benchmark: market_variety_crosswalk.benchmark_pps.
//                -> verdict {decente | caro | sospechoso} WITH the numbers.
//
// Cost analysis is Job's lane (pricing-vs-competitor = product_strategy). The verdict
// + numbers are written into the proposal payload.verification so the approval queue
// can render the comparison panel. A strong OUTLIER is never hidden — it reaches Facu
// flagged (verdict 'sospechoso'/'caro' + a warning).
//
// CONFIDENTIALITY: benchmark_pps (competitor data) lives ONLY inside the requireAdmin
// queue payload. This module must never be imported by a /shop or external surface.
//
// HARD BAR: read-only SQL only. Service client (server-side). Any DB read failure is
// surfaced into warnings[] (never swallowed) and degrades the lens to 'sin referencia'
// rather than throwing — missing data does NOT block the proposal.

import type { SupabaseClient } from '@supabase/supabase-js';

export type CostVerdict = 'decente' | 'caro' | 'sospechoso' | 'sin_referencia';
export type LensStatus = 'pass' | 'warn' | 'sin_referencia';

export interface VerifyWarning {
  severity: 'critical' | 'warn' | 'info';
  text: string;
}

// What the verification gate returns; the caller persists this verbatim into
// admin_proposals.payload.verification and copies warnings into the row's warnings[].
export interface VerificationResult {
  ran_at: string;
  // Overall: 'pass' if no lens failed; 'flagged' if the cost lens is an outlier
  // (caro/sospechoso) or a hard field is missing; never blocks — Facu still decides.
  overall: 'pass' | 'flagged';
  sense: SenseLens;
  units: UnitsLens;
  cost: CostLens;
  warnings: VerifyWarning[];
  // When the cost lens has no/weak reference, the caller should log a coverage gap.
  coverage_gap: CoverageGapHint | null;
}

export interface SenseLens {
  status: LensStatus;
  variety: string | null;
  resolved_family: string | null; // sku_families.family_name / variety_canonical match
  crosswalk_match: boolean; // matched in market_variety_crosswalk.our_variety_l
  missing_fields: string[];
  note: string;
}

export interface UnitsLens {
  status: LensStatus;
  box_type: string | null;
  resolved_box_family: string | null;
  stems_per_box: number | null;
  proposed_stems: number | null; // pack
  capacity_unit_mismatch: boolean;
  note: string;
}

export interface CostLens {
  verdict: CostVerdict;
  proposed_cost: number | null;
  // Lens 1: peers (same category x box family)
  peer: { n: number; median: number | null; min: number | null; max: number | null } | null;
  // Lens 2: same variety across vendors + history
  variety_peers: { n: number; median: number | null; min: number | null; max: number | null } | null;
  // Lens 3: competitor benchmark
  benchmark: { competitor: string; benchmark_pps: number; n_rows: number | null; confidence: number | null } | null;
  reasons: string[]; // human-readable explanation of the verdict, WITH numbers
}

export interface CoverageGapHint {
  gate_id: string;
  domain: 'benchmark_coverage';
  variety: string | null;
  // importance x frequency rank (higher = fill first). importance from
  // supply_importance_signal.weight; frequency from peer row counts seen.
  priority: number;
  evidence: Record<string, unknown>;
}

export interface ProposeInput {
  variety: string | null;
  category: string | null; // optional hint; SENSE falls back to family category
  boxType: string | null; // dim_sku.box_type style token (qb/hb/eb/1/8/...)
  pack: number | null; // stems intended in the box (dim_sku.pack)
  farmCost: number | null; // NEW per-stem farm cost being proposed
}

// dim_sku.box_type token -> box_master_mirror.box_family. The mirror stores the
// family uppercase (QB/HB/EB/1/8...); dim_sku stores it lowercase. Confirmed against
// box_master_mirror + dim_sku (2026-06-16): box_family in {1/8, EB, HB, QB, ...}.
function boxTypeToFamily(boxType: string | null): string | null {
  if (!boxType) return null;
  const t = boxType.trim().toUpperCase();
  return t.length > 0 ? t : null;
}

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

function round2(n: number | null): number | null {
  return n == null ? null : Math.round(n * 100) / 100;
}

interface DimCostRow {
  variety_normalized: string | null;
  category: string | null;
  box_type: string | null;
  vendor_canonical_name: string | null;
  farm_cost: number | null;
}

/**
 * Run the 3-lens verification gate. Pure read; any failure degrades the lens to
 * 'sin_referencia' and appends a warning, but never throws/blocks.
 */
export async function verifyProposal(
  svc: SupabaseClient,
  input: ProposeInput,
): Promise<VerificationResult> {
  const ranAt = new Date().toISOString();
  const warnings: VerifyWarning[] = [];
  const variety = input.variety?.trim() ?? null;
  const varietyLc = variety ? variety.toLowerCase() : null;

  // ── (a) SENSE ────────────────────────────────────────────────────────────
  const sense: SenseLens = {
    status: 'sin_referencia',
    variety,
    resolved_family: null,
    crosswalk_match: false,
    missing_fields: [],
    note: '',
  };
  const missing: string[] = [];
  if (!variety) missing.push('variety');
  if (input.boxType == null) missing.push('box_type');
  if (input.farmCost == null) missing.push('farm_cost');
  sense.missing_fields = missing;

  if (varietyLc) {
    // Match against sku_families (variety_canonical / family_name) and the crosswalk.
    const { data: famRows, error: famErr } = await svc
      .from('sku_families')
      .select('family_name, variety_canonical, category')
      .or(`variety_canonical.ilike.%${varietyLc}%,family_name.ilike.%${varietyLc}%`)
      .limit(3);
    if (famErr) {
      warnings.push({ severity: 'warn', text: `SENSE: sku_families read failed (${famErr.message})` });
    } else if (famRows && famRows.length > 0) {
      const f = famRows[0] as { family_name: string | null; variety_canonical: string | null; category: string | null };
      sense.resolved_family = f.variety_canonical ?? f.family_name ?? null;
    }

    const { data: xwalk, error: xwalkErr } = await svc
      .from('market_variety_crosswalk')
      .select('our_variety_l')
      .ilike('our_variety_l', varietyLc)
      .limit(1);
    if (xwalkErr) {
      warnings.push({ severity: 'warn', text: `SENSE: market_variety_crosswalk read failed (${xwalkErr.message})` });
    } else if (xwalk && xwalk.length > 0) {
      sense.crosswalk_match = true;
    }
  }

  if (missing.length > 0) {
    sense.status = 'warn';
    sense.note = `Faltan campos requeridos: ${missing.join(', ')}.`;
    warnings.push({ severity: 'warn', text: `SENSE: campos faltantes: ${missing.join(', ')}` });
  } else if (sense.resolved_family || sense.crosswalk_match) {
    sense.status = 'pass';
    sense.note = sense.resolved_family
      ? `Variedad resuelve a familia "${sense.resolved_family}".`
      : 'Variedad reconocida en el crosswalk de competidores.';
  } else {
    sense.status = 'sin_referencia';
    sense.note = 'Variedad no encontrada en familias ni crosswalk (variedad nueva o sin normalizar).';
    warnings.push({ severity: 'info', text: 'SENSE: variedad sin familia conocida (sin referencia, no bloquea)' });
  }

  // ── (b) UNITS ──────────────────────────────────────────────────────────────
  const units: UnitsLens = {
    status: 'sin_referencia',
    box_type: input.boxType,
    resolved_box_family: boxTypeToFamily(input.boxType),
    stems_per_box: null,
    proposed_stems: input.pack,
    capacity_unit_mismatch: false,
    note: '',
  };
  if (units.resolved_box_family) {
    const { data: boxRows, error: boxErr } = await svc
      .from('box_master_mirror')
      .select('box_family, stems_per_box')
      .eq('box_family', units.resolved_box_family)
      .order('stems_per_box', { ascending: false })
      .limit(1);
    if (boxErr) {
      warnings.push({ severity: 'warn', text: `UNITS: box_master_mirror read failed (${boxErr.message})` });
      units.note = 'No se pudo leer la capacidad de caja (sin referencia).';
    } else if (boxRows && boxRows.length > 0) {
      const b = boxRows[0] as { box_family: string; stems_per_box: number | null };
      units.stems_per_box = b.stems_per_box ?? null;
      // capacity_unit_mismatch: proposed stems exceed the box's physical ceiling.
      if (units.proposed_stems != null && units.stems_per_box != null && units.proposed_stems > units.stems_per_box) {
        units.capacity_unit_mismatch = true;
        units.status = 'warn';
        units.note = `Incoherencia: ${units.proposed_stems} tallos > capacidad de la caja ${b.box_family} (${units.stems_per_box}). Posible mismatch de unidad.`;
        warnings.push({ severity: 'warn', text: units.note });
      } else {
        units.status = 'pass';
        units.note = `Caja ${b.box_family} reconocida (capacidad ${units.stems_per_box ?? '?'} tallos).`;
      }
    } else {
      // Box family token not present in the mirror -> unit/box unknown.
      units.capacity_unit_mismatch = true;
      units.status = 'warn';
      units.note = `Tipo de caja "${input.boxType}" no existe en box_master_mirror. Verificar unidad/caja.`;
      warnings.push({ severity: 'warn', text: units.note });
    }
  } else {
    units.note = 'Sin tipo de caja para validar coherencia de unidad (sin referencia).';
  }

  // ── (c) COST (3 lenses) ─────────────────────────────────────────────────────
  const cost: CostLens = {
    verdict: 'sin_referencia',
    proposed_cost: input.farmCost,
    peer: null,
    variety_peers: null,
    benchmark: null,
    reasons: [],
  };

  // Pull canonical_cost joined to dim_sku once (peers + variety peers both derive
  // from it). canonical_cost has no variety/category/box_type columns — they live
  // on dim_sku via sku_id (confirmed 2026-06-16).
  let dimCostRows: DimCostRow[] = [];
  {
    const { data, error } = await svc
      .from('dim_sku')
      .select('variety_normalized, category, box_type, vendor_canonical_name, canonical_cost!inner(farm_cost)')
      .not('canonical_cost', 'is', null)
      .limit(2000);
    if (error) {
      warnings.push({ severity: 'warn', text: `COST: dim_sku/canonical_cost join read failed (${error.message})` });
    } else {
      dimCostRows = ((data ?? []) as Array<Record<string, unknown>>).map((r) => {
        const cc = r.canonical_cost as { farm_cost: number | null } | { farm_cost: number | null }[] | null;
        const fc = Array.isArray(cc) ? (cc[0]?.farm_cost ?? null) : (cc?.farm_cost ?? null);
        return {
          variety_normalized: (r.variety_normalized as string | null) ?? null,
          category: (r.category as string | null) ?? null,
          box_type: (r.box_type as string | null) ?? null,
          vendor_canonical_name: (r.vendor_canonical_name as string | null) ?? null,
          farm_cost: fc == null ? null : Number(fc),
        };
      });
    }
  }

  const proposed = input.farmCost;
  const boxLc = input.boxType ? input.boxType.trim().toLowerCase() : null;
  const catLc = input.category ? input.category.trim().toLowerCase() : null;

  // Lens 1: peers = same category x same box_type
  const peerCosts = dimCostRows
    .filter((r) => r.farm_cost != null && r.farm_cost > 0)
    .filter((r) => (catLc ? (r.category ?? '').toLowerCase() === catLc : true))
    .filter((r) => (boxLc ? (r.box_type ?? '').toLowerCase() === boxLc : true))
    .map((r) => r.farm_cost as number);
  if (peerCosts.length > 0) {
    cost.peer = {
      n: peerCosts.length,
      median: round2(median(peerCosts)),
      min: round2(Math.min(...peerCosts)),
      max: round2(Math.max(...peerCosts)),
    };
  }

  // Lens 2: same variety across vendors + history
  const varietyCosts = dimCostRows
    .filter((r) => r.farm_cost != null && r.farm_cost > 0)
    .filter((r) => (varietyLc ? (r.variety_normalized ?? '').toLowerCase().includes(varietyLc) : false))
    .map((r) => r.farm_cost as number);
  if (varietyCosts.length > 0) {
    cost.variety_peers = {
      n: varietyCosts.length,
      median: round2(median(varietyCosts)),
      min: round2(Math.min(...varietyCosts)),
      max: round2(Math.max(...varietyCosts)),
    };
  }

  // Lens 3: competitor benchmark (benchmark_pps). CONFIDENTIAL — stays in payload.
  if (varietyLc) {
    const { data: bench, error: benchErr } = await svc
      .from('market_variety_crosswalk')
      .select('competitor, benchmark_pps, n_rows, confidence')
      .ilike('our_variety_l', varietyLc)
      .order('confidence', { ascending: false })
      .limit(1);
    if (benchErr) {
      warnings.push({ severity: 'warn', text: `COST: market_variety_crosswalk read failed (${benchErr.message})` });
    } else if (bench && bench.length > 0) {
      const b = bench[0] as { competitor: string; benchmark_pps: number | null; n_rows: number | null; confidence: number | null };
      if (b.benchmark_pps != null) {
        cost.benchmark = {
          competitor: b.competitor,
          benchmark_pps: Number(b.benchmark_pps),
          n_rows: b.n_rows ?? null,
          confidence: b.confidence == null ? null : Number(b.confidence),
        };
      }
    }
  }

  // Verdict — comparative, WITH numbers. Anchor preference: peer median > variety
  // median > benchmark. 'caro' if meaningfully above the anchor; 'sospechoso' if it
  // is an extreme outlier (>2x) or below half (data-entry suspicion); else 'decente'.
  const anchor =
    cost.peer?.median ?? cost.variety_peers?.median ?? cost.benchmark?.benchmark_pps ?? null;
  if (proposed == null) {
    cost.verdict = 'sin_referencia';
    cost.reasons.push('No se propuso costo — no hay nada que comparar.');
  } else if (anchor == null) {
    cost.verdict = 'sin_referencia';
    cost.reasons.push('Sin referencia de pares ni competidor para esta variedad/categoria (no bloquea).');
  } else {
    const ratio = proposed / anchor;
    const anchorLabel = cost.peer?.median != null
      ? `mediana de pares (${cost.peer.n} SKU, cat x caja) $${cost.peer.median}`
      : cost.variety_peers?.median != null
        ? `mediana de la variedad en otros vendors (${cost.variety_peers.n} SKU) $${cost.variety_peers.median}`
        : `benchmark competidor (${cost.benchmark?.competitor}) $${cost.benchmark?.benchmark_pps}`;
    cost.reasons.push(`Costo propuesto $${round2(proposed)} vs ${anchorLabel} -> ${Math.round(ratio * 100)}% del ancla.`);
    if (ratio > 2 || ratio < 0.5) {
      cost.verdict = 'sospechoso';
      cost.reasons.push(`Outlier extremo (${ratio < 0.5 ? 'menos de la mitad' : 'mas del doble'} del ancla) — posible error de carga.`);
    } else if (ratio > 1.2) {
      cost.verdict = 'caro';
      cost.reasons.push(`${Math.round((ratio - 1) * 100)}% por encima del ancla.`);
    } else {
      cost.verdict = 'decente';
      cost.reasons.push('Dentro del rango razonable de las referencias.');
    }
    // Add the competitor lens line explicitly (always, when present).
    if (cost.benchmark) {
      const margin = proposed / cost.benchmark.benchmark_pps;
      cost.reasons.push(`Competidor ${cost.benchmark.competitor}: PPS $${round2(cost.benchmark.benchmark_pps)} (n=${cost.benchmark.n_rows ?? '?'}); costo es ${Math.round(margin * 100)}% del PPS competidor.`);
    }
  }

  if (cost.verdict === 'sospechoso') {
    warnings.push({ severity: 'critical', text: `COST: ${cost.reasons[cost.reasons.length - 1]}` });
  } else if (cost.verdict === 'caro') {
    warnings.push({ severity: 'warn', text: `COST: ${cost.reasons[cost.reasons.length - 1]}` });
  }

  // ── Coverage gap hint (no/weak competitor or peer reference) ─────────────────
  // Weak = no benchmark AND no peer median. Rank by importance (supply_importance_
  // signal.weight) x frequency (peer rows seen, +1 to avoid zero).
  let coverageGap: CoverageGapHint | null = null;
  const weakReference = cost.benchmark == null && cost.peer == null;
  if (weakReference && variety) {
    let importance = 0;
    const { data: impRows, error: impErr } = await svc
      .from('supply_importance_signal')
      .select('weight')
      .ilike('variety_l', varietyLc ?? '')
      .limit(1);
    if (impErr) {
      warnings.push({ severity: 'warn', text: `COVERAGE: supply_importance_signal read failed (${impErr.message})` });
    } else if (impRows && impRows.length > 0) {
      importance = Number((impRows[0] as { weight: number | null }).weight ?? 0);
    }
    const frequency = (cost.variety_peers?.n ?? 0) + 1;
    coverageGap = {
      gate_id: 'cost_benchmark_missing',
      domain: 'benchmark_coverage',
      variety,
      priority: Math.round(importance * frequency),
      evidence: {
        reason: 'sin referencia de competidor ni pares para validar el costo',
        variety,
        category: input.category,
        box_type: input.boxType,
        importance_weight: importance,
        frequency,
        decided_by: null,
      },
    };
    warnings.push({ severity: 'info', text: `COVERAGE: gap de benchmark registrado para "${variety}" (prioridad ${coverageGap.priority})` });
  }

  const overall: 'pass' | 'flagged' =
    sense.status === 'warn' ||
    units.capacity_unit_mismatch ||
    cost.verdict === 'caro' ||
    cost.verdict === 'sospechoso'
      ? 'flagged'
      : 'pass';

  return { ran_at: ranAt, overall, sense, units, cost, warnings, coverage_gap: coverageGap };
}
