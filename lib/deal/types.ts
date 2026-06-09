// Deal Builder shared types: client intel, catalog varieties, box types, deal draft + save shapes.
// v1 | 2026-06-09 | Job_PM (CPO)

export interface ClientLite {
  id: string;
  leadMasterId: number | null;
  name: string;
  city: string | null;
  state: string | null;
  source: string;
  status: string | null;
  heat: string | null;
  interestScore: number | null;
  interactions: number | null;
  talkSeconds: number | null;
}

export interface ClientIntel extends ClientLite {
  address: string | null;
  zip: string | null;
  email: string | null;
  phone: string | null;
  currentSupplier: string | null;
  pricesTheyPay: string | null;
  businessType: string | null;
  likes: string | null;
  objections: string | null;
  keyQuote: string | null;
  lastCallOutcome: string | null;
  converted: boolean | null;
  revenueL365: number | null;
  website: string | null;
  daysInFunnel: number | null;
}

export interface CatalogVariety {
  variety: string;
  tier: string | null;   // supply tier: T2 | T3 | k2k (customer/supply tier)
  grade: string | null;  // stem length: 40/50/60cm (the physical grade) — DIFFERENT from tier
  farmCost: number | null;
  priceFloor: number | null;
  gpmActual: number | null;
  boxType: string | null;
  stemsPerBox: number | null;
  costSource: string | null;
}

export interface BoxType {
  boxType: string;
  stemsPerBox: number | null;
  chargeableKg: number | null;
  vendor: string | null;
}

export interface DealLineInput {
  variety: string;
  tier?: string | null;    // supply tier (T2/T3/k2k)
  grade?: string | null;   // stem length (40/50/60cm) — different from tier
  boxType?: string | null;
  stems: number;
  capacityUnit?: string;
  unitCost: number;
  costSource?: string | null;
  priceFloor: number;
  linePrice: number;
  isNewVariety?: boolean;
  priceDisposition?: 'one_off' | 'tier' | 'temp_promo';
  promoExpiresAt?: string | null;
}

export interface DealDraft {
  clientLeadMasterId: number | null;
  clientSnapshot: Record<string, unknown>;
  dealType: 'one_off' | 'standing_order';
  cadence?: string | null;
  lines: DealLineInput[];
  price: number;
  createdBy?: string | null;
}

export interface FedexEstimate {
  dimKg: number;
  chargeableKg: number;
  boxFreight: number;
  costPerUnit: number;
}

export const GPM_FLOOR = 0.05; // 5% — covers sales commission; floor = cost/(1-GPM_FLOOR)
