// Floropolis Admin Catalog Control Plane -- mock data
// v0.1 | 2026-05-15 | Job_PM [V8 SHADOW]
//
// 30 SKUs across 5 vendors / 3 countries (EC + CO + NL).
// Multi-source: T2 (DB commitments) | T3 (DB sourceable) | K2K live (vendor uploads).
// Intentional gaps to demo edge cases: MF cost awaiting Viviana, Flodecol FB no box dims,
// Colombia WhatsApp ingest, Holland email ingest with low mapping confidence.
//
// All prices computed with Rose's verified formula (pricing_formula.md):
//   price_ex_delivery = farm_cost / (1 - GPM)
//   delivery_per_stem = ceil(box_dim_kg) * rate_per_kg * fuel_mult / stems_per_box
//   selling_price     = price_ex_delivery + delivery_per_stem
// GPM = 0.33 default. dim_kg = L_cm * W_cm * H_cm / 6000.

// ============================================================================
// TYPES
// ============================================================================

export type CountryCode = 'EC' | 'CO' | 'NL';
export type IngestionMethod = 'api' | 'email' | 'whatsapp' | 'csv' | 'manual';
export type SourceTier = 't2' | 't3' | 'k2k_live';
export type GpmBand = 'green' | 'yellow' | 'red';
export type ProposalStatus = 'awaiting_facu' | 'approved' | 'rejected';
export type Visibility = 'live' | 'hidden' | 'draft';

export type Vendor = {
  id: string;
  name: string;
  country: CountryCode;
  origin_port: string;
  ingestion_methods: IngestionMethod[];
  status: 'active' | 'onboarding' | 'paused';
  reliability_score: number; // 0-100
  notes?: string;
};

export type BoxType = {
  id: string;
  vendor_id: string;
  code: string;
  dims_cm: { L: number; W: number; H: number };
  dim_weight_kg: number;
  max_stems: number;
  cost_usd: number;
  verified: boolean;
  source: string;
};

export type ShippingConfig = {
  id: string;
  origin_country: CountryCode;
  origin_port: string;
  dest_zone: string;
  base_rate_per_kg: number;
  fuel_surcharge_mult: number;
  dim_divisor: number;
  rel_number: string;
  account_discount_pct: number;
  customs_fee_per_box: number;
  status: 'approved' | ProposalStatus;
  proposed_by?: string;
  proposed_at?: string;
};

export type QualityFamily = {
  id: string;
  name: string;
  category: 'rose' | 'hydrangea' | 'peony' | 'ranunculus' | 'delphinium' | 'anemone' | 'gypsophila';
  variety: string;
  length_cm: number;
  unit: 'stem' | '250g_pack' | '750g_pack';
};

export type SKU = {
  id: string;
  vendor_id: string;
  quality_family_id: string;
  vendor_sku_name: string;
  box_type_id: string;
  stems_per_box: number;
  sources: { tier: SourceTier; valid: boolean; note?: string }[];
  vendor_cost_usd: number | null;
  cost_status: 'verified' | 'awaiting_vendor_confirm' | 'missing';
  cost_source: IngestionMethod;
  cost_updated_at: string;
  calculated_price_per_stem: number | null;
  delivery_per_stem: number | null;
  gpm: number | null;
  gpm_band: GpmBand | null;
  availability: { delivery_week: string; stems: number; source: SourceTier }[];
  visibility: Visibility;
  visibility_rule: string;
  active_override_id?: string;
  last_edit_at: string;
  last_edit_by: string;
  is_top_seller: boolean;
  margin_per_stem: number | null;
  tier_targets?: { t2?: number; t3?: number };
};

export type Proposal = {
  id: string;
  type: 'box_dim' | 'shipping_config' | 'gpm_target' | 'discount' | 'visibility' | 'price_override' | 'mapping' | 'new_vendor';
  scope: string;
  current_value: string;
  proposed_value: string;
  proposed_by: string;
  proposed_at: string;
  status: ProposalStatus;
  approved_by?: string;
  approved_at?: string;
  reason?: string;
  warnings: { severity: 'info' | 'warn' | 'critical'; text: string }[];
  cascade_impact_skus: number;
  cascade_top_examples: { sku: string; before: string; after: string }[];
};

export type DiscountRule = {
  id: string;
  scope_type: 'category' | 'vendor' | 'sku' | 'client';
  scope_value: string;
  scope_label: string;
  discount_pct: number;
  expires_at: string | null;
  warnings: { severity: 'info' | 'warn' | 'critical'; text: string }[];
  status: 'active' | ProposalStatus | 'expired';
  approved_by?: string;
  approved_at?: string;
  notes?: string;
};

export type IngestStaging = {
  id: string;
  vendor_id: string;
  received_at: string;
  source: IngestionMethod;
  raw_input_preview: string;
  parsed_offers: number;
  mapping_confidence_avg: number;
  status: 'pending_review' | 'auto_applied' | 'rejected' | 'partial_mapped';
  mapped_sku_count: number;
  unmapped_count: number;
  parser_agent: 'Vendor Ingestion Adapter' | 'manual';
};

export type SkuMapping = {
  id: string;
  vendor_id: string;
  raw_name: string;
  raw_attributes: { key: string; value: string }[];
  suggested_quality_family_id: string;
  suggested_quality_family_name: string;
  confidence: number;
  alternatives: { quality_family_id: string; quality_family_name: string; confidence: number }[];
  status: 'pending' | 'accepted' | 'remapped' | 'rejected_new_sku';
};

export type VerifierStatus = {
  layer: string;
  verifier_name: string;
  status: 'PASS' | 'WARN' | 'FAIL' | 'MISSING';
  last_run_at: string;
  message: string;
};

export type SpecializationProposal = {
  id: string;
  area: 'frontend' | 'backend' | 'infra';
  title: string;
  priority: 'cutover_blocker' | 'phase_2' | 'phase_3';
  why: string;
  scope: string[];
  raci: { r: string; a: string; c: string; i: string };
  inbound_contracts: string[];
  outbound_contracts: string[];
  cost_estimate: string;
  detail_specced: boolean;
  status: 'awaiting_facu' | 'approved' | 'deferred' | 'rejected';
  facu_decision?: string;
};

