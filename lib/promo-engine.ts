/**
 * Promo Engine — supports multiple discount types for Floropolis.
 *
 * Types supported:
 * 1. Percentage discount (% off subtotal or qualifying items)
 * 2. Fixed amount discount ($ off)
 * 3. Category-scoped (only applies to specific categories)
 * 4. Vendor-scoped (only applies to specific vendors)
 * 5. Product-scoped (only applies to specific product slugs)
 * 6. Referral codes (flat discount for referred customers)
 * 7. Minimum order requirement
 * 8. First-order only
 *
 * Promo codes are stored in floropolis_products.ts PROMO_CODES
 * and can be extended here with additional runtime promos.
 */

import { PROMO_CODES } from "@/lib/data/products";

export interface PromoCode {
  code: string;
  discount_type: "percentage" | "fixed";
  discount_value: number; // % or $ amount
  scope: "all" | "vendor" | "category" | "product";
  scope_filter: string; // comma-separated list of matching values
  expiry: string; // ISO date
  active: boolean;
  min_order?: number; // minimum subtotal to apply
  first_order_only?: boolean;
  referral_source?: string; // who referred (for tracking)
  description?: string; // human-readable description
  max_uses?: number; // max total uses (null = unlimited)
}

export interface CartItem {
  slug: string;
  vendor?: string | null;
  category: string;
  price: number;
  deal_price?: number | null;
  quantity: number;
  units_per_box: number;
}

export interface PromoResult {
  valid: boolean;
  error?: string;
  discount_type?: "percentage" | "fixed";
  discount_value?: number;
  discount_amount?: number; // calculated $ discount
  qualifying_items?: number;
  scope_label?: string;
  description?: string;
}

// Additional promos not in the product file (runtime/dynamic promos)
// These can be managed via Supabase in the future
const ADDITIONAL_PROMOS: PromoCode[] = [
  // Referral program — placeholder codes
  // {
  //   code: "FRIEND20",
  //   discount_type: "percentage",
  //   discount_value: 20,
  //   scope: "all",
  //   scope_filter: "",
  //   expiry: "2026-12-31",
  //   active: true,
  //   first_order_only: true,
  //   referral_source: "referral_program",
  //   description: "20% off your first order (referred by a friend)",
  // },
];

function getAllPromos(): Record<string, PromoCode> {
  const all: Record<string, PromoCode> = {};

  // From product catalog
  for (const [code, promo] of Object.entries(PROMO_CODES)) {
    all[code] = {
      code,
      ...promo,
      discount_type: promo.discount_type as "percentage" | "fixed",
      scope: promo.scope as "all" | "vendor" | "category" | "product",
    };
  }

  // Additional runtime promos
  for (const promo of ADDITIONAL_PROMOS) {
    if (promo.active) {
      all[promo.code] = promo;
    }
  }

  return all;
}

export function validatePromoCode(
  code: string,
  cartItems: CartItem[],
  subtotal: number,
  isFirstOrder: boolean = false,
): PromoResult {
  const promos = getAllPromos();
  const promo = promos[code.toUpperCase()];

  if (!promo) return { valid: false, error: "Invalid promo code" };
  if (!promo.active) return { valid: false, error: "This code is no longer active" };
  if (new Date(promo.expiry) < new Date())
    return { valid: false, error: "This code has expired" };
  if (promo.first_order_only && !isFirstOrder)
    return { valid: false, error: "This code is for first orders only" };
  if (promo.min_order && subtotal < promo.min_order)
    return {
      valid: false,
      error: `Minimum order of $${promo.min_order.toFixed(2)} required`,
    };

  // Find qualifying items
  const filters = promo.scope_filter
    ? promo.scope_filter.split(",").map((s) => s.trim())
    : [];

  const qualifyingItems = cartItems.filter((item) => {
    if (promo.scope === "all") return true;
    if (promo.scope === "vendor") return filters.includes(item.vendor || "");
    if (promo.scope === "category") return filters.includes(item.category);
    if (promo.scope === "product") return filters.includes(item.slug);
    return false;
  });

  if (qualifyingItems.length === 0 && promo.scope !== "all") {
    return {
      valid: false,
      error: `This code applies to ${promo.scope_filter} items only`,
    };
  }

  // Calculate discount
  let discountAmount = 0;

  if (promo.discount_type === "percentage") {
    if (promo.scope === "all") {
      discountAmount = subtotal * (promo.discount_value / 100);
    } else {
      // Calculate subtotal of qualifying items only
      const qualifyingSubtotal = qualifyingItems.reduce((sum, item) => {
        const price = item.deal_price ?? item.price;
        return sum + price * item.quantity * item.units_per_box;
      }, 0);
      discountAmount = qualifyingSubtotal * (promo.discount_value / 100);
    }
  } else {
    // Fixed discount
    discountAmount = Math.min(promo.discount_value, subtotal);
  }

  return {
    valid: true,
    discount_type: promo.discount_type,
    discount_value: promo.discount_value,
    discount_amount: Math.round(discountAmount * 100) / 100,
    qualifying_items: qualifyingItems.length,
    scope_label: promo.scope_filter || "entire order",
    description: promo.description,
  };
}
