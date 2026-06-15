// Pure cart totals computation.
// v3 | 2026-06-15 | Job_PM — buy_path_identity_and_price_coherence: sku_id
//      identity is now the catalog_published uuid (string), not the legacy int.
//      Snapshots come from the published static catalog (lib/checkout/
//      catalog-source.ts), NOT floropolis_inventory_mirror — so the price here
//      equals the price the storefront showed (shown == charged).
// v2 | 2026-05-19 | Job_PM [V8 SHADOW] — T2 tax + Phase D discount integration
// v1 | 2026-05-17 | Job_PM W3-S9 [V8 SHADOW]
// Pure function — no IO, no side effects. Easy to unit-test, easy to reason about.
// Reads SKU snapshots from a Map keyed by uuid (caller builds it from the
// published static catalog via getPublishedSkuMap()).
//
// Money is stored as numeric(12,2) in DB; here we work in plain JS numbers but ALL
// arithmetic is rounded to 2dp at line + total boundaries (no float drift). The
// webhook layer converts to integer cents before talking to Stripe.
//
// Math order (locked 2026-05-19):
//   subtotal   = sum(line_total_locked)
//   taxable    = max(subtotal - discount, 0)
//   tax_total  = taxable * tax_rate (0 if B2B / EIN present / no state row)
//   grand      = taxable + tax_total + shipping_total
//
// Shipping still punted to 0 (D7). Discount + tax both real as of v2.

export interface CartItem {
  /** Catalog_published SKU uuid — the cart identity. */
  sku_id: string;
  quantity: number;
}

export interface SkuMirrorSnapshot {
  /** Catalog_published SKU uuid — resolution key. */
  id: string;
  /** Legacy FNV-hashed int id, kept only for the order_lines.sku_id bigint
   *  NOT NULL column (never used as identity). */
  legacy_id: number;
  name: string;
  variety: string | null;
  length: string | null;
  unit: string | null;
  vendor: string | null;
  price: number;
  is_on_deal: boolean;
  deal_price: number | null;
}

export interface CartLine {
  /** Catalog_published SKU uuid. */
  sku_id: string;
  /** Legacy int id for the order_lines.sku_id bigint column. */
  legacy_id: number;
  sku_name_snapshot: string;
  sku_variety_snapshot: string | null;
  sku_length_snapshot: string | null;
  sku_unit_snapshot: string | null;
  sku_vendor_snapshot: string | null;
  quantity: number;
  unit_price_locked: number;
  line_total_locked: number;
  catalog_price_at_lock: number;
  is_on_deal_at_lock: boolean;
}

export interface CartTotals {
  lines: CartLine[];
  subtotal: number;
  shipping_total: 0;
  tax_total: number;
  discount_total: number;
  grand_total: number;
  tax_treatment: 'B2B' | 'B2C';
  tax_rate_pct: number; // 0..1, e.g. 0.06 for FL B2C
  tax_state: string | null; // 'FL' / 'NY' / null if B2B
  currency: 'USD';
}

export interface TotalsOptions {
  /** Discount applied BEFORE tax. Phase D wires this from /api/checkout/session
   *  after consuming a discount_rules row. Always >= 0. Clamped at subtotal. */
  discount_amount?: number;
  /** Shipping state from the shipping_address. Two-letter US code. */
  shipping_state?: string | null;
  /** EIN (XX-XXXXXXX). If non-empty + 9 digits, switches to B2B (no tax). */
  ein?: string | null;
  /** Optional map of state_code -> rate_pct (0..1). Caller fetches from
   *  us_state_sales_tax. If omitted or state missing, tax = 0. */
  taxRates?: Map<string, number>;
}

export class TotalsError extends Error {
  code: 'sku_missing' | 'quantity_invalid' | 'amount_negative' | 'empty_cart';
  sku_id?: string;
  constructor(
    code: TotalsError['code'],
    message: string,
    sku_id?: string,
  ) {
    super(message);
    this.code = code;
    this.sku_id = sku_id;
    this.name = 'TotalsError';
  }
}

/** EIN format check: exactly 9 digits, optionally formatted as XX-XXXXXXX.
 *  Returns the normalized digits (XXXXXXXXX) if valid, null otherwise. */
export function normalizeEIN(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length !== 9) return null;
  return digits;
}

/** Format 9 digits as XX-XXXXXXX (display). Returns input as-is if not 9 digits. */
export function formatEIN(raw: string | null | undefined): string {
  const norm = normalizeEIN(raw);
  if (!norm) return raw ?? '';
  return `${norm.slice(0, 2)}-${norm.slice(2)}`;
}