// ============================================================================
// SHARED CONSTANTS
// ============================================================================

export const GPM_DEFAULT = 0.33;
export const GPM_TARGET_FLOOR = 0.28;
export const TODAY = '2026-05-15';

// ============================================================================
// VENDORS
// ============================================================================

export const VENDORS: Vendor[] = [
  {
    id: 'v_ecoroses',
    name: 'Ecoroses ECU',
    country: 'EC',
    origin_port: 'UIO',
    ingestion_methods: ['api', 'csv'],
    status: 'active',
    reliability_score: 92,
    notes: 'Live K2K + ghost portal. Cost coverage 100%. Box dims verified (FedEx labels).',
  },
  {
    id: 'v_magicflowers',
    name: 'Magic Flowers ECU',
    country: 'EC',
    origin_port: 'UIO',
    ingestion_methods: ['api', 'email'],
    status: 'active',
    reliability_score: 78,
    notes: '90 SKUs cost approved, 10 awaiting Viviana confirm. HB + QB-MF + EB-MF box dims verified.',
  },
  {
    id: 'v_flodecol',
    name: 'Flodecol ECU',
    country: 'EC',
    origin_port: 'UIO',
    ingestion_methods: ['api'],
    status: 'active',
    reliability_score: 85,
    notes: 'Cost coverage 100%. FB box dims unverified (no FedEx label yet).',
  },
  {
    id: 'v_andescolor',
    name: 'AndesColor CO',
    country: 'CO',
    origin_port: 'BOG',
    ingestion_methods: ['whatsapp', 'manual'],
    status: 'onboarding',
    reliability_score: 55,
    notes: 'Onboarding. Sends offers via WhatsApp voice notes + photos. Box dims unknown.',
  },
  {
    id: 'v_dutchflora',
    name: 'DutchFlora NL',
    country: 'NL',
    origin_port: 'AMS',
    ingestion_methods: ['email'],
    status: 'onboarding',
    reliability_score: 45,
    notes: 'Onboarding. Sends weekly availability email (PDF + inline text). Mapping confidence low.',
  },
];

// ============================================================================
// BOX TYPES (per vendor, sourced from Rose's pricing_formula.md verified table)
// ============================================================================

export const BOX_TYPES: BoxType[] = [
  // Ecoroses verified
  { id: 'bx_eco_qb',    vendor_id: 'v_ecoroses',     code: 'QB',     dims_cm: { L: 80, W: 30, H: 17 }, dim_weight_kg: 6.80,  max_stems: 125, cost_usd: 5.50, verified: true,  source: 'FedEx labels Mar-May 2026 (15+)' },
  { id: 'bx_eco_qbv',   vendor_id: 'v_ecoroses',     code: 'QBV',    dims_cm: { L: 70, W: 30, H: 25 }, dim_weight_kg: 8.75,  max_stems: 100, cost_usd: 6.20, verified: false, source: 'DB only, no label confirmation' },
  // Magic Flowers verified
  { id: 'bx_mf_hb',     vendor_id: 'v_magicflowers', code: 'HB',     dims_cm: { L: 100, W: 39, H: 18 }, dim_weight_kg: 11.70, max_stems: 250, cost_usd: 8.00, verified: true,  source: 'FedEx labels May 14 (2)' },
  { id: 'bx_mf_qb',     vendor_id: 'v_magicflowers', code: 'QB-MF',  dims_cm: { L: 100, W: 33, H: 11 }, dim_weight_kg: 6.05,  max_stems: 125, cost_usd: 5.50, verified: true,  source: 'FedEx labels Mar 19 (4) -- code provisional' },
  { id: 'bx_mf_eb',     vendor_id: 'v_magicflowers', code: 'EB-MF',  dims_cm: { L: 85, W: 24, H: 14 },  dim_weight_kg: 4.76,  max_stems: 120, cost_usd: 4.50, verified: true,  source: 'FedEx labels Mar 5+9 (4) -- code provisional' },
  // Flodecol -- FB unverified
  { id: 'bx_flo_qb',    vendor_id: 'v_flodecol',     code: 'QB',     dims_cm: { L: 80, W: 30, H: 17 }, dim_weight_kg: 6.80,  max_stems: 200, cost_usd: 5.50, verified: true,  source: 'FedEx labels Apr 27+30 (5+)' },
  { id: 'bx_flo_fb',    vendor_id: 'v_flodecol',     code: 'FB',     dims_cm: { L: 100, W: 22, H: 57 }, dim_weight_kg: 20.90, max_stems: 400, cost_usd: 12.00, verified: false, source: 'DB only, no label confirmation' },
  // AndesColor CO -- placeholder dims
  { id: 'bx_and_qb',    vendor_id: 'v_andescolor',   code: 'QB-CO',  dims_cm: { L: 82, W: 32, H: 18 }, dim_weight_kg: 7.87,  max_stems: 120, cost_usd: 6.00, verified: false, source: 'Self-reported via WhatsApp, no label' },
  // DutchFlora NL -- placeholder dims
  { id: 'bx_dut_eb',    vendor_id: 'v_dutchflora',   code: 'EB-NL',  dims_cm: { L: 90, W: 26, H: 16 }, dim_weight_kg: 6.24,  max_stems: 100, cost_usd: 7.00, verified: false, source: 'Per supplier PDF, no label' },
];

// ============================================================================
// SHIPPING CONFIG (per origin port -> dest zone)
// ============================================================================

