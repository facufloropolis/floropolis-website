// Pure cart totals computation.
// v1 | 2026-05-17 | Job_PM W3-S9 [V8 SHADOW]
// Pure function — no IO, no side effects. Easy to unit-test, easy to reason about.
// Reads SKU snapshots from a Map (caller fetches from floropolis_inventory_mirror).
//
// Money is stored as numeric(12,2) in DB; here we work in plain JS numbers but ALL
// arithmetic is rounded to 2dp at line + total boundaries (no float drift). The
// webhook layer converts to integer cents before talking to Stripe.
//
// D1 schema decisions enforced here:
//   - shipping_total = 0  (D1 punted shipping; D7 will compute)
//   - tax_total      = 0  (D1 punted tax; D7 will compute via Stripe Tax)
//   - discount_total = 0  (D1 punted promo codes; D2 scope)

export interface CartItem {
  sku_id: number;
  quantity: number;
}

export interface SkuMirrorSnapshot {
  id: number;
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
  sku_id: number;
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
  tax_total: 0;
  discount_total: 0;
  grand_total: number;
  currency: 'USD';
}

export class TotalsError extends Error {
  code: 'sku_missing' | 'quantity_invalid' | 'amount_negative' | 'empty_cart';
  sku_id?: number;
  constructor(
    code: TotalsError['code'],
    message: string,
    sku_id?: number,
  ) {
    super(message);
    this.code = code;
    this.sku_id = sku_id;
    this.name = 'TotalsError';
  }
}

/** Round to 2 decimal places (avoids floating-point drift across line items). */
function r2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Compute cart totals from cart items + mirror snapshots.
 * Pure. Throws TotalsError on any invalid input.
 */
export function computeTotals(
  items: CartItem[],
  mirror: Map<number, SkuMirrorSnapshot>,
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

  return {
    lines,
    subtotal,
    shipping_total: 0,
    tax_total: 0,
    discount_total: 0,
    grand_total: subtotal, // D1: grand_total == subtotal (no shipping/tax/discount yet)
    currency: 'USD',
  };
}

// ============================================================================
// Quick smoke tests — run with: npx tsx lib/checkout/totals.ts
// Not a real test framework (project has none); inline asserts so we don't add
// dev deps. If you add jest/vitest later, port these.
// ============================================================================
if (require.main === module) {
  const mirror = new Map<number, SkuMirrorSnapshot>([
    [
      6676,
      {
        id: 6676,
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
      6677,
      {
        id: 6677,
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
      { sku_id: 6676, quantity: 100 },
      { sku_id: 6677, quantity: 5 },
    ],
    mirror,
  );
  console.assert(totals.subtotal === 1372.5, `subtotal expected 1372.5 got ${totals.subtotal}`);
  console.assert(totals.lines[1].is_on_deal_at_lock === true, 'line 2 should be on deal');
  console.assert(totals.grand_total === totals.subtotal, 'grand_total == subtotal in D1');

  try {
    computeTotals([{ sku_id: 9999, quantity: 1 }], mirror);
    console.assert(false, 'should have thrown sku_missing');
  } catch (e) {
    console.assert(
      e instanceof TotalsError && e.code === 'sku_missing',
      'expected TotalsError sku_missing',
    );
  }

  try {
    computeTotals([{ sku_id: 6676, quantity: 0 }], mirror);
    console.assert(false, 'should have thrown quantity_invalid');
  } catch (e) {
    console.assert(
      e instanceof TotalsError && e.code === 'quantity_invalid',
      'expected TotalsError quantity_invalid',
    );
  }

  console.log('lib/checkout/totals.ts smoke tests passed');
}
