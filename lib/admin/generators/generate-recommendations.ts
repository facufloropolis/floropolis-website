// Recommendation generator for admin_proposals.
// v1 | 2026-05-26 | Job_PM [V8 SHADOW]
//
// Reads floropolis_inventory_mirror + pricing_constants + box_master and
// creates admin_proposals for three recommendation families:
//
//   price.formula_reset
//     SKUs whose current price deviates >5% from the formula-computed price.
//     Executor writes the formula price directly to floropolis_inventory_mirror.
//     Payload includes formula_price so the executor runs immediately on approve.
//
//   price_alert.batch_clear (single-SKU)
//     SKUs with has_open_price_alert = true. Approve clears the flag in mirror.
//     Payload uses sku_ids: [id] — compatible with the existing batch executor.
//
//   contents_description.facu_correction
//     Live SKUs with no contents_note. Audit-only — logs the gap; Rose routes fix.
//
// Idempotent: skips creation if an awaiting_facu proposal of the same type +
// target already exists. Returns counts of created/skipped per family.
//
// Formula replication from lib/catalog-classifier.ts:
//   USA vendors:      cost / (1 - gpm)
//   International:    cost / (1 - gpm) + ceil(weightKg) * fedex * fuel / stemsPerBox
//   deviation_pct:    abs((price - expected) / expected) * 100

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ACTIVE_PRICING_MARKET,
  requireNumericPricingConstant,
  type PricingConstantValueRow,
} from '@/lib/pricing-constants';
import {
  boxKey,
  resolveLegacyBoxIdentity,
  type BoxMasterRow as CanonicalBoxMasterRow,
} from '@/lib/box-master';

export interface GeneratorStats {
  formula_reset: { created: number; skipped: number; errors: number };
  open_alert: { created: number; skipped: number; errors: number };
  missing_description: { created: number; skipped: number; errors: number };
}

const FORMULA_DEVIATION_THRESHOLD_PCT = 5;
const BOX_DIM_KG_FALLBACK: Record<string, number> = {
  'FB': 26, 'HB': 13, 'QB': 6.5, 'EB': 3.25,
  'FULL BOX': 26, 'HALF BOX': 13, 'QUARTER BOX': 6.5,
};

function resolveBoxWeight(
  vendorRaw: string | null | undefined,
  boxTypeRaw: string | null | undefined,
  boxMaster: Record<string, number>,
): number | null {
  if (!vendorRaw || !boxTypeRaw) return null;
  const identity = resolveLegacyBoxIdentity(vendorRaw, boxTypeRaw);
  const key = boxKey({
    vendor_canonical_name: identity.vendor,
    box_family: identity.boxFamily,
    variant_code: identity.variant,
  });
  const bt = boxTypeRaw.toUpperCase().trim();
  const lookup = (k: string): number | undefined => boxMaster[k] ?? BOX_DIM_KG_FALLBACK[k];
  const direct = boxMaster[key] ?? lookup(bt);
  if (direct != null) return direct;
  if (bt.includes('/')) {
    const parts = bt.split('/').map((c) => c.trim()).filter(Boolean);
    const weights = parts.map(lookup).filter((w): w is number => w != null);
    if (weights.length > 0) return Math.min(...weights);
  }
  return null;
}

function computeExpectedPrice(
  farmCost: number,
  vendor: string,
  boxType: string | null,
  unitsPerBox: number,
  totalStems: number,
  gpm: number,
  fedex: number,
  fuel: number,
  boxMaster: Record<string, number>,
): number | null {
  if (farmCost <= 0) return null;
  if (vendor.toLowerCase().includes('usa')) {
    return Math.round((farmCost / (1 - gpm)) * 10000) / 10000;
  }
  const stemsPerBox = unitsPerBox || totalStems;
  if (stemsPerBox <= 0) return null;
  const dimKg = resolveBoxWeight(vendor, boxType, boxMaster);
  if (dimKg == null) return null;
  const deliveryPerBox = Math.ceil(dimKg) * fedex * fuel;
  const deliveryPerStem = deliveryPerBox / stemsPerBox;
  const priceExDelivery = farmCost / (1 - gpm);
  return Math.round((priceExDelivery + deliveryPerStem) * 10000) / 10000;
}

interface MirrorRow {
  id: number;
  name: string | null;
  vendor: string | null;
  tier: string | null;
  variety: string | null;
  price: string | number | null;
  farm_cost: string | number | null;
  cost_source: string | null;
  box_type: string | null;
  units_per_box: string | number | null;
  total_stems: string | number | null;
  has_open_price_alert: boolean | null;
  contents_note: string | null;
  live: boolean | null;
}