export const SHIPPING_CONFIGS: ShippingConfig[] = [
  {
    id: 'sh_ec_us_west',
    origin_country: 'EC',
    origin_port: 'UIO',
    dest_zone: 'US-WEST',
    base_rate_per_kg: 6.50,
    fuel_surcharge_mult: 1.25,
    dim_divisor: 6000,
    rel_number: 'REL-EC-12345',
    account_discount_pct: 0,
    customs_fee_per_box: 0,
    status: 'approved',
  },
  {
    id: 'sh_ec_us_east',
    origin_country: 'EC',
    origin_port: 'UIO',
    dest_zone: 'US-EAST',
    base_rate_per_kg: 6.50,
    fuel_surcharge_mult: 1.25,
    dim_divisor: 6000,
    rel_number: 'REL-EC-12345',
    account_discount_pct: 0,
    customs_fee_per_box: 0,
    status: 'approved',
  },
  {
    id: 'sh_co_us_west',
    origin_country: 'CO',
    origin_port: 'BOG',
    dest_zone: 'US-WEST',
    base_rate_per_kg: 7.20,
    fuel_surcharge_mult: 1.30,
    dim_divisor: 6000,
    rel_number: 'REL-CO-44567',
    account_discount_pct: 0,
    customs_fee_per_box: 0,
    status: 'awaiting_facu',
    proposed_by: 'Job_PM',
    proposed_at: '2026-05-14',
  },
  {
    id: 'sh_nl_us_east',
    origin_country: 'NL',
    origin_port: 'AMS',
    dest_zone: 'US-EAST',
    base_rate_per_kg: 9.50,
    fuel_surcharge_mult: 1.15,
    dim_divisor: 6000,
    rel_number: 'REL-NL-pending',
    account_discount_pct: 0,
    customs_fee_per_box: 12.00,
    status: 'awaiting_facu',
    proposed_by: 'Job_PM',
    proposed_at: '2026-05-14',
  },
];

// ============================================================================
// QUALITY FAMILIES (cross-vendor merge keys)
// ============================================================================

export const QUALITY_FAMILIES: QualityFamily[] = [
  { id: 'qf_rose_mondial_60',     name: 'Rose Mondial 60cm',          category: 'rose',        variety: 'Mondial',         length_cm: 60, unit: 'stem' },
  { id: 'qf_rose_freedom_60',     name: 'Rose Freedom Red 60cm',      category: 'rose',        variety: 'Freedom',         length_cm: 60, unit: 'stem' },
  { id: 'qf_rose_antonia_60',     name: 'Rose Antonia Garden 60cm',   category: 'rose',        variety: 'Antonia Garden',  length_cm: 60, unit: 'stem' },
  { id: 'qf_rose_highflame_60',   name: 'Rose Bicolor H&F Magic 60cm', category: 'rose',       variety: 'High & Flame Magic', length_cm: 60, unit: 'stem' },
  { id: 'qf_rose_rainbow_50',     name: 'Rose Rainbow 50cm',          category: 'rose',        variety: 'Rainbow',         length_cm: 50, unit: 'stem' },
  { id: 'qf_rose_quicksand_60',   name: 'Rose Quicksand 60cm',        category: 'rose',        variety: 'Quicksand',       length_cm: 60, unit: 'stem' },
  { id: 'qf_rose_freespirit_50',  name: 'Rose Free Spirit 50cm',      category: 'rose',        variety: 'Free Spirit',     length_cm: 50, unit: 'stem' },
  { id: 'qf_rose_coolwater_60',   name: 'Rose Cool Water 60cm',       category: 'rose',        variety: 'Cool Water',      length_cm: 60, unit: 'stem' },
  { id: 'qf_hydrangea_blue',      name: 'Hydrangea Blue Premium',     category: 'hydrangea',   variety: 'Blue Premium',    length_cm: 70, unit: 'stem' },
  { id: 'qf_hydrangea_white',     name: 'Hydrangea White Jumbo',      category: 'hydrangea',   variety: 'White Jumbo',     length_cm: 70, unit: 'stem' },
  { id: 'qf_ranunculus_amandine', name: 'Ranunculus Amandine Assorted', category: 'ranunculus', variety: 'Amandine Assorted', length_cm: 40, unit: 'stem' },
  { id: 'qf_delphinium_seawaltz', name: 'Delphinium Dark Blue Sea Waltz 80cm', category: 'delphinium', variety: 'Sea Waltz Dark Blue', length_cm: 80, unit: 'stem' },
  { id: 'qf_anemone_mariane_fuchsia', name: 'Anemone Fuchsia Mariane 35-40cm', category: 'anemone', variety: 'Mariane Fuchsia', length_cm: 38, unit: 'stem' },
  { id: 'qf_anemone_mariane_burgundy', name: 'Anemone Burgundy Mariane 35cm', category: 'anemone', variety: 'Mariane Burgundy', length_cm: 35, unit: 'stem' },
  { id: 'qf_peony_sarah_bernhardt', name: 'Peony Pink Sarah Bernhardt 50cm', category: 'peony', variety: 'Sarah Bernhardt', length_cm: 50, unit: 'stem' },
  { id: 'qf_peony_coral_charm',   name: 'Peony Coral Charm 50cm',     category: 'peony',       variety: 'Coral Charm',     length_cm: 50, unit: 'stem' },
  { id: 'qf_gyp_millionstar_750', name: 'Gypsophila Million Star 750g', category: 'gypsophila', variety: 'Million Star',  length_cm: 0,  unit: '750g_pack' },
];

// ============================================================================
// SKUs (30 -- one row per vendor x quality_family)
// ============================================================================

// Helper to compute prices from Rose's formula
function priceFromFormula(args: {
  farm_cost: number;
  box_dim_kg: number;
  rate_per_kg: number;
  fuel_mult: number;
  stems_per_box: number;
  gpm?: number;
}): { delivery_per_stem: number; price_ex_delivery: number; selling_price: number; gpm_realized: number } {
  const gpm = args.gpm ?? GPM_DEFAULT;
  const price_ex_delivery = args.farm_cost / (1 - gpm);
  const delivery_per_box = Math.ceil(args.box_dim_kg) * args.rate_per_kg * args.fuel_mult;
  const delivery_per_stem = delivery_per_box / args.stems_per_box;
  const selling_price = price_ex_delivery + delivery_per_stem;
  // Blended GPM (margin over selling_price, delivery passed through at cost)
  const gpm_realized = (selling_price - args.farm_cost - delivery_per_stem) / selling_price;
  return {
    delivery_per_stem: Number(delivery_per_stem.toFixed(3)),
    price_ex_delivery: Number(price_ex_delivery.toFixed(3)),
    selling_price: Number(selling_price.toFixed(2)),
    gpm_realized: Number(gpm_realized.toFixed(3)),
  };
}

