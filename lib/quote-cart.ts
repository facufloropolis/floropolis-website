export interface QuoteItem {
  slug: string;
  name: string;
  category: string;
  vendor: string;
  price: number;
  deal_price?: number | null;
  quantity: number;
  units_per_box: number;
  box_type: string;
  unit: string;
  delivery_date?: string; // ISO date string YYYY-MM-DD
  stem_length?: string;
}

const STORAGE_KEY = "floropolis_quote_cart";

function readCart(): QuoteItem[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as QuoteItem[];
  } catch {
    // ignore
  }
  return [];
}

function writeCart(items: QuoteItem[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent("quote-cart-updated"));
}

export function getCartItems(): QuoteItem[] {
  return readCart();
}

export function addItem(item: QuoteItem) {
  const cart = readCart();
  const existingIndex = cart.findIndex(
    (i) =>
      i.slug === item.slug &&
      i.box_type === item.box_type &&
      i.units_per_box === item.units_per_box &&
      i.delivery_date === item.delivery_date,
  );
  if (existingIndex >= 0) {
    cart[existingIndex].quantity += item.quantity;
  } else {
    cart.push(item);
  }
  writeCart(cart);
}

export function removeItem(slug: string, box_type: string, units_per_box: number, delivery_date?: string) {
  const cart = readCart().filter(
    (i) =>
      !(i.slug === slug && i.box_type === box_type && i.units_per_box === units_per_box && i.delivery_date === delivery_date),
  );
  writeCart(cart);
}

export function updateQuantity(
  slug: string,
  box_type: string,
  units_per_box: number,
  quantity: number,
  delivery_date?: string,
) {
  const cart = readCart();
  const idx = cart.findIndex(
    (i) =>
      i.slug === slug && i.box_type === box_type && i.units_per_box === units_per_box && i.delivery_date === delivery_date,
  );
  if (idx >= 0) {
    cart[idx].quantity = Math.max(1, quantity);
    writeCart(cart);
  }
}

export function updateItemDeliveryDate(
  slug: string,
  box_type: string,
  units_per_box: number,
  oldDate: string | undefined,
  newDate: string,
) {
  const cart = readCart();
  const idx = cart.findIndex(
    (i) =>
      i.slug === slug && i.box_type === box_type && i.units_per_box === units_per_box && i.delivery_date === oldDate,
  );
  if (idx >= 0) {
    cart[idx].delivery_date = newDate;
    writeCart(cart);
  }
}

export function clearCart() {
  writeCart([]);
}

export function getItemCount(): number {
  return readCart().reduce((sum, item) => sum + item.quantity, 0);
}

export function getSubtotal(): number {
  return readCart().reduce((sum, item) => {
    const unitPrice = item.deal_price ?? item.price;
    return sum + unitPrice * item.quantity * item.units_per_box;
  }, 0);
}

/** Get unique delivery dates in the cart */
export function getCartDeliveryDates(): string[] {
  const dates = new Set<string>();
  for (const item of readCart()) {
    if (item.delivery_date) dates.add(item.delivery_date);
  }
  return Array.from(dates).sort();
}

/** Check if cart has multiple delivery dates */
export function hasMultipleDeliveryDates(): boolean {
  return getCartDeliveryDates().length > 1;
}
