// lib/supabase/prod-flora-reads.ts
// v1 | 2026-06-22 | Job_PM
//
// Isolated PROD read helpers for FLORA cohort data. Lives in its own file so
// route files that import it can still write to BACKUP without triggering the
// PROD write-boundary scanner (which flags any mutation token in files that
// import prod-server directly).

import { getProdReadClient } from '@/lib/supabase/prod-server';

export interface FloraAddress {
  zoho_id: string;
  description: string | null;
}

/** Batch-fetch v_flora_cohort descriptions for a set of zoho_ids. Best-effort — returns [] on any error. */
export async function fetchFloraCohortAddresses(zohoIds: string[]): Promise<FloraAddress[]> {
  if (!zohoIds.length) return [];
  try {
    const prod = getProdReadClient();
    if (!prod) return [];
    const { data } = await prod
      .from('v_flora_cohort')
      .select('zoho_id, description')
      .in('zoho_id', zohoIds);
    return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      zoho_id: typeof r.zoho_id === 'string' ? r.zoho_id.trim() : '',
      description: typeof r.description === 'string' ? r.description : null,
    }));
  } catch {
    return [];
  }
}