function gpmBand(gpm: number | null): GpmBand | null {
  if (gpm === null) return null;
  if (gpm >= GPM_DEFAULT) return 'green';
  if (gpm >= GPM_TARGET_FLOOR) return 'yellow';
  return 'red';
}

// Helper to build a SKU
type SkuSeed = {
  id: string;
  vendor_id: string;
  quality_family_id: string;
  vendor_sku_name: string;
  box_type_id: string;
  stems_per_box: number;
  farm_cost: number | null; // null = missing
  cost_status: SKU['cost_status'];
  cost_source: IngestionMethod;
  cost_updated_at: string;
  sources: SKU['sources'];
  availability: SKU['availability'];
  visibility: Visibility;
  visibility_rule: string;
  active_override_id?: string;
  last_edit_at: string;
  last_edit_by: string;
  is_top_seller?: boolean;
  tier_targets?: { t2?: number; t3?: number };
};

function buildSku(seed: SkuSeed): SKU {
  const box = BOX_TYPES.find(b => b.id === seed.box_type_id)!;
  const vendor = VENDORS.find(v => v.id === seed.vendor_id)!;
  const shipping = SHIPPING_CONFIGS.find(s => s.origin_country === vendor.country && s.status === 'approved') ?? SHIPPING_CONFIGS.find(s => s.origin_country === vendor.country)!;

  if (seed.farm_cost === null) {
    return {
      id: seed.id,
      vendor_id: seed.vendor_id,
      quality_family_id: seed.quality_family_id,
      vendor_sku_name: seed.vendor_sku_name,
      box_type_id: seed.box_type_id,
      stems_per_box: seed.stems_per_box,
      sources: seed.sources,
      vendor_cost_usd: null,
      cost_status: seed.cost_status,
      cost_source: seed.cost_source,
      cost_updated_at: seed.cost_updated_at,
      calculated_price_per_stem: null,
      delivery_per_stem: null,
      gpm: null,
      gpm_band: null,
      availability: seed.availability,
      visibility: seed.visibility,
      visibility_rule: seed.visibility_rule,
      active_override_id: seed.active_override_id,
      last_edit_at: seed.last_edit_at,
      last_edit_by: seed.last_edit_by,
      is_top_seller: seed.is_top_seller ?? false,
      margin_per_stem: null,
      tier_targets: seed.tier_targets,
    };
  }
  const calc = priceFromFormula({
    farm_cost: seed.farm_cost,
    box_dim_kg: box.dim_weight_kg,
    rate_per_kg: shipping.base_rate_per_kg,
    fuel_mult: shipping.fuel_surcharge_mult,
    stems_per_box: seed.stems_per_box,
  });
  return {
    id: seed.id,
    vendor_id: seed.vendor_id,
    quality_family_id: seed.quality_family_id,
    vendor_sku_name: seed.vendor_sku_name,
    box_type_id: seed.box_type_id,
    stems_per_box: seed.stems_per_box,
    sources: seed.sources,
    vendor_cost_usd: seed.farm_cost,
    cost_status: seed.cost_status,
    cost_source: seed.cost_source,
    cost_updated_at: seed.cost_updated_at,
    calculated_price_per_stem: calc.selling_price,
    delivery_per_stem: calc.delivery_per_stem,
    gpm: calc.gpm_realized,
    gpm_band: gpmBand(calc.gpm_realized),
    availability: seed.availability,
    visibility: seed.visibility,
    visibility_rule: seed.visibility_rule,
    active_override_id: seed.active_override_id,
    last_edit_at: seed.last_edit_at,
    last_edit_by: seed.last_edit_by,
    is_top_seller: seed.is_top_seller ?? false,
    margin_per_stem: Number((calc.price_ex_delivery - seed.farm_cost).toFixed(3)),
    tier_targets: seed.tier_targets,
  };
}