/** Round to 2 decimal places (avoids floating-point drift across line items). */
function r2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Compute cart totals from cart items + mirror snapshots.
 * Pure. Throws TotalsError on any invalid input.
 *
 * v2 (2026-05-19): accepts options to layer in discount (Phase D) + tax (T2).
 *   Order: subtotal -> discount -> tax on (subtotal - discount) -> grand_total.
 *   B2B (EIN present + valid) always yields tax_total=0 regardless of state.
 */
export function computeTotals(
  items: CartItem[],
  mirror: Map<string, SkuMirrorSnapshot>,
  options: TotalsOptions = {},
): CartTotals {
  if (!items || items.length === 0) {
    throw new TotalsError('empty_cart', 'Cart has no items');
  }

  const lines: CartLine[] = items.map((it) => {
    if (!Number.isInteger(it.quantity) || it.quantity <= 0) {
      throw new TotalsError(
        'quantity_invalid',
        `quantity must be a positive integer (got ${it.quantity} for sku ${it.sku_id})`,
        it.sku_id,
      );
    }

    const snap = mirror.get(it.sku_id);
    if (!snap) {
      throw new TotalsError(
        'sku_missing',
        `sku_id ${it.sku_id} not in inventory mirror`,
        it.sku_id,
      );
    }

    const catalog_price = Number(snap.price);
    if (!Number.isFinite(catalog_price) || catalog_price < 0) {
      throw new TotalsError(
        'amount_negative',
        `sku ${it.sku_id} has invalid price ${snap.price}`,
        it.sku_id,
      );
    }

    const is_on_deal = !!snap.is_on_deal && snap.deal_price != null;
    const unit_price_locked = r2(
      is_on_deal ? Number(snap.deal_price) : catalog_price,
    );
    const line_total_locked = r2(unit_price_locked * it.quantity);

    return {
      sku_id: it.sku_id,
      legacy_id: snap.legacy_id,
      sku_name_snapshot: snap.name,
      sku_variety_snapshot: snap.variety,
      sku_length_snapshot: snap.length,
      sku_unit_snapshot: snap.unit,
      sku_vendor_snapshot: snap.vendor,
      quantity: it.quantity,
      unit_price_locked,
      line_total_locked,
      catalog_price_at_lock: r2(catalog_price),
      is_on_deal_at_lock: is_on_deal,
    };
  });

  const subtotal = r2(lines.reduce((s, l) => s + l.line_total_locked, 0));

  // ---- Discount (Phase D) — clamped to subtotal, never negative ----
  const rawDiscount = options.discount_amount ?? 0;
  const discount_total = r2(Math.max(0, Math.min(subtotal, Number(rawDiscount) || 0)));
  const taxable = r2(Math.max(0, subtotal - discount_total));

  // ---- Tax (T2) — EIN switches to B2B regardless of state ----
  const einDigits = normalizeEIN(options.ein);
  let tax_treatment: 'B2B' | 'B2C';
  let tax_rate_pct = 0;
  let tax_state: string | null = null;
  let tax_total = 0;
  if (einDigits) {
    tax_treatment = 'B2B';
  } else {
    tax_treatment = 'B2C';
    const state = (options.shipping_state ?? '').trim().toUpperCase();
    if (state && options.taxRates && options.taxRates.has(state)) {
      tax_state = state;
      tax_rate_pct = Number(options.taxRates.get(state)) || 0;
      tax_total = r2(taxable * tax_rate_pct);
    } else if (state) {
      // Known state without a configured rate is recorded but produces 0 tax
      // (placeholder per CEO 2026-05-19 — non-seeded states default to 0).
      tax_state = state;
    }
  }

  const grand_total = r2(taxable + tax_total /* + shipping_total when D7 lands */);

  return {
    lines,
    subtotal,
    shipping_total: 0,
    tax_total,
    discount_total,
    grand_total,
    tax_treatment,
    tax_rate_pct,
    tax_state,
    currency: 'USD',
  };
}

