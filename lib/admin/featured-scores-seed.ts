// Conversion-importance seed for /admin/catalog.
// v2 | 2026-05-26 | Job_PM [V8 SHADOW]
//
// Score (0-100) = P(conversion | SKU published, listing perfect).
// Not inventory. Not data quality. Not GPM.
//
// Formula: Demand tier (60%) × Price competitiveness vs market (25%) × 2026 trend presence (15%)
//
// Sources:
//   - Research agent web search (2026-05-26): Las Vegas Flower Market confirmed prices,
//     Florists' Review trend forecast, The Knot 2026 wedding trends, Whole Blossoms
//     buyer behavior report, Thursd variety profiles, FiftyFlowers category data,
//     Potomac/Cascade Floral competitor pricing, USDA Boston Terminal Market May 2026.
//
// Scores override the default (DEFAULT_IMPORTANCE_SCORE = 25) for named varieties.
// The default covers commodity/unknown varieties that appear in no market research.
//
// Recalibration trigger: after Stripe goes live, track (PDP views × add-to-cart rate)
// per variety weekly. Any variety where realized demand index is >50% above or below
// predicted importance score → flag for model correction.
//
// ORDERING MATTERS: more-specific match_terms must come before less-specific ones,
// because lookupImportanceScore returns on first match.

export interface FeaturedScoreEntry {
  match_terms: string[];     // ALL must appear in lowercased SKU name
  importance_score: number;  // 0-100
  notes?: string;
}

// Returned for varieties not in the seed (commodity/unknown).
// Non-null so priority_to_fix = 25 × quality_gap keeps them in the improvement queue.
export const DEFAULT_IMPORTANCE_SCORE = 25;

