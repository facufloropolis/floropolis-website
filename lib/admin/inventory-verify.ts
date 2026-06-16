// lib/admin/inventory-verify.ts
// v1 | 2026-06-16 | Job_PM (CPO)
//
// SENSE + UNITS gate for a Flow-B inventory proposal. Runs BEFORE Facu sees the
// proposal. Read-only; ZERO writes. Returns PASS/FAIL with explicit reasons.
//
//   SENSE — the variety resolves to a known family AND required identity fields are
//           present. sku_families table is NOT confirmed present, so resolution is
//           via the two VERIFIED resolvers: market_variety_crosswalk.our_variety_l
//           and dim_sku.variety_normalized. If neither matches, that is an UNRESOLVED
//           warning (not a fake pass) — the proposal can still go to Facu, but the
//           SENSE lens reports the variety as unresolved.
//
//   UNITS — claimed capacity (pack × stems_per_unit) vs box_master_mirror.stems_per_box
//           for the matched legacy_box_type/box_family. A box_type can carry multiple
//           stems_per_box rows (e.g. QB = 125 and 200); we compare against the MAX
//           capacity to avoid a false mismatch. claimed > max capacity -> FAIL with
//           'capacity_unit_mismatch'.
//
// DB errors are pushed to warnings[] and never swallowed; a lens with a DB error does
// NOT silently pass (it reports the error and is treated as not-verified).
//
// HARD BAR: read-only over market_variety_crosswalk, dim_sku, box_master_mirror.
// ZERO writes to dim_sku / *_mirror / any table. SERVER-ONLY.

import type { SupabaseClient } from '@supabase/supabase-js';

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

export interface InventoryProposal {
  variety?: unknown;
  selling_unit?: unknown;
  sellingUnit?: unknown;
  box_type?: unknown;
  boxType?: unknown;
  box_family?: unknown;
  boxFamily?: unknown;
  pack?: unknown;
  stems_per_unit?: unknown;
  stemsPerUnit?: unknown;
}

export interface LensResult {
  pass: boolean;
  reasons: string[];
}

export interface InventoryVerifyResult {
  pass: boolean;
  sense: LensResult;
  units: LensResult;
  warnings: string[];
}

/**
 * Read-only SENSE + UNITS verification. PASS = both lenses pass. DB errors surface in
 * warnings[] and fail-soft the affected lens (never a silent pass).
 */
export async function verifyInventoryProposal(
  svc: SupabaseClient,
  proposal: InventoryProposal,
): Promise<InventoryVerifyResult> {
  const warnings: string[] = [];

  const variety = str(proposal.variety);
  const sellingUnit = str(proposal.selling_unit) ?? str(proposal.sellingUnit);
  const boxType = str(proposal.box_type) ?? str(proposal.boxType);
  const boxFamily = str(proposal.box_family) ?? str(proposal.boxFamily);
  const pack = num(proposal.pack);
  const stemsPerUnit = num(proposal.stems_per_unit) ?? num(proposal.stemsPerUnit);

  // ── SENSE ─────────────────────────────────────────────────────────────────────
  const senseReasons: string[] = [];

  // Required identity fields.
  if (!variety) senseReasons.push('missing_field:variety');
  if (!sellingUnit) senseReasons.push('missing_field:selling_unit');
  if (!boxType && !boxFamily) senseReasons.push('missing_field:box_type/box_family');

  // Variety resolution via the two confirmed resolvers (sku_families NOT confirmed).
  let varietyResolved = false;
  if (variety) {
    const [cw, ds] = await Promise.all([
      svc
        .from('market_variety_crosswalk')
        .select('our_variety_l')
        .ilike('our_variety_l', variety)
        .limit(1),
      svc
        .from('dim_sku')
        .select('variety_normalized')
        .ilike('variety_normalized', variety)
        .limit(1),
    ]);
    if (cw.error) warnings.push(`sense_crosswalk_db_error:${cw.error.message}`);
    if (ds.error) warnings.push(`sense_dim_sku_db_error:${ds.error.message}`);
    const cwHit = !cw.error && Array.isArray(cw.data) && cw.data.length > 0;
    const dsHit = !ds.error && Array.isArray(ds.data) && ds.data.length > 0;
    varietyResolved = cwHit || dsHit;
    if (!varietyResolved && !cw.error && !ds.error) {
      // Neither resolver matched and no DB error — honest unresolved, not a fake pass.
      senseReasons.push('variety_unresolved:no_family_match');
      warnings.push(`variety_unresolved:${variety} (no crosswalk / dim_sku match; sku_families not confirmed)`);
    }
    if (cw.error || ds.error) {
      // Could not verify resolution → do not assert resolved.
      senseReasons.push('variety_resolution_unverified:db_error');
    }
  }

  const sensePass = senseReasons.length === 0 && varietyResolved;
  const sense: LensResult = { pass: sensePass, reasons: senseReasons };

  // ── UNITS ───────────────────────────────────────────────────────────────────
  const unitsReasons: string[] = [];
  const claimedCapacity =
    pack != null && stemsPerUnit != null ? pack * stemsPerUnit : null;

  let unitsPass = true;
  if (claimedCapacity == null) {
    unitsReasons.push('units_unverified:missing_pack_or_stems_per_unit');
    unitsPass = false;
  } else if (!boxType && !boxFamily) {
    unitsReasons.push('units_unverified:missing_box_type_and_family');
    unitsPass = false;
  } else {
    // Match by legacy_box_type OR box_family. A box_type can have multiple
    // stems_per_box rows — compare against the MAX capacity (no false mismatch).
    let q = svc
      .from('box_master_mirror')
      .select('legacy_box_type, box_family, stems_per_box')
      .eq('active', true)
      .not('stems_per_box', 'is', null);
    if (boxType && boxFamily) {
      q = q.or(`legacy_box_type.eq.${boxType},box_family.eq.${boxFamily}`);
    } else if (boxType) {
      q = q.eq('legacy_box_type', boxType);
    } else if (boxFamily) {
      q = q.eq('box_family', boxFamily);
    }
    const { data, error } = await q.limit(200);
    if (error) {
      warnings.push(`units_box_master_db_error:${error.message}`);
      unitsReasons.push('units_unverified:db_error');
      unitsPass = false;
    } else if (!Array.isArray(data) || data.length === 0) {
      unitsReasons.push(`units_unverified:no_box_master_row_for:${boxType ?? boxFamily}`);
      warnings.push(`box_master_no_match:${boxType ?? boxFamily}`);
      unitsPass = false;
    } else {
      const capacities = data
        .map((r) => num((r as { stems_per_box?: unknown }).stems_per_box))
        .filter((n): n is number => n != null && n > 0);
      const maxCap = capacities.length ? Math.max(...capacities) : null;
      if (maxCap == null) {
        unitsReasons.push('units_unverified:no_capacity_value');
        unitsPass = false;
      } else if (claimedCapacity > maxCap) {
        unitsReasons.push(
          `capacity_unit_mismatch:claimed=${claimedCapacity}>box_cap=${maxCap}(${boxType ?? boxFamily})`,
        );
        unitsPass = false;
      }
    }
  }

  const units: LensResult = { pass: unitsPass, reasons: unitsReasons };

  return {
    pass: sense.pass && units.pass,
    sense,
    units,
    warnings,
  };
}
