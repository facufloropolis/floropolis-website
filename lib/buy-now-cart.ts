// buy-now-cart — proposal/mockup-only checkout cart helper.
// v1 | 2026-05-17 | Job_PM W5-S16 [V8 SHADOW]
//
// Separate from lib/quote-cart.ts on purpose. Quote flow is production-critical
// (writes to legacy /quote review pipeline). Buy-now flow is the new direct-to-
// Stripe path used by /checkout. Keeping the two carts independent means a bug
// in one cannot corrupt the other, and both can ship on the same page.
//
// localStorage key matches what app/checkout/page.tsx already reads:
//   key:   "floropolis-cart"
//   value: { items: [{sku_id: string, quantity: number}], delivery_date?: "YYYY-MM-DD" }
//
// sku_id is the real catalog_published SKU uuid (Product.sku_id), NOT the legacy
// FNV-hashed Product.id. Carrying the uuid end-to-end is what lets checkout
// resolve the cart against the same published catalog the storefront displayed
// (see lib/checkout/catalog-source.ts). Legacy numeric entries (pre-fix carts)
// are tolerated + discarded on read so a stale cart can't crash the page.
//
// All functions are SSR-safe (no-op when window is undefined). Writes dispatch
// both a CustomEvent (same-tab) and the native "storage" event handles
// cross-tab updates for free — listeners only need to subscribe to one.

export interface BuyNowCartItem {
  sku_id: string;
  quantity: number;
}

export interface BuyNowCart {
  items: BuyNowCartItem[];
  delivery_date?: string; // YYYY-MM-DD
}

export const BUY_NOW_CART_KEY = "floropolis-cart";
export const BUY_NOW_CART_EVENT = "buy-now-cart-updated";

function readCart(): BuyNowCart {
  if (typeof window === "undefined") return { items: [] };
  try {
    const raw = window.localStorage.getItem(BUY_NOW_CART_KEY);
    if (!raw) return { items: [] };
    const parsed = JSON.parse(raw) as Partial<BuyNowCart>;
    if (!parsed || !Array.isArray(parsed.items)) return { items: [] };
    const items: BuyNowCartItem[] = (parsed.items as Array<{ sku_id?: unknown; quantity?: unknown }>)
      .map((x) => ({
        // Identity is the uuid string. Legacy numeric ids (pre-fix carts) are
        // coerced to string here but won't resolve in the published catalog ->
        // they surface as sku_missing rather than throwing. Discard empties.
        sku_id: x != null && x.sku_id != null ? String(x.sku_id).trim() : "",
        quantity: Number(x?.quantity),
      }))
      .filter(
        (x): x is BuyNowCartItem =>
          x.sku_id.length > 0 &&
          Number.isInteger(x.quantity) &&
          x.quantity > 0,
      );
    return { items, delivery_date: parsed.delivery_date };
  } catch {
    return { items: [] };
  }
}

function writeCart(cart: BuyNowCart): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(BUY_NOW_CART_KEY, JSON.stringify(cart));
    window.dispatchEvent(new CustomEvent(BUY_NOW_CART_EVENT));
  } catch {
    // localStorage can throw (quota, private mode). Fail silently — the UI
    // will just show no items, same as the empty-cart state.
  }
}

/**
 * Add a SKU to the cart. If the SKU is already present, sum the quantities so
 * a customer clicking "Buy now" twice ends up with the expected count.
 */
export function addToBuyNowCart(skuId: string, quantity: number = 1): void {
  if (typeof window === "undefined") return;
  const qty = Math.max(1, Math.floor(quantity));
  const cart = readCart();
  const idx = cart.items.findIndex((i) => i.sku_id === skuId);
  if (idx >= 0) {
    cart.items[idx] = { ...cart.items[idx], quantity: cart.items[idx].quantity + qty };
  } else {
    cart.items.push({ sku_id: skuId, quantity: qty });
  }
  writeCart(cart);
}

/** Read the current cart (always safe to call; returns empty cart on SSR). */
export function getBuyNowCart(): BuyNowCart {
  return readCart();
}

/** Remove a single SKU from the cart. No-op if it isn't present. */
export function removeFromBuyNowCart(skuId: string): void {
  if (typeof window === "undefined") return;
  const cart = readCart();
  const next = cart.items.filter((i) => i.sku_id !== skuId);
  if (next.length === cart.items.length) return;
  writeCart({ ...cart, items: next });
}

/** Wipe the cart (used after a successful checkout). */
export function clearBuyNowCart(): void {
  if (typeof window === "undefined") return;
  writeCart({ items: [] });
}

/** Total quantity across all SKUs — used for the nav badge. */
export function buyNowCartCount(): number {
  return readCart().items.reduce((sum, i) => sum + i.quantity, 0);
}

/**
 * Optional: set the delivery date on the cart. /checkout reads this if
 * present and pre-selects it. Pass undefined to clear.
 */
export function setBuyNowDeliveryDate(date: string | undefined): void {
  if (typeof window === "undefined") return;
  const cart = readCart();
  writeCart({ ...cart, delivery_date: date });
}