// ============================================================================
// Quick smoke tests — run with: npx tsx lib/checkout/totals.ts
// Not a real test framework (project has none); inline asserts so we don't add
// dev deps. If you add jest/vitest later, port these.
// ============================================================================
if (require.main === module) {
  // Identity is the uuid string now (v3). legacy_id is the bigint-column value.
  const SKU_A = '11111111-1111-1111-1111-111111111111';
  const SKU_B = '22222222-2222-2222-2222-222222222222';
  const mirror = new Map<string, SkuMirrorSnapshot>([
    [
      SKU_A,
      {
        id: SKU_A,
        legacy_id: 6676,
        name: 'Rose Freedom 50cm',
        variety: 'Freedom',
        length: '50cm',
        unit: 'Bunch',
        vendor: 'Esmeralda',
        price: 12.5,
        is_on_deal: false,
        deal_price: null,
      },
    ],
    [
      SKU_B,
      {
        id: SKU_B,
        legacy_id: 6677,
        name: 'Hydrangea Jumbo',
        variety: 'Mophead',
        length: '60cm',
        unit: 'Bunch',
        vendor: 'Alex',
        price: 30.0,
        is_on_deal: true,
        deal_price: 24.5,
      },
    ],
  ]);

  const totals = computeTotals(
    [
      { sku_id: SKU_A, quantity: 100 },
      { sku_id: SKU_B, quantity: 5 },
    ],
    mirror,
  );
  console.assert(totals.subtotal === 1372.5, `subtotal expected 1372.5 got ${totals.subtotal}`);
  console.assert(totals.lines[1].is_on_deal_at_lock === true, 'line 2 should be on deal');
  console.assert(totals.grand_total === totals.subtotal, 'grand_total == subtotal when no tax/discount');
  console.assert(totals.tax_treatment === 'B2C', 'default to B2C');
  console.assert(totals.tax_total === 0, 'no tax when no state passed');

  // T2: B2C with FL state -> 6% tax
  const rates = new Map<string, number>([['FL', 0.06], ['NY', 0.04]]);
  const flTotals = computeTotals(
    [{ sku_id: SKU_A, quantity: 10 }], // 10 * 12.5 = 125
    mirror,
    { shipping_state: 'FL', taxRates: rates },
  );
  console.assert(flTotals.subtotal === 125, `FL subtotal 125 got ${flTotals.subtotal}`);
  console.assert(flTotals.tax_total === 7.5, `FL tax 7.5 got ${flTotals.tax_total}`);
  console.assert(flTotals.grand_total === 132.5, `FL grand 132.5 got ${flTotals.grand_total}`);

  // T2: EIN switches to B2B -> tax = 0
  const b2bTotals = computeTotals(
    [{ sku_id: SKU_A, quantity: 10 }],
    mirror,
    { shipping_state: 'FL', taxRates: rates, ein: '12-3456789' },
  );
  console.assert(b2bTotals.tax_treatment === 'B2B', 'EIN -> B2B');
  console.assert(b2bTotals.tax_total === 0, 'B2B tax must be 0');
  console.assert(b2bTotals.grand_total === 125, `B2B grand 125 got ${b2bTotals.grand_total}`);

  // Phase D: discount applies before tax
  const discTotals = computeTotals(
    [{ sku_id: SKU_A, quantity: 10 }],
    mirror,
    { shipping_state: 'FL', taxRates: rates, discount_amount: 25 },
  );
  console.assert(discTotals.discount_total === 25, 'discount applied');
  // taxable = 125 - 25 = 100. tax = 6. grand = 106.
  console.assert(discTotals.tax_total === 6, `tax-after-disc 6 got ${discTotals.tax_total}`);
  console.assert(discTotals.grand_total === 106, `grand 106 got ${discTotals.grand_total}`);

  // EIN normalization
  console.assert(normalizeEIN('12-3456789') === '123456789', 'EIN normalize');
  console.assert(normalizeEIN('123456789') === '123456789', 'EIN raw 9 digits');
  console.assert(normalizeEIN('12-345678') === null, 'EIN 8 digits invalid');
  console.assert(formatEIN('123456789') === '12-3456789', 'EIN format');

  try {
    computeTotals([{ sku_id: "99999999-9999-9999-9999-999999999999", quantity: 1 }], mirror);
    console.assert(false, 'should have thrown sku_missing');
  } catch (e) {
    console.assert(
      e instanceof TotalsError && e.code === 'sku_missing',
      'expected TotalsError sku_missing',
    );
  }

  try {
    computeTotals([{ sku_id: SKU_A, quantity: 0 }], mirror);
    console.assert(false, 'should have thrown quantity_invalid');
  } catch (e) {
    console.assert(
      e instanceof TotalsError && e.code === 'quantity_invalid',
      'expected TotalsError quantity_invalid',
    );
  }

  console.log('lib/checkout/totals.ts smoke tests passed');
}