const W = (offsetDays: number): string => {
  // helper -- compute delivery week label from today
  const d = new Date('2026-05-15');
  d.setDate(d.getDate() + offsetDays);
  const week = Math.ceil(d.getDate() / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
};

const W19 = '2026-W19';
const W20 = '2026-W20';
const W21 = '2026-W21';
const W22 = '2026-W22';

export const SKUS: SKU[] = [
  // ==== Ecoroses (10 SKUs) -- all live, full cost coverage ====
  buildSku({
    id: 'sku_eco_mondial_60', vendor_id: 'v_ecoroses', quality_family_id: 'qf_rose_mondial_60',
    vendor_sku_name: 'Rose Mondial 60CM', box_type_id: 'bx_eco_qb', stems_per_box: 125,
    farm_cost: 0.48, cost_status: 'verified', cost_source: 'api', cost_updated_at: '2026-05-14',
    sources: [{ tier: 'k2k_live', valid: true }, { tier: 't2', valid: true, note: 'Standing commitment 2026-Q2' }],
    availability: [{ delivery_week: W20, stems: 875, source: 'k2k_live' }, { delivery_week: W21, stems: 1000, source: 'k2k_live' }, { delivery_week: W22, stems: 750, source: 't2' }],
    visibility: 'live', visibility_rule: 'auto: cost_verified AND stems>0', last_edit_at: '2026-05-14', last_edit_by: 'Rose (auto)',
    is_top_seller: true, tier_targets: { t2: 1500 },
  }),
  buildSku({
    id: 'sku_eco_freedom_60', vendor_id: 'v_ecoroses', quality_family_id: 'qf_rose_freedom_60',
    vendor_sku_name: 'Rose Freedom Red 60CM', box_type_id: 'bx_eco_qb', stems_per_box: 125,
    farm_cost: 0.46, cost_status: 'verified', cost_source: 'api', cost_updated_at: '2026-05-14',
    sources: [{ tier: 'k2k_live', valid: true }, { tier: 't2', valid: true }],
    availability: [{ delivery_week: W20, stems: 1250, source: 'k2k_live' }, { delivery_week: W21, stems: 1000, source: 'k2k_live' }],
    visibility: 'live', visibility_rule: 'auto: cost_verified AND stems>0', last_edit_at: '2026-05-14', last_edit_by: 'Rose (auto)',
    is_top_seller: true, tier_targets: { t2: 2000 },
  }),
  buildSku({
    id: 'sku_eco_antonia_60', vendor_id: 'v_ecoroses', quality_family_id: 'qf_rose_antonia_60',
    vendor_sku_name: 'Rose Antonia Garden 60CM', box_type_id: 'bx_eco_qb', stems_per_box: 125,
    farm_cost: 0.85, cost_status: 'verified', cost_source: 'api', cost_updated_at: '2026-05-14',
    sources: [{ tier: 'k2k_live', valid: true }],
    availability: [{ delivery_week: W20, stems: 500, source: 'k2k_live' }, { delivery_week: W21, stems: 625, source: 'k2k_live' }],
    visibility: 'live', visibility_rule: 'auto', last_edit_at: '2026-05-14', last_edit_by: 'Rose (auto)',
  }),
  buildSku({
    id: 'sku_eco_rainbow_50', vendor_id: 'v_ecoroses', quality_family_id: 'qf_rose_rainbow_50',
    vendor_sku_name: 'Rose Rainbow 50CM', box_type_id: 'bx_eco_qb', stems_per_box: 125,
    farm_cost: 0.55, cost_status: 'verified', cost_source: 'api', cost_updated_at: '2026-05-12',
    sources: [{ tier: 'k2k_live', valid: true }, { tier: 't2', valid: true }],
    availability: [{ delivery_week: W20, stems: 375, source: 'k2k_live' }, { delivery_week: W21, stems: 500, source: 'k2k_live' }],
    visibility: 'live', visibility_rule: 'auto', last_edit_at: '2026-05-12', last_edit_by: 'Rose (correction)',
  }),
  buildSku({
    id: 'sku_eco_quicksand_60', vendor_id: 'v_ecoroses', quality_family_id: 'qf_rose_quicksand_60',
    vendor_sku_name: 'Rose Quicksand 60CM', box_type_id: 'bx_eco_qb', stems_per_box: 125,
    farm_cost: 0.95, cost_status: 'verified', cost_source: 'api', cost_updated_at: '2026-05-08',
    sources: [{ tier: 't3', valid: true, note: 'Sourceable, no live stock today' }],
    availability: [{ delivery_week: W22, stems: 0, source: 't3' }],
    visibility: 'hidden', visibility_rule: 'auto: T3 stock=0 hidden by default', last_edit_at: '2026-05-08', last_edit_by: 'Rose (auto)',
  }),
  buildSku({
    id: 'sku_eco_freespirit_50', vendor_id: 'v_ecoroses', quality_family_id: 'qf_rose_freespirit_50',
    vendor_sku_name: 'Rose Free Spirit 50CM', box_type_id: 'bx_eco_qb', stems_per_box: 125,
    farm_cost: 0.42, cost_status: 'verified', cost_source: 'api', cost_updated_at: '2026-05-14',
    sources: [{ tier: 'k2k_live', valid: true }, { tier: 't2', valid: true }],
    availability: [{ delivery_week: W20, stems: 625, source: 'k2k_live' }, { delivery_week: W21, stems: 750, source: 'k2k_live' }],
    visibility: 'live', visibility_rule: 'auto', last_edit_at: '2026-05-14', last_edit_by: 'Rose (auto)',
    is_top_seller: true, tier_targets: { t2: 1000 },
  }),
  buildSku({
    id: 'sku_eco_coolwater_60', vendor_id: 'v_ecoroses', quality_family_id: 'qf_rose_coolwater_60',
    vendor_sku_name: 'Rose Cool Water 60CM', box_type_id: 'bx_eco_qb', stems_per_box: 125,
    farm_cost: 0.52, cost_status: 'verified', cost_source: 'api', cost_updated_at: '2026-05-14',
    sources: [{ tier: 'k2k_live', valid: true }],
    availability: [{ delivery_week: W20, stems: 500, source: 'k2k_live' }, { delivery_week: W21, stems: 500, source: 'k2k_live' }],
    visibility: 'live', visibility_rule: 'auto', last_edit_at: '2026-05-14', last_edit_by: 'Rose (auto)',
    is_top_seller: true,
  }),
  buildSku({
    id: 'sku_eco_highflame_60', vendor_id: 'v_ecoroses', quality_family_id: 'qf_rose_highflame_60',
    vendor_sku_name: 'Rose Bicolor H&F Magic 60CM', box_type_id: 'bx_eco_qb', stems_per_box: 125,
    farm_cost: 0.62, cost_status: 'verified', cost_source: 'api', cost_updated_at: '2026-05-13',
    sources: [{ tier: 'k2k_live', valid: true }],
    availability: [{ delivery_week: W20, stems: 250, source: 'k2k_live' }, { delivery_week: W21, stems: 375, source: 'k2k_live' }],
    visibility: 'live', visibility_rule: 'auto', last_edit_at: '2026-05-13', last_edit_by: 'Rose (auto)',
  }),
  buildSku({
    id: 'sku_eco_mondial_60_qbv', vendor_id: 'v_ecoroses', quality_family_id: 'qf_rose_mondial_60',
    vendor_sku_name: 'Rose Mondial 60CM QBV (premium box)', box_type_id: 'bx_eco_qbv', stems_per_box: 100,
    farm_cost: 0.55, cost_status: 'verified', cost_source: 'api', cost_updated_at: '2026-05-10',
    sources: [{ tier: 't2', valid: true, note: 'Premium pack option' }, { tier: 't3', valid: true }],
    availability: [{ delivery_week: W21, stems: 200, source: 't2' }, { delivery_week: W22, stems: 300, source: 't2' }],
    visibility: 'hidden', visibility_rule: 'manual: hidden until box_dim verified', last_edit_at: '2026-05-10', last_edit_by: 'Job (rule)',
  }),
  buildSku({
    id: 'sku_eco_freedom_60_t3', vendor_id: 'v_ecoroses', quality_family_id: 'qf_rose_freedom_60',
    vendor_sku_name: 'Rose Freedom Red 60CM (T3 sourceable)', box_type_id: 'bx_eco_qb', stems_per_box: 125,
    farm_cost: 0.50, cost_status: 'verified', cost_source: 'manual', cost_updated_at: '2026-05-05',
    sources: [{ tier: 't3', valid: true, note: '14-day min delivery, no current dispo' }],
    availability: [{ delivery_week: W22, stems: 0, source: 't3' }],
    visibility: 'hidden', visibility_rule: 'auto: T3 stock=0 hidden', last_edit_at: '2026-05-05', last_edit_by: 'Alvar (manual)',
  }),

  // ==== Magic Flowers (6 SKUs) -- partial cost (Viviana pending) ====
  buildSku({
    id: 'sku_mf_highflame_60', vendor_id: 'v_magicflowers', quality_family_id: 'qf_rose_highflame_60',
    vendor_sku_name: 'High & Flame Magic Bicolor 60CM', box_type_id: 'bx_mf_qb', stems_per_box: 125,
    farm_cost: 0.65, cost_status: 'verified', cost_source: 'api', cost_updated_at: '2026-05-14',
    sources: [{ tier: 'k2k_live', valid: true }, { tier: 't2', valid: true }],
    availability: [{ delivery_week: W20, stems: 500, source: 'k2k_live' }, { delivery_week: W21, stems: 625, source: 'k2k_live' }],
    visibility: 'live', visibility_rule: 'auto', last_edit_at: '2026-05-14', last_edit_by: 'Rose (auto)',
  }),
  buildSku({
    id: 'sku_mf_mondial_60', vendor_id: 'v_magicflowers', quality_family_id: 'qf_rose_mondial_60',
    vendor_sku_name: 'Mondial Premium 60CM', box_type_id: 'bx_mf_qb', stems_per_box: 125,
    farm_cost: 0.55, cost_status: 'verified', cost_source: 'api', cost_updated_at: '2026-05-14',
    sources: [{ tier: 'k2k_live', valid: true }],
    availability: [{ delivery_week: W20, stems: 375, source: 'k2k_live' }, { delivery_week: W21, stems: 500, source: 'k2k_live' }],
    visibility: 'live', visibility_rule: 'auto', last_edit_at: '2026-05-14', last_edit_by: 'Rose (auto)',
  }),
  buildSku({
    id: 'sku_mf_anemone_fuchsia', vendor_id: 'v_magicflowers', quality_family_id: 'qf_anemone_mariane_fuchsia',
    vendor_sku_name: 'Anemone Fuchsia Mariane 35-40CM', box_type_id: 'bx_mf_eb', stems_per_box: 120,
    farm_cost: 0.95, cost_status: 'awaiting_vendor_confirm', cost_source: 'email', cost_updated_at: '2026-05-09',
    sources: [{ tier: 't2', valid: true, note: 'Pending Viviana cost confirm' }],
    availability: [{ delivery_week: W21, stems: 240, source: 't2' }],
    visibility: 'hidden', visibility_rule: 'auto: cost_status!=verified -> hidden', last_edit_at: '2026-05-09', last_edit_by: 'Job (rule)',
    tier_targets: { t2: 480 },
  }),
  buildSku({
    id: 'sku_mf_anemone_burgundy', vendor_id: 'v_magicflowers', quality_family_id: 'qf_anemone_mariane_burgundy',
    vendor_sku_name: 'Anemone Burgundy Mariane 35CM', box_type_id: 'bx_mf_eb', stems_per_box: 120,
    farm_cost: 0.95, cost_status: 'awaiting_vendor_confirm', cost_source: 'email', cost_updated_at: '2026-05-09',
    sources: [{ tier: 't2', valid: true }],
    availability: [{ delivery_week: W21, stems: 240, source: 't2' }],
    visibility: 'hidden', visibility_rule: 'auto: cost_status!=verified', last_edit_at: '2026-05-09', last_edit_by: 'Job (rule)',
  }),
  buildSku({
    id: 'sku_mf_hydrangea_blue', vendor_id: 'v_magicflowers', quality_family_id: 'qf_hydrangea_blue',
    vendor_sku_name: 'Hydrangea Blue Premium HB', box_type_id: 'bx_mf_hb', stems_per_box: 250,
    farm_cost: 2.40, cost_status: 'verified', cost_source: 'api', cost_updated_at: '2026-05-14',
    sources: [{ tier: 'k2k_live', valid: true }],
    availability: [{ delivery_week: W20, stems: 250, source: 'k2k_live' }, { delivery_week: W21, stems: 500, source: 'k2k_live' }],
    visibility: 'live', visibility_rule: 'auto', last_edit_at: '2026-05-14', last_edit_by: 'Rose (auto)',
    is_top_seller: true,
  }),
  buildSku({
    id: 'sku_mf_hydrangea_white', vendor_id: 'v_magicflowers', quality_family_id: 'qf_hydrangea_white',
    vendor_sku_name: 'Hydrangea White Jumbo HB', box_type_id: 'bx_mf_hb', stems_per_box: 250,
    farm_cost: null, cost_status: 'missing', cost_source: 'manual', cost_updated_at: '2026-05-01',
    sources: [{ tier: 't3', valid: true, note: 'In catalog but no vendor cost yet' }],
    availability: [{ delivery_week: W22, stems: 0, source: 't3' }],
    visibility: 'draft', visibility_rule: 'auto: cost_status=missing -> draft', last_edit_at: '2026-05-01', last_edit_by: 'Job (rule)',
  }),

  // ==== Flodecol (5 SKUs) -- cost OK, FB box dims unverified ====
  buildSku({
    id: 'sku_flo_delphinium_blue', vendor_id: 'v_flodecol', quality_family_id: 'qf_delphinium_seawaltz',
    vendor_sku_name: 'Delphinium Dark Blue Sea Waltz 80CM', box_type_id: 'bx_flo_qb', stems_per_box: 200,
    farm_cost: 0.78, cost_status: 'verified', cost_source: 'api', cost_updated_at: '2026-05-14',
    sources: [{ tier: 'k2k_live', valid: true }, { tier: 't2', valid: true }],
    availability: [{ delivery_week: W20, stems: 400, source: 'k2k_live' }, { delivery_week: W21, stems: 600, source: 'k2k_live' }],
    visibility: 'live', visibility_rule: 'auto', last_edit_at: '2026-05-14', last_edit_by: 'Rose (auto)',
    is_top_seller: true, tier_targets: { t2: 800 },
  }),
  buildSku({
    id: 'sku_flo_delphinium_blue_fb', vendor_id: 'v_flodecol', quality_family_id: 'qf_delphinium_seawaltz',
    vendor_sku_name: 'Delphinium Sea Waltz 80CM FB (full box)', box_type_id: 'bx_flo_fb', stems_per_box: 400,
    farm_cost: 0.75, cost_status: 'verified', cost_source: 'api', cost_updated_at: '2026-05-13',
    sources: [{ tier: 'k2k_live', valid: true }],
    availability: [{ delivery_week: W21, stems: 400, source: 'k2k_live' }],
    visibility: 'hidden', visibility_rule: 'manual: hidden until FB box_dim verified', active_override_id: 'ovr_flo_fb_hidden',
    last_edit_at: '2026-05-13', last_edit_by: 'Job (rule)',
  }),
  buildSku({
    id: 'sku_flo_freedom_60', vendor_id: 'v_flodecol', quality_family_id: 'qf_rose_freedom_60',
    vendor_sku_name: 'Rose Freedom Red 60CM (Flodecol)', box_type_id: 'bx_flo_qb', stems_per_box: 200,
    farm_cost: 0.44, cost_status: 'verified', cost_source: 'api', cost_updated_at: '2026-05-14',
    sources: [{ tier: 'k2k_live', valid: true }],
    availability: [{ delivery_week: W20, stems: 600, source: 'k2k_live' }, { delivery_week: W21, stems: 800, source: 'k2k_live' }],
    visibility: 'live', visibility_rule: 'auto', last_edit_at: '2026-05-14', last_edit_by: 'Rose (auto)',
  }),
  buildSku({
    id: 'sku_flo_mondial_60', vendor_id: 'v_flodecol', quality_family_id: 'qf_rose_mondial_60',
    vendor_sku_name: 'Rose Mondial 60CM (Flodecol)', box_type_id: 'bx_flo_qb', stems_per_box: 200,
    farm_cost: 0.46, cost_status: 'verified', cost_source: 'api', cost_updated_at: '2026-05-14',
    sources: [{ tier: 'k2k_live', valid: true }],
    availability: [{ delivery_week: W20, stems: 600, source: 'k2k_live' }, { delivery_week: W21, stems: 600, source: 'k2k_live' }],
    visibility: 'live', visibility_rule: 'auto', last_edit_at: '2026-05-14', last_edit_by: 'Rose (auto)',
  }),
  buildSku({
    id: 'sku_flo_gyp_750', vendor_id: 'v_flodecol', quality_family_id: 'qf_gyp_millionstar_750',
    vendor_sku_name: 'Gypsophila Million Star 750g pack', box_type_id: 'bx_flo_qb', stems_per_box: 12,
    farm_cost: 4.50, cost_status: 'verified', cost_source: 'api', cost_updated_at: '2026-05-11',
    sources: [{ tier: 'k2k_live', valid: true }, { tier: 't2', valid: true }],
    availability: [{ delivery_week: W20, stems: 24, source: 'k2k_live' }, { delivery_week: W21, stems: 36, source: 'k2k_live' }],
    visibility: 'live', visibility_rule: 'auto', last_edit_at: '2026-05-11', last_edit_by: 'Rose (auto)',
  }),

  // ==== AndesColor CO (5 SKUs) -- WhatsApp ingest, low-conf mapping, shipping awaiting Facu ====
  buildSku({
    id: 'sku_and_hydrangea_blue', vendor_id: 'v_andescolor', quality_family_id: 'qf_hydrangea_blue',
    vendor_sku_name: 'Hortensia Azul Premium', box_type_id: 'bx_and_qb', stems_per_box: 120,
    farm_cost: 1.95, cost_status: 'verified', cost_source: 'whatsapp', cost_updated_at: '2026-05-13',
    sources: [{ tier: 't2', valid: true, note: 'WhatsApp voice note Carlos M.' }],
    availability: [{ delivery_week: W21, stems: 240, source: 't2' }, { delivery_week: W22, stems: 360, source: 't2' }],
    visibility: 'hidden', visibility_rule: 'auto: shipping_config awaiting_facu -> hidden', last_edit_at: '2026-05-13', last_edit_by: 'Job (rule)',
  }),
  buildSku({
    id: 'sku_and_hydrangea_white', vendor_id: 'v_andescolor', quality_family_id: 'qf_hydrangea_white',
    vendor_sku_name: 'Hortensia Blanca Jumbo', box_type_id: 'bx_and_qb', stems_per_box: 120,
    farm_cost: 1.85, cost_status: 'verified', cost_source: 'whatsapp', cost_updated_at: '2026-05-13',
    sources: [{ tier: 't2', valid: true }],
    availability: [{ delivery_week: W21, stems: 120, source: 't2' }, { delivery_week: W22, stems: 240, source: 't2' }],
    visibility: 'hidden', visibility_rule: 'auto: shipping_config awaiting_facu', last_edit_at: '2026-05-13', last_edit_by: 'Job (rule)',
  }),
  buildSku({
    id: 'sku_and_ranunculus_amandine', vendor_id: 'v_andescolor', quality_family_id: 'qf_ranunculus_amandine',
    vendor_sku_name: 'Ranunculo Amandine Surtido', box_type_id: 'bx_and_qb', stems_per_box: 120,
    farm_cost: 1.10, cost_status: 'awaiting_vendor_confirm', cost_source: 'whatsapp', cost_updated_at: '2026-05-12',
    sources: [{ tier: 't3', valid: true, note: 'WhatsApp pic, cost TBC' }],
    availability: [{ delivery_week: W22, stems: 120, source: 't3' }],
    visibility: 'draft', visibility_rule: 'auto: cost_status!=verified', last_edit_at: '2026-05-12', last_edit_by: 'Job (rule)',
  }),
  buildSku({
    id: 'sku_and_rose_mondial', vendor_id: 'v_andescolor', quality_family_id: 'qf_rose_mondial_60',
    vendor_sku_name: 'Rosa Mondial 60 (CO)', box_type_id: 'bx_and_qb', stems_per_box: 120,
    farm_cost: 0.42, cost_status: 'verified', cost_source: 'whatsapp', cost_updated_at: '2026-05-13',
    sources: [{ tier: 't2', valid: true }],
    availability: [{ delivery_week: W21, stems: 240, source: 't2' }],
    visibility: 'hidden', visibility_rule: 'auto: shipping_config awaiting_facu', last_edit_at: '2026-05-13', last_edit_by: 'Job (rule)',
  }),
  buildSku({
    id: 'sku_and_rose_cool', vendor_id: 'v_andescolor', quality_family_id: 'qf_rose_coolwater_60',
    vendor_sku_name: 'Rosa Aqua-Blue', box_type_id: 'bx_and_qb', stems_per_box: 120,
    farm_cost: 0.48, cost_status: 'awaiting_vendor_confirm', cost_source: 'whatsapp', cost_updated_at: '2026-05-12',
    sources: [{ tier: 't3', valid: true, note: 'Low-conf mapping: Aqua-Blue -> Cool Water?' }],
    availability: [{ delivery_week: W22, stems: 0, source: 't3' }],
    visibility: 'draft', visibility_rule: 'auto: mapping_confidence<0.85', last_edit_at: '2026-05-12', last_edit_by: 'Job (rule)',
  }),

  // ==== DutchFlora NL (4 SKUs) -- Email ingest, low conf, shipping awaiting Facu ====
  buildSku({
    id: 'sku_dut_peony_sarah', vendor_id: 'v_dutchflora', quality_family_id: 'qf_peony_sarah_bernhardt',
    vendor_sku_name: 'Pioenroos Sarah Bernhardt 50cm', box_type_id: 'bx_dut_eb', stems_per_box: 100,
    farm_cost: 1.85, cost_status: 'verified', cost_source: 'email', cost_updated_at: '2026-05-12',
    sources: [{ tier: 't2', valid: true, note: 'Weekly avail email' }, { tier: 't3', valid: true }],
    availability: [{ delivery_week: W21, stems: 200, source: 't2' }, { delivery_week: W22, stems: 300, source: 't2' }],
    visibility: 'hidden', visibility_rule: 'auto: shipping_config awaiting_facu', last_edit_at: '2026-05-12', last_edit_by: 'Job (rule)',
    tier_targets: { t2: 400, t3: 600 },
  }),
  buildSku({
    id: 'sku_dut_peony_coral', vendor_id: 'v_dutchflora', quality_family_id: 'qf_peony_coral_charm',
    vendor_sku_name: 'Pioenroos Coral Charm 50cm', box_type_id: 'bx_dut_eb', stems_per_box: 100,
    farm_cost: 2.10, cost_status: 'verified', cost_source: 'email', cost_updated_at: '2026-05-12',
    sources: [{ tier: 't2', valid: true }],
    availability: [{ delivery_week: W21, stems: 100, source: 't2' }, { delivery_week: W22, stems: 200, source: 't2' }],
    visibility: 'hidden', visibility_rule: 'auto: shipping_config awaiting_facu', last_edit_at: '2026-05-12', last_edit_by: 'Job (rule)',
  }),
  buildSku({
    id: 'sku_dut_anemone_burgundy', vendor_id: 'v_dutchflora', quality_family_id: 'qf_anemone_mariane_burgundy',
    vendor_sku_name: 'Anemone Mariane Bordeaux', box_type_id: 'bx_dut_eb', stems_per_box: 100,
    farm_cost: 0.85, cost_status: 'awaiting_vendor_confirm', cost_source: 'email', cost_updated_at: '2026-05-10',
    sources: [{ tier: 't3', valid: true, note: 'Email PDF, cost partially parsed' }],
    availability: [{ delivery_week: W22, stems: 0, source: 't3' }],
    visibility: 'draft', visibility_rule: 'auto: cost_status!=verified', last_edit_at: '2026-05-10', last_edit_by: 'Job (rule)',
  }),
  buildSku({
    id: 'sku_dut_ranunculus', vendor_id: 'v_dutchflora', quality_family_id: 'qf_ranunculus_amandine',
    vendor_sku_name: 'Ranonkel Amandine Mix', box_type_id: 'bx_dut_eb', stems_per_box: 100,
    farm_cost: null, cost_status: 'missing', cost_source: 'email', cost_updated_at: '2026-05-08',
    sources: [{ tier: 't3', valid: true, note: 'Listed in PDF, cost field blank' }],
    availability: [{ delivery_week: W22, stems: 0, source: 't3' }],
    visibility: 'draft', visibility_rule: 'auto: cost_status=missing', last_edit_at: '2026-05-08', last_edit_by: 'Job (rule)',
  }),
];

// ============================================================================
// HELPERS for screens
// ============================================================================

export function getVendor(id: string): Vendor | undefined {
  return VENDORS.find(v => v.id === id);
}

export function getQualityFamily(id: string): QualityFamily | undefined {
  return QUALITY_FAMILIES.find(q => q.id === id);
}

export function getBoxType(id: string): BoxType | undefined {
  return BOX_TYPES.find(b => b.id === id);
}

export function getSku(id: string): SKU | undefined {
  return SKUS.find(s => s.id === id);
}

export function getShippingForVendor(vendorId: string): ShippingConfig | undefined {
  const vendor = getVendor(vendorId);
  if (!vendor) return undefined;
  return SHIPPING_CONFIGS.find(s => s.origin_country === vendor.country);
}

export function sumAvailability(sku: SKU): number {
  return sku.availability.reduce((sum, a) => sum + a.stems, 0);
}

export function formatPrice(n: number | null): string {
  if (n === null) return '--';
  return `$${n.toFixed(2)}`;
}

export function formatGpm(n: number | null): string {
  if (n === null) return '--';
  return `${(n * 100).toFixed(1)}%`;
}
