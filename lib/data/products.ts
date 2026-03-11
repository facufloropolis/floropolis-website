// Product catalog adapter.
// Master dataset generated from Supabase via scripts/generate-products.mjs

import type { Product as RawProduct } from "./floropolis_products";
import {
  products as rawProducts,
  PROMO_CODES as RAW_PROMO_CODES,
} from "./floropolis_products";

export type Product = RawProduct & { compare_at_price?: number };

export const PROMO_CODES = RAW_PROMO_CODES;

/**
 * Runtime discount: 10% off all assorted boxes and combos.
 * Applied as deal_price if the product doesn't already have one.
 */
function isAssortedOrCombo(p: RawProduct): boolean {
  return (
    p.color?.toLowerCase().includes("assorted") ||
    p.variety?.toLowerCase().includes("combo box") ||
    p.category === "Mixed Boxes"
  );
}

/**
 * Runtime bestseller flag based on market demand + competitive advantage.
 * Source: Alvar's inventory status (Mar 6) + Facu's direction.
 * Tropicals = exclusive (only us), Delphiniums/Ranunculus = high value, key rose varieties.
 */
const BESTSELLER_VARIETIES = new Set([
  // Tropicals — EXCLUSIVE to Floropolis via Magic Flowers
  "anthurium", "bird of paradise", "heliconia", "ginger",
  // Delphiniums — competitive, beautiful, 4 sizes
  "bella andes", "serene", "sky waltz", "pacific",
  // Ranunculus — high perceived value
  "amandine", "elegance",
  // Anemone — unique varieties
  "fullstar",
  // Key roses — volume drivers
  "freedom", "explorer", "quicksand", "playa blanca",
]);

function isBestseller(p: RawProduct): boolean {
  if (p.is_best_seller) return true;
  const v = p.variety?.toLowerCase() || "";
  return BESTSELLER_VARIETIES.has(v);
}

/** Sanitize slugs that contain URL-unsafe characters (e.g. "&") */
function sanitizeSlug(slug: string): string {
  return slug
    .replace(/&/g, "and")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Compare-at price: market rate (25% above our price).
 * Shows as strikethrough to highlight Floropolis value.
 * Rounded up to nearest $0.05 for clean display.
 */
function computeCompareAt(price: number): number {
  return Math.ceil(price * 1.25 * 20) / 20;
}

export const products: Product[] = rawProducts.map((p) => {
  let result: Product = {
    ...p,
    slug: sanitizeSlug(p.slug),
    compare_at_price: p.price > 0 ? computeCompareAt(p.price) : undefined,
  };

  // Apply assorted/combo discount
  if (isAssortedOrCombo(p) && !p.is_on_deal && p.price != null) {
    result = {
      ...result,
      is_on_deal: true,
      deal_price: Math.round(p.price * 0.9 * 100) / 100,
      deal_label: "10% Off",
    };
  }

  // Apply bestseller flag
  if (isBestseller(p) && !p.is_best_seller) {
    result = { ...result, is_best_seller: true };
  }

  return result;
});
