// Deal Builder write layer: enforce price floors + GPM floor, then persist deal + lines (BACKUP).
// v1 | 2026-06-09 | Job_PM (CPO)
//
// WRITE path. price_floor is Rose's authority — enforced here, never recomputed.

import { getBackupServiceClient } from '@/lib/supabase/backup-server';
import { GPM_FLOOR } from './types';
import type { DealDraft } from './types';

export async function saveDeal(draft: DealDraft): Promise<{ dealId: number }> {
  // (1) Enforce per-line floor: line price must cover Rose's price_floor.
  draft.lines.forEach((line, idx) => {
    if (line.linePrice < line.priceFloor) {
      throw new Error(
        `line_below_floor: line[${idx}] "${line.variety}" price ${line.linePrice} < price_floor ${line.priceFloor}`,
      );
    }
  });

  // (2) Compute totals + blended GPM.
  const totalCost = draft.lines.reduce((sum, l) => sum + l.stems * l.unitCost, 0);
  const blendedGpm = draft.price > 0 ? 1 - totalCost / draft.price : 0;

  // (3) Enforce GPM floor: deal price must clear cost / (1 - GPM_FLOOR).
  const minPrice = totalCost / (1 - GPM_FLOOR);
  if (draft.price < minPrice) {
    throw new Error(
      `below_floor: deal price ${draft.price} < min ${minPrice.toFixed(4)} (cost ${totalCost} / (1 - ${GPM_FLOOR}))`,
    );
  }

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