export const FEATURED_SCORE_SEED: FeaturedScoreEntry[] = [

  // ==========================================================================
  // TIER 5 — Bridal staples: named by florists and brides by variety, year-round
  // ==========================================================================

  // Quicksand — #1 most requested neutral rose in US. Florists' Review 2024 top focal.
  // FiftyFlowers built an entire "alternative for Quicksand" collection.
  // LVFM $2.40 vs our $1.72 → +28% advantage. Pantone Mocha Mousse 2026 COTY tailwind.
  { match_terms: ['quicksand'], importance_score: 93, notes: 'bridal staple #1, Pantone Mocha Mousse 2026' },

  // Freedom — best-selling rose in the US by trade consensus. Valentine's + wedding year-round.
  // LVFM $1.85 vs our $1.51 → +18% advantage.
  { match_terms: ['freedom'], importance_score: 88, notes: 'best-selling red in US, year-round staple' },

  // Toffee — supply-constrained, only 5 licensed Ecuadorian growers (Schreurs).
  // Florists' Review: "some florists can barely keep them in stock."
  // Flower Explosion $4.80 vs our $3.12 → +35% advantage. Mocha Mousse COTY 2026.
  { match_terms: ['toffee'], importance_score: 85, notes: 'supply-constrained, demand outstrips supply, 2026 COTY' },

  // Cool Water — canonical lavender variety, carried by every major wholesaler.
  // LVFM $2.35 vs our $1.50 → +36% advantage. Best price edge in the catalog.
  { match_terms: ['cool water'], importance_score: 83, notes: 'lavender staple, +36% vs LVFM' },

  // Vendela — Whole Blossoms: "most widely used wedding flower in the industry."
  // LVFM $2.67 vs our $2.76 → -3% (slightly above market, demand carries the score).
  { match_terms: ['vendela'], importance_score: 82, notes: 'ivory/cream bridal #1 per Whole Blossoms' },

  // ==========================================================================
  // TIER 4 — Named varieties with professional florist pull
  // ==========================================================================

  // Free Spirit — The Knot 2026: "papaya orange" breakout color. Alexandra Farms featured.
  // FiftyFlowers dedicated garden rose line around it. Est. $3.50-4.00 vs our $2.93 → +15-25%.
  { match_terms: ['free spirit'], importance_score: 80, notes: '2026 papaya/peach trend, The Knot featured' },

  // Westminster Abbey — garden rose, 150 petals, fragrant. 2026 neutral palette named variety.
  // LVFM $4.80 vs our $3.66 → +24% advantage.
  { match_terms: ['westminster abbey'], importance_score: 78, notes: 'garden rose premium, +24% vs LVFM' },

  // Tibet — florist staple white rose. Go-to budget white. FiftyFlowers long-standing SKU.
  { match_terms: ['tibet'], importance_score: 58, notes: 'white bridal staple, budget tier' },

  // Explorer — preferred by professionals over Freedom for deep crimson + longer vase life.
  // TikTok "Explorer vs Freedom" comparison went viral in florist community.
  // NOTE: 'hot explorer' entry must come BEFORE this one (more specific match).
  { match_terms: ['hot explorer'], importance_score: 38, notes: 'red hybrid related to Explorer, lower name pull' },
  { match_terms: ['explorer'], importance_score: 74, notes: 'professional florist preferred red' },

  // ==========================================================================
  // TIER 3 — Trade-known, 2026 trend presence, niche demand
  // ==========================================================================

  // Country Blues — garden-type, cottage aesthetic, Rosen Tantau bred.
  // 2026 cobalt/blue trend described as "exploding." Est. $2.50-3.50 vs our $1.43 → +50%+.
  { match_terms: ['country blues'], importance_score: 67, notes: 'blue/cobalt 2026 trend, extraordinary price advantage' },

  // Shocking Blue — lavender-leaning, "blue" branding. 2026 blue boom, "Blue Tax" premium.
  { match_terms: ['shocking blue'], importance_score: 62, notes: '2026 blue trend, florist community pull' },

  // Creme de la Creme — soft champagne cream, bridal-adjacent. Competes with Quicksand/Vendela.
  { match_terms: ['creme de la creme'], importance_score: 62, notes: 'champagne cream, bridal adjacent to Quicksand' },

  // Sky Waltz Delphinium — bridal filler staple, blue/purple. Unique non-rose in catalog.
  // Price very competitive at $0.89/stem for a genuine event staple.
  { match_terms: ['sky waltz'], importance_score: 52, notes: 'delphinium bridal staple, arch/tall arrangements' },

  // Serene Lavender Delphinium — same category, even cheaper ($0.79), 2026 lavender palette.
  { match_terms: ['serene', 'lavender'], importance_score: 53, notes: 'delphinium, 2026 lavender palette match' },

  // Antonia Garden — Austin-style garden shape, yellow/cream rosette. 2026 garden rose trend.
  // Est. $2.00-2.50 vs our $1.65 → +25%.
  { match_terms: ['antonia'], importance_score: 51, notes: 'garden-style rosette, 2026 garden trend' },

  // Queens Crown — pink garden rose, WholeBlosoms listed, premium tier.
  { match_terms: ["queens crown"], importance_score: 51, notes: 'garden rose premium, pink' },

  // Candy X-Pression — pink rosette, FiftyFlowers garden rose classification. Distinctive shape.
  { match_terms: ['candy'], importance_score: 48, notes: 'rosette shape, distinctive garden-adjacent' },

  // Roseberry — dark magenta, Florabundance and Metropolitan Wholesale carry.
  { match_terms: ['roseberry'], importance_score: 47, notes: 'dark magenta, trade-recognized' },

  // Wasabi — green rose, niche novelty. WholeBlosoms, used as accent. 2026 botanical trend.
  { match_terms: ['wasabi'], importance_score: 45, notes: 'green accent, niche 2026 botanical' },

  // ==========================================================================
  // TIER 2 — Commodity/occasion, recognized in trade, low consumer name pull
  // ==========================================================================

  // Fortune — red variety, Cascade Floral top-seller list alongside Freedom/Explorer.
  { match_terms: ['fortune'], importance_score: 44, notes: 'red commodity, trade-recognized' },

  // Brighton — yellow rose. FiftyFlowers carries Brighton bouquet. Moderate occasion use.
  { match_terms: ['brighton'], importance_score: 42, notes: 'yellow, occasion use (sympathy/spring)' },

  // Violet Hill — lavender/purple-adjacent. 2026 blue/purple trend tailwind.
  { match_terms: ['violet hill'], importance_score: 40, notes: 'lavender, 2026 purple trend' },

  // Mamma Mia — orange-red, mentioned in some trend roundups.
  { match_terms: ['mamma mia'], importance_score: 40, notes: 'orange-red, some trend presence' },

  // Queenberry — hot pink, FiftyFlowers SKU, limited name pull.
  { match_terms: ['queenberry'], importance_score: 38, notes: 'hot pink, commodity tier' },

  // Enchantment — pink with white base, Highgarden Roses. Low named demand.
  { match_terms: ['enchantment'], importance_score: 38, notes: 'pink, low named demand' },

  // High & Magic bicolor family — Las Vegas Flower Market lists them. Niche.
  // Specific variants come first.
  { match_terms: ['yellow magic'], importance_score: 36, notes: 'bicolor yellow, niche' },
  { match_terms: ['flame magic'], importance_score: 36, notes: 'bicolor flame, niche' },
  { match_terms: ['high & magic'], importance_score: 37, notes: 'bicolor, niche florist use' },

  // Full Monty — standard hybrid tea, limited trade presence.
  { match_terms: ['full monty'], importance_score: 36, notes: 'commodity, limited trade identity' },

  // Sunmaster — yellow-orange, FiftyFlowers commodity category.
  { match_terms: ['sunmaster'], importance_score: 35, notes: 'yellow-orange commodity' },

  // Orange Crush — commodity-positioned large-head orange. Mass distributor.
  // NOTE: had Talin score of 80 (price advantage vs FF), updated to 36 per research
  // (demand tier 2 — no named consumer pull; price advantage alone insufficient for conversion).
  { match_terms: ['orange crush'], importance_score: 36, notes: 'orange commodity, low name pull despite price edge' },

  // Redvolution — deep vivid red, Florabundance and WholeBlosoms. Premium red segment.
  { match_terms: ['redvolution'], importance_score: 41, notes: 'premium red, low vs Freedom/Explorer name pull' },

  // Sweet Escimo — smaller Escimo-family white rose. Some florist use.
  { match_terms: ['sweet escimo'], importance_score: 34, notes: 'white Escimo variant' },

  // Country Home — not found in notable contexts.
  { match_terms: ['country home'], importance_score: 27, notes: 'unknown variety, low demand signal' },

  // Momentum, Encanto, Nexus — no notable trade or consumer presence found.
  { match_terms: ['momentum'], importance_score: 28, notes: 'unknown, no market presence found' },
  { match_terms: ['encanto'], importance_score: 28, notes: 'unknown, no market presence found' },
  { match_terms: ['nexus'], importance_score: 27, notes: 'unknown, no market presence found' },

  // Novia, Felicity — white varieties, undifferentiated from Tibet/Vendela in search.
  { match_terms: ['novia'], importance_score: 28, notes: 'white commodity, undifferentiated' },
  { match_terms: ['felicity'], importance_score: 27, notes: 'unknown variety' },

  // Sweet Cake, Sunny Days — no distinct market identity.
  { match_terms: ['sweet cake'], importance_score: 26, notes: 'no market identity found' },
  { match_terms: ['sunny days'], importance_score: 26, notes: 'no market identity found' },

  // Assorted — zero specific demand signal; lowest conversion floor.
  { match_terms: ['assorted'], importance_score: 18, notes: 'no variety-specific pull, price-only buyers' },

];

/**
 * Importance score for a SKU by name.
 * Returns DEFAULT_IMPORTANCE_SCORE (25) when no seed entry matches, so that
 * commodity/unknown SKUs still appear in the improvement queue with low priority
 * rather than being invisible (priority_to_fix = 0 when null).
 */
export function lookupImportanceScore(name: string | null | undefined): number {
  if (!name) return DEFAULT_IMPORTANCE_SCORE;
  const hay = name.toLowerCase();
  for (const entry of FEATURED_SCORE_SEED) {
    if (entry.match_terms.every((t) => hay.includes(t))) {
      return entry.importance_score;
    }
  }
  return DEFAULT_IMPORTANCE_SCORE;
}
