/**
 * Search across products (name, variety, color, category).
 * Recent searches (localStorage) and popular suggestions.
 */

import {
  SHOP_PRODUCTS,
  type ShopProduct,
  type ProductCategory,
  CATEGORIES,
} from "./shop-products";

export type { ProductCategory };

const RECENT_KEY = "floropolis_recent_searches";
const RECENT_MAX = 8;

/** Normalize for matching: lowercase, trim */
function norm(s: string): string {
  return s.toLowerCase().trim();
}

/** Match query against a product (name, variety, color, category). */
function productMatches(p: ShopProduct, q: string): boolean {
  const n = norm(q);
  if (!n) return false;
  return (
    norm(p.name).includes(n) ||
    norm(p.variety).includes(n) ||
    norm(p.color).includes(n) ||
    norm(p.category).includes(n)
  );
}

/** Search products by name, variety, color, category. Returns up to 10. */
export function searchProducts(query: string): ShopProduct[] {
  const n = norm(query);
  if (!n) return [];
  return SHOP_PRODUCTS.filter((p) => productMatches(p, n)).slice(0, 10);
}

/** Category labels that match the query (for "Category" suggestions in dropdown). */
export function searchCategories(query: string): ProductCategory[] {
  const n = norm(query);
  if (!n) return [];
  return CATEGORIES.filter((c) => norm(c).includes(n)).slice(0, 4);
}

/** Dedicated category page when one exists; otherwise /shop?category= */
export function getCategoryPageUrl(category: ProductCategory): string {
  switch (category) {
    case "Roses":
      return "/shop/roses";
    case "Tropicals":
      return "/shop/tropicals";
    case "Greens & Foliage":
      return "/shop/greens";
    case "Mixed Boxes":
      return "/shop/combo-boxes";
    default:
      return `/shop?category=${encodeURIComponent(category)}`;
  }
}

/** Recent searches from localStorage (newest first). */
export function getRecentSearches(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const arr = raw ? (JSON.parse(raw) as string[]) : [];
    return Array.isArray(arr) ? arr.slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

/** Append a search term to recent (dedupe, put at front, cap at RECENT_MAX). */
export function addRecentSearch(term: string): void {
  const t = term.trim();
  if (!t) return;
  const recent = getRecentSearches().filter((s) => s.toLowerCase() !== t.toLowerCase());
  const next = [t, ...recent].slice(0, RECENT_MAX);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

/** Clear recent searches. */
export function clearRecentSearches(): void {
  try {
    localStorage.removeItem(RECENT_KEY);
  } catch {
    // ignore
  }
}

/** Popular search suggestions (labels + link type). */
export const POPULAR_SEARCHES: { label: string; href: string }[] = [
  { label: "Roses", href: "/shop/roses" },
  { label: "Tropicals", href: "/shop/tropicals" },
  { label: "Greens & Foliage", href: "/shop/greens" },
  { label: "Combo Boxes", href: "/shop/combo-boxes" },
  { label: "Eucalyptus", href: "/shop/greens" },
  { label: "Tabasco", href: "/shop/combo-boxes" },
  { label: "Ranunculus", href: "/shop?category=Ranunculus" },
  { label: "Anemone", href: "/shop?category=Anemone" },
];