export async function generateRecommendationProposals(
  service: SupabaseClient,
): Promise<GeneratorStats> {
  const stats: GeneratorStats = {
    formula_reset: { created: 0, skipped: 0, errors: 0 },
    open_alert: { created: 0, skipped: 0, errors: 0 },
    missing_description: { created: 0, skipped: 0, errors: 0 },
  };

  // -------------------------------------------------------------------------
  // 1. Load shared reference data
  // -------------------------------------------------------------------------
  const [pcResult, bmResult] = await Promise.all([
    service
      .from('pricing_constants')
      .select('id, market, value_numeric')
      .eq('market', ACTIVE_PRICING_MARKET),
    service
      .from('box_master_mirror')
      .select('box_id, vendor_canonical_name, box_family, variant_code, fedex_chargeable_kg'),
  ]);

  const pcRows = (pcResult.data ?? []) as PricingConstantValueRow[];
  const gpm = requireNumericPricingConstant(pcRows, 'gpm_target');
  const fedex = requireNumericPricingConstant(pcRows, 'fedex_rate_per_kg');
  const fuel = requireNumericPricingConstant(pcRows, 'fuel_surcharge_mult');

  const bmRows = (bmResult.data ?? []) as CanonicalBoxMasterRow[];
  const boxMaster: Record<string, number> = {};
  for (const r of bmRows) {
    const weight = Number(r.fedex_chargeable_kg);
    if (Number.isFinite(weight)) {
      boxMaster[boxKey(r)] = weight;
    }
  }

  // -------------------------------------------------------------------------
  // 2. Load live SKUs (all three generators share this fetch)
  // -------------------------------------------------------------------------
  const { data: mirrorData, error: mirrorErr } = await service
    .from('floropolis_inventory_mirror')
    .select(
      'id, name, vendor, tier, variety, price, farm_cost, cost_source, box_type, units_per_box, total_stems, has_open_price_alert, contents_note, live',
    )
    .eq('live', true);

  if (mirrorErr || !mirrorData) {
    const msg = mirrorErr?.message ?? 'unknown';
    stats.formula_reset.errors++;
    stats.open_alert.errors++;
    stats.missing_description.errors++;
    console.error('[generate-recommendations] mirror fetch failed:', msg);
    return stats;
  }
  const mirror = mirrorData as MirrorRow[];

  // -------------------------------------------------------------------------
  // 3. Load existing pending proposals (for dedup)
  // -------------------------------------------------------------------------
  const { data: pendingRaw } = await service
    .from('admin_proposals')
    .select('type, target_id')
    .eq('status', 'awaiting_facu')
    .in('type', ['price.formula_reset', 'price_alert.batch_clear', 'contents_description.facu_correction']);

  const pendingSet = new Set<string>();
  for (const p of (pendingRaw ?? []) as Array<{ type: string; target_id: string | null }>) {
    pendingSet.add(`${p.type}::${p.target_id ?? ''}`);
  }

  // -------------------------------------------------------------------------
  // 4. Formula deviation → price.formula_reset
  // -------------------------------------------------------------------------
  const formulaProposals: object[] = [];
  for (const row of mirror) {
    const price = Number(row.price);
    const farmCost = Number(row.farm_cost);
    if (price <= 0 || farmCost <= 0) continue;

    const expected = computeExpectedPrice(
      farmCost,
      row.vendor ?? '',
      row.box_type,
      Number(row.units_per_box) || 0,
      Number(row.total_stems) || 0,
      gpm, fedex, fuel, boxMaster,
    );
    if (expected == null || expected <= 0) continue;

    const deviationPct = ((price - expected) / expected) * 100;
    if (Math.abs(deviationPct) <= FORMULA_DEVIATION_THRESHOLD_PCT) continue;

    const key = `price.formula_reset::${row.id}`;
    if (pendingSet.has(key)) { stats.formula_reset.skipped++; continue; }

    formulaProposals.push({
      type: 'price.formula_reset',
      target_table: 'floropolis_inventory_mirror',
      target_id: String(row.id),
      status: 'awaiting_facu',
      source_agent: 'job_generator',
      source_table: 'floropolis_inventory_mirror',
      source_id: String(row.id),
      source_rationale: `Price deviates ${deviationPct > 0 ? '+' : ''}${deviationPct.toFixed(1)}% from formula. Current: $${price.toFixed(2)}, Formula: $${expected.toFixed(2)}.`,
      payload: {
        sku_id: row.id,
        sku_name: row.name,
        vendor: row.vendor,
        tier: row.tier,
        current_price: price,
        formula_price: expected,
        deviation_pct: Math.round(deviationPct * 10) / 10,
        deviation_direction: deviationPct > 0 ? 'above_formula' : 'below_formula',
        formula_inputs: { farm_cost: farmCost, gpm, fedex_rate: fedex, fuel_mult: fuel },
        source_snapshot: {
          price,
          has_open_price_alert: row.has_open_price_alert,
          contents_note: row.contents_note,
        },
      },
      cascade_summary: {
        affected_sku_count: 1,
        affected_skus_sample: [row.id],
        warnings: [],
        computed_at: new Date().toISOString(),
        computed_by: 'generate-recommendations.ts',
      },
    });
  }

  if (formulaProposals.length > 0) {
    const { error } = await service.from('admin_proposals').insert(formulaProposals);
    if (error) {
      console.error('[generate-recommendations] formula_reset insert failed:', error.message);
      stats.formula_reset.errors += formulaProposals.length;
    } else {
      stats.formula_reset.created += formulaProposals.length;
    }
  }

  // -------------------------------------------------------------------------
  // 5. Open price alerts → price_alert.batch_clear (single-SKU)
  // -------------------------------------------------------------------------
  const alertProposals: object[] = [];
  for (const row of mirror) {
    if (!row.has_open_price_alert) continue;

    const key = `price_alert.batch_clear::${row.id}`;
    if (pendingSet.has(key)) { stats.open_alert.skipped++; continue; }

    const price = Number(row.price);
    const farmCost = Number(row.farm_cost);
    const expected = computeExpectedPrice(
      farmCost, row.vendor ?? '', row.box_type,
      Number(row.units_per_box) || 0, Number(row.total_stems) || 0,
      gpm, fedex, fuel, boxMaster,
    );

    alertProposals.push({
      type: 'price_alert.batch_clear',
      target_table: 'floropolis_inventory_mirror',
      target_id: String(row.id),
      status: 'awaiting_facu',
      source_agent: 'job_generator',
      source_table: 'floropolis_inventory_mirror',
      source_id: String(row.id),
      source_rationale: `Rose flagged price as suspect (has_open_price_alert=true). Current: $${price > 0 ? price.toFixed(2) : '?'}${expected ? `, formula: $${expected.toFixed(2)}` : ''}.`,
      payload: {
        sku_ids: [row.id],
        sku_count: 1,
        vendor: row.vendor ?? '',
        tier: row.tier ?? '',
        sku_name: row.name,
        current_price: price > 0 ? price : null,
        formula_expected_price: expected,
        cost_source: row.cost_source,
        source_snapshot: {
          price: price > 0 ? price : null,
          has_open_price_alert: true,
          contents_note: row.contents_note,
        },
      },
      cascade_summary: {
        affected_sku_count: 1,
        affected_skus_sample: [row.id],
        warnings: ['open_price_alert — Rose flagged suspect price. Approve clears flag only.'],
        computed_at: new Date().toISOString(),
        computed_by: 'generate-recommendations.ts',
      },
    });
  }

  if (alertProposals.length > 0) {
    const { error } = await service.from('admin_proposals').insert(alertProposals);
    if (error) {
      console.error('[generate-recommendations] open_alert insert failed:', error.message);
      stats.open_alert.errors += alertProposals.length;
    } else {
      stats.open_alert.created += alertProposals.length;
    }
  }

  // -------------------------------------------------------------------------
  // 6. Missing descriptions → contents_description.facu_correction (audit-only)
  //    Group by vendor × variety × tier — one proposal per group, not per SKU.
  //    A group proposal is more actionable: Facu writes one description that
  //    covers all SKUs matching that vendor × variety × tier combination.
  // -------------------------------------------------------------------------
  const groupMap = new Map<string, { vendor: string; variety: string; tier: string; count: number; sample_id: number }>();
  for (const row of mirror) {
    if (row.contents_note && row.contents_note.trim().length > 0) continue;
    const vendor = row.vendor ?? 'unknown';
    const variety = row.variety ?? 'unknown';
    const tier = row.tier ?? 'unknown';
    const groupKey = `${vendor}||${variety}||${tier}`;
    const existing = groupMap.get(groupKey);
    if (existing) {
      existing.count++;
    } else {
      groupMap.set(groupKey, { vendor, variety, tier, count: 1, sample_id: row.id });
    }
  }

  const descProposals: object[] = [];
  for (const [, group] of groupMap) {
    const pendingKey = `contents_description.facu_correction::${group.vendor}||${group.variety}||${group.tier}`;
    if (pendingSet.has(pendingKey)) { stats.missing_description.skipped++; continue; }

    descProposals.push({
      type: 'contents_description.facu_correction',
      target_table: 'floropolis_inventory_mirror',
      target_id: `${group.vendor}||${group.variety}||${group.tier}`,
      status: 'awaiting_facu',
      source_agent: 'job_generator',
      source_table: 'floropolis_inventory_mirror',
      source_id: `${group.vendor}||${group.variety}||${group.tier}`,
      source_rationale: `${group.count} live SKU${group.count === 1 ? '' : 's'} (${group.vendor} × ${group.variety} × ${group.tier}) have no contents_note. Gate missing_contents_description is failing.`,
      payload: {
        vendor: group.vendor,
        variety: group.variety,
        tier: group.tier,
        affected_sku_count: group.count,
        sample_sku_id: group.sample_id,
        gate_id: 'missing_contents_description',
        correction_instruction: 'Write a short description of what is in the box for this vendor × variety × tier group. Your rationale will be routed to Rose to apply.',
      },
      cascade_summary: {
        affected_sku_count: group.count,
        affected_skus_sample: [group.sample_id],
        warnings: ['audit_only — correction routed to Rose for write-back to mirror'],
        computed_at: new Date().toISOString(),
        computed_by: 'generate-recommendations.ts',
      },
    });
  }

  if (descProposals.length > 0) {
    const { error } = await service.from('admin_proposals').insert(descProposals);
    if (error) {
      console.error('[generate-recommendations] missing_description insert failed:', error.message);
      stats.missing_description.errors += descProposals.length;
    } else {
      stats.missing_description.created += descProposals.length;
    }
  }

  return stats;
}
