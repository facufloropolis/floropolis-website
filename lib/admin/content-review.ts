// content-review.ts — data layer for the /admin/supply content-review queue. Descriptions are
// AUTO-GENERATED from real fields (total_stems + variety + length) — never invented, never Facu
// data-entry. He Applies / Edits / Rejects. Approve propagates to product_chrome.description (the
// content gate closes). Same mold as image-review. v1 | 2026-06-12 | Job_PM (CPO). SERVER-ONLY.

import { getBackupServiceClient } from '@/lib/supabase/backup-server';

export interface ContentCandidate {
  id: number;
  skuId: string | null;
  variety: string | null;
  length: string | null;
  text: string;
}

const str = (v: unknown): string | null => {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
};

/** Pending auto-generated content descriptions. NULL-safe: [] on any failure. */
export async function getContentReviewQueue(): Promise<ContentCandidate[]> {
  let svc;
  try {
    svc = getBackupServiceClient();
  } catch {
    return [];
  }
  try {
    const { data, error } = await svc
      .from('content_review')
      .select('id, sku_id, variety, length, candidate_text')
      .eq('status', 'pending')
      .order('variety', { ascending: true })
      .limit(500);
    if (error || !Array.isArray(data)) return [];
    return (data as Array<Record<string, unknown>>).map((r) => ({
      id: typeof r.id === 'number' ? r.id : Number(r.id),
      skuId: str(r.sku_id),
      variety: str(r.variety),
      length: str(r.length),
      text: str(r.candidate_text) ?? '',
    }));
  } catch {
    return [];
  }
}
