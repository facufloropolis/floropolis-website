// Client-side view model for the Deal Builder UI. Maps to DealLineInput on save.
// v1 | 2026-06-09 | Job_PM (CPO)

export type LineDisposition = 'catalogo' | 'one_off' | 'tier' | 'temp_promo';

/** A variety line as edited in the UI (per-stem economics live at the row). */
export interface DealLineVM {
  id: string;
  variety: string;
  tier: string | null;   // supply tier (T2/T3/k2k)
  grade: string | null;  // stem length (40/50/60cm) — distinto de tier
  boxType: string | null;
  stems: number;
  costPerStem: number;
  floorPerStem: number;
  pricePerStem: number;
  disposition: LineDisposition;
  costSource: string | null;
  isNewVariety: boolean;
  promoExpiresAt: string | null;
}
