// price-review.ts — data layer for the /admin/supply price queue. Suggested prices are DERIVED
// from the fixed formula price = farm_cost/(1-gpm)+delivery (gpm = pricing_constants.gpm_target).
// Calculable = has farm_cost → Facu approves/corrects the suggested price (Job proposes, never
// owns price). Missing-cost → shown as "can't price yet, missing cost in the system" (Job routes
// the cost-input internally, never tells Facu to chase Rose). v1 | 2026-06-12 | Job_PM (CPO).
// SERVER-ONLY.

import { getBackupServiceClient } from '@/lib/supabase/backup-server';

export interface PriceCandidate {
  id: number;
  skuId: string | null;
  variety: string | null;
  category: string | null;
  farmCost: number | null;
  suggestedPrice: number | null;
}

export interface PriceReviewData {
  calculable: PriceCandidate[]; // have cost -> suggested price, ready to approve
  missingCost: PriceCandidate[]; // no cost -> can't price yet (internal: cost input pending)
}

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

/** Pending price candidates split into calculable (approvable) vs missing-cost. NULL-safe. */
export async function getPriceReviewData(): Promise<PriceReviewData> {
  const empty: PriceReviewData = { calculable: [], missingCost: [] };
  let svc;
  try {
    svc = getBackupServiceClient();
  } catch {
    return empty;
  }
  try {
    const { data, error } = await svc
      .from('price_review')
      .select('id, sku_id, variety, category, farm_cost, suggested_price, status')
      .in('status', ['pending', 'needs_cost'])
      .order('suggested_price', { ascending: false, nullsFirst: false })
      .limit(500);
    if (error || !Array.isArray(data)) return empty;
    const calculable: PriceCandidate[] = [];
    const missingCost: PriceCandidate[] = [];
    for (const r of data as Array<Record<string, unknown>>) {
      const c: PriceCandidate = {
        id: typeof r.id === 'number' ? r.id : Number(r.id),
        skuId: str(r.sku_id),
        variety: str(r.variety),
        category: str(r.category),
        farmCost: num(r.farm_cost),
        suggestedPrice: num(r.suggested_price),
      };
      if (r.status === 'needs_cost') missingCost.push(c);
      else calculable.push(c);
    }
    return { calculable, missingCost };
  } catch {
    return empty;
  }
}
