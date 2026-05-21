// Cost source registry — maps cost_source values → metadata + URL.
// v1 | 2026-05-21 | Job_PM [V8 SHADOW]
// URLs are null until Facu provides the actual Google Sheet links.
// To add a URL: find the entry below and paste the full https:// link as url.

export interface CostSourceMeta {
  label: string;
  url: string | null;
  reliability: 'high' | 'medium' | 'low' | 'pending';
  description: string;
}

export const COST_SOURCE_REGISTRY: Record<string, CostSourceMeta> = {
  'Facu_May12_2026_matrix': {
    label: 'Facu May 12 matrix',
    url: null, // TODO: paste Google Sheet URL
    reliability: 'high',
    description: 'Facu-reviewed cost matrix, May 12 2026',
  },
  'Megaflor_k2k_2026-05-13': {
    label: 'Megaflor K2K (May 13)',
    url: null,
    reliability: 'high',
    description: 'Live K2K feed, May 13 2026',
  },
  'Facu_dispo_Flodecol_2026-05-13': {
    label: 'Facu Flodecol dispo (May 13)',
    url: null,
    reliability: 'high',
    description: 'Facu-reviewed Flodecol disposition, May 13 2026',
  },
  'Facu_MF_pricelist_2026-03-05': {
    label: 'Facu MF pricelist (Mar 5)',
    url: null,
    reliability: 'high',
    description: 'Facu-reviewed Magic Flowers pricelist, March 5 2026',
  },
  'vendor_agreements_T2': {
    label: 'T2 vendor agreements',
    url: null,
    reliability: 'medium',
    description: 'Negotiated T2 vendor agreements (undated)',
  },
  'fob_pricelist_2026-03-25': {
    label: 'FOB pricelist (Mar 25)',
    url: null,
    reliability: 'medium',
    description: 'FOB pricelist March 25 2026 — not Facu-reviewed',
  },
  'google_sheet_benchmark': {
    label: 'Benchmark (sheet)',
    url: null, // TODO: paste Google Sheet URL
    reliability: 'low',
    description: 'Benchmark estimates — not confirmed vendor quotes',
  },
  'catalog_Flodecol_Nov25': {
    label: 'Flodecol catalog (Nov 25)',
    url: null,
    reliability: 'low',
    description: '6-month-old vendor catalog',
  },
  'catalog_Nov25': {
    label: 'Nov 25 catalog',
    url: null,
    reliability: 'low',
    description: '6-month-old catalog',
  },
  'PENDING_MF_PRICELIST': {
    label: 'MF pricelist (pending)',
    url: null,
    reliability: 'pending',
    description: 'Magic Flowers pricelist not yet received',
  },
  'OLD_Workshop_Future': {
    label: 'Old workshop future',
    url: null,
    reliability: 'pending',
    description: 'Legacy workshop data — flagged stale',
  },
};

export function getCostSourceMeta(source: string | null): CostSourceMeta | null {
  if (!source) return null;
  return COST_SOURCE_REGISTRY[source] ?? null;
}

const RELIABILITY_CLS: Record<CostSourceMeta['reliability'], string> = {
  high:    'text-emerald-700',
  medium:  'text-amber-700',
  low:     'text-red-700',
  pending: 'text-slate-400',
};

export function getReliabilityCls(reliability: CostSourceMeta['reliability']): string {
  return RELIABILITY_CLS[reliability];
}
