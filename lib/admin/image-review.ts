// image-review.ts — data layer for the /admin/supply image-review queue. A sourcing subagent
// fills BACKUP public.image_review with candidate images per blocked SKU (zero variable cost:
// PROD-propagate > vendor > free stock > Pollinations AI last). Facu approves/rejects each WITH
// reason tags (the learning signal that trains the next sourcing batch). Approved -> propagate
// to the catalog. Per image_engine_spec.md (Facu-approved 2026-06-08).
// v1 | 2026-06-12 | Job_PM (CPO)
//
// SERVER-ONLY.

import { getBackupServiceClient } from '@/lib/supabase/backup-server';

export interface ImageCandidate {
  id: number;
  url: string;
  source: string;       // prod_propagate | vendor | free_stock | ai_pollinations
  sourceDetail: string | null;
  tier: number | null;  // 1=prod, 2=vendor, 3=free, 4=ai
}

export interface ImageReviewSku {
  skuId: string | null;
  variety: string | null;
  vendor: string | null;
  sizeCm: string | null;
  candidates: ImageCandidate[]; // best source first (tier asc)
}

const str = (v: unknown): string | null => {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
};

interface ReviewRaw {
  id: number;
  sku_id: string | null;
  variety: string | null;
  vendor: string | null;
  size_cm: string | null;
  candidate_url: string | null;
  source: string | null;
  source_detail: string | null;
  tier: number | null;
}

/** Pending image candidates grouped by SKU, candidates ordered best-source-first.
 *  NULL-safe: degrades to [] on any failure. */
export async function getImageReviewQueue(): Promise<ImageReviewSku[]> {
  let svc;
  try {
    svc = getBackupServiceClient();
  } catch {
    return [];
  }
  let rows: ReviewRaw[] = [];
  try {
    const { data, error } = await svc
      .from('image_review')
      .select('id, sku_id, variety, vendor, size_cm, candidate_url, source, source_detail, tier')
      .eq('status', 'pending')
      .order('tier', { ascending: true })
      .limit(1000);
    if (error || !Array.isArray(data)) return [];
    rows = data as unknown as ReviewRaw[];
  } catch {
    return [];
  }

  const bySku = new Map<string, ImageReviewSku>();
  for (const r of rows) {
    const url = str(r.candidate_url);
    if (!url) continue;
    const key = str(r.sku_id) ?? `var:${str(r.variety) ?? r.id}`;
    let sku = bySku.get(key);
    if (!sku) {
      sku = {
        skuId: str(r.sku_id),
        variety: str(r.variety),
        vendor: str(r.vendor),
        sizeCm: str(r.size_cm),
        candidates: [],
      };
      bySku.set(key, sku);
    }
    sku.candidates.push({
      id: r.id,
      url,
      source: str(r.source) ?? 'unknown',
      sourceDetail: str(r.source_detail),
      tier: typeof r.tier === 'number' ? r.tier : null,
    });
  }

  // SKUs with the cheapest/best candidate first (lowest min-tier), then by name.
  return Array.from(bySku.values()).sort((a, b) => {
    const at = Math.min(...a.candidates.map((c) => c.tier ?? 9));
    const bt = Math.min(...b.candidates.map((c) => c.tier ?? 9));
    if (at !== bt) return at - bt;
    return (a.variety ?? '').localeCompare(b.variety ?? '');
  });
}
