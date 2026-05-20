// Featured-score seed (importance_score input) for /admin/catalog.
// v1 | 2026-05-19 | Job_PM catalog-v2 [V8 SHADOW]
//
// Why this exists:
//   Per feedback_admin_design_principles.md section 3, importance_score on the
//   admin catalog page = featured_score from the Job+Talin framework agreed
//   2026-05-12 (featured_products_framework.md). The full pipeline
//   (TAM x seasonal x trend x quotes x competitor price gap) is NOT yet built;
//   today we have a hardcoded shortlist of 7 SKUs with scores Talin computed
//   manually from Talin_Marketing/deliverables/analysis/featured_by_variety_2026-05-12.md.
//
// Lookup is by case-folded name substring (mirror has long compound names like
// "Roses 'Quicksand Cream' 80cm Bunch 25"). When the upstream pipeline lands,
// REPLACE this file with a DB join against a real featured_scores table; keep
// the import path stable so /admin/catalog doesn't change.
//
// TODO: build featured_score pipeline; today using seed of 7 SKUs.

export interface FeaturedScoreEntry {
  // Lowercased substring(s) that must ALL appear in the SKU name for a match.
  match_terms: string[];
  importance_score: number; // 0-100
  notes?: string;
}

export const FEATURED_SCORE_SEED: FeaturedScoreEntry[] = [
  // 1. Quicksand Cream 80cm  -- top score, #1 bridal rose 2026 (-46% vs Portland)
  { match_terms: ['quicksand', '80'], importance_score: 100, notes: '#1 bridal rose 2026' },
  // 2. Cool Water Lavender 50cm  -- iconic named variety (-47% vs FiftyFlowers)
  { match_terms: ['cool water', '50'], importance_score: 90, notes: 'iconic lavender 50cm' },
  // 3. Cool Water Lavender 60cm
  { match_terms: ['cool water', '60'], importance_score: 90, notes: 'iconic lavender 60cm' },
  // 4. Quicksand Cream 60cm
  { match_terms: ['quicksand', '60'], importance_score: 90, notes: 'bridal staple 60cm' },
  // 5. Sky Waltz Light Blue 60cm (Delphinium)  -- -36% vs Potomac
  { match_terms: ['sky waltz', '60'], importance_score: 81, notes: 'delphinium price leader' },
  // 6. Serene Lavender Delphinium 60cm  -- -49% vs PetalJet, sub-$1
  { match_terms: ['serene', 'lavender', '60'], importance_score: 80, notes: 'sub-$1 delphinium' },
  // 7. Orange Crush Orange 60cm  -- -55% vs FF, deep orange trend 2026
  { match_terms: ['orange crush', '60'], importance_score: 80, notes: 'orange trend 2026' },
];

/**
 * Look up importance_score for a SKU by name. Returns null when no seed match.
 * (Null is preferred over 0 so the UI can render an honest em-dash instead of
 * implying a low-importance score.)
 */
export function lookupImportanceScore(name: string | null | undefined): number | null {
  if (!name) return null;
  const hay = name.toLowerCase();
  for (const entry of FEATURED_SCORE_SEED) {
    if (entry.match_terms.every((t) => hay.includes(t))) {
      return entry.importance_score;
    }
  }
  return null;
}
