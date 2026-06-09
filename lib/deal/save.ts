// Deal Builder write layer: persist deal + lines (BACKUP). The min-GPM floor is a
// CONFIG value (pricing_constants.min_gpm_deal) and a SOFT guideline — below-floor
// deals are FLAGGED (below_floor=true), NOT blocked. Facu can run a strategic deal
// below the floor; it surfaces in the approval queue for sign-off.
// v2 | 2026-06-09 | Job_PM (CPO) — de-enforced + config-driven per Facu.
//
// price_floor per line is Rose's authority (read, never recomputed).

import { getBackupServiceClient } from '@/lib/supabase/backup-server';
import { getMinGpm } from './data';
import type { DealDraft } from './types';

export async function saveDeal(draft: DealDraft): Promise<{ dealId: number }> {
  // Totals + blended GPM.
  const totalCost = draft.lines.reduce((sum, l) => sum + l.stems * l.unitCost, 0);
  const blendedGpm = draft.price > 0 ? 1 - totalCost / draft.price : 0;

  // Min-GPM floor from CONFIG (soft). Flag below-floor; do NOT block.
  const minGpm = await getMinGpm();
  const minPrice = totalCost / (1 - minGpm);
  const belowFloor =
    draft.price < minPrice - 1e-9 || draft.lines.some((l) => l.linePrice < l.priceFloor - 1e-9);

  const backup = getBackupServiceClient();

  // (4) Insert the deal header.
  const { data: deal, error: dealErr } = await backup
    .from('deals')
    .insert({
      client_lead_master_id: draft.clientLeadMasterId,
      client_snapshot: draft.clientSnapshot,
      deal_type: draft.dealType,
      cadence: draft.cadence ?? null,
      total_cost: totalCost,
      total_price: draft.price,
      blended_gpm: blendedGpm,
      approval_status: 'pending_approval',
      below_floor: belowFloor,
      created_by: draft.createdBy ?? null,
      status: 'draft',
      approved_by: null,
    })
    .select('id')
    .single();

  if (dealErr || !deal) {
    throw new Error(`deal_insert_failed: ${dealErr?.message ?? 'no row returned'}`);
  }

  const dealId = Number((deal as { id: number }).id);

  // (5) Insert the deal lines.
  const lineRows = draft.lines.map((l) => ({
    deal_id: dealId,
    variety: l.variety,
    tier: l.tier ?? null,
    grade: l.grade ?? null,
    box_type: l.boxType ?? null,
    stems: l.stems,
    capacity_unit: l.capacityUnit ?? null,
    unit_cost: l.unitCost,
    cost_source: l.costSource ?? null,
    price_floor: l.priceFloor,
    line_price: l.linePrice,
    is_new_variety: l.isNewVariety ?? false,
    price_disposition: l.priceDisposition ?? null,
    promo_expires_at: l.promoExpiresAt ?? null,
  }));

  const { error: linesErr } = await backup.from('deal_lines').insert(lineRows);
  if (linesErr) {
    throw new Error(`deal_lines_insert_failed: ${linesErr.message}`);
  }

  return { dealId };
}
