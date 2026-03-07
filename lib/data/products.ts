// Thin adapter around the generated desktop catalog file.
// This keeps the rest of the app importing from "@/lib/data/products",
// while the master dataset lives in /Users/facu/Desktop/floropolis_products.ts.

import type { Product as RawProduct } from "../../../floropolis_products";
import {
  products as rawProducts,
  PROMO_CODES as RAW_PROMO_CODES,
} from "../../../floropolis_products";

export type Product = RawProduct;

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

export const products: Product[] = rawProducts.map((p) => {
  if (isAssortedOrCombo(p) && !p.is_on_deal && p.price != null) {
    return {
      ...p,
      is_on_deal: true,
      deal_price: Math.round(p.price * 0.9 * 100) / 100,
      deal_label: "10% Off",
    };
  }
  return p;
});
