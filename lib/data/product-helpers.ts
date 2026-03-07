import { products, type Product, PROMO_CODES } from "./products";

// Get all unique categories with counts
export function getCategories() {
  const map = new Map<string, { count: number; dealCount: number }>();
  for (const p of products) {
    const entry = map.get(p.category) || { count: 0, dealCount: 0 };
    entry.count++;
    if (p.is_on_deal) entry.dealCount++;
    map.set(p.category, entry);
  }
  return Array.from(map.entries())
    .map(([name, stats]) => ({ name, ...stats }))
    .sort((a, b) => b.count - a.count);
}

// Get products by category
export function getProductsByCategory(category: string): Product[] {
  return products.filter((p) => p.category === category);
}

// Get product by slug
export function getProductBySlug(slug: string): Product | undefined {
  return products.find((p) => p.slug === slug);
}

// Get all slugs (for static generation)
export function getAllSlugs(): { category: string; slug: string }[] {
  return products.map((p) => ({
    category: p.category.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    slug: p.slug,
  }));
}

// Get products on deal
export function getDeals(): Product[] {
  return products
    .filter((p) => p.is_on_deal)
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Get variants of a product (same variety + color, different length/box)
export function getVariants(variety: string, color: string): Product[] {
  return products.filter(
    (p) => p.variety === variety && p.color === color,
  );
}

// Get related products (same category, different product)
export function getRelated(
  category: string,
  excludeSlug: string,
  limit = 4,
): Product[] {
  return products
    .filter((p) => p.category === category && p.slug !== excludeSlug)
    .sort(() => Math.random() - 0.5)
    .slice(0, limit);
}

// Grouped products for catalog/shop grid: one card per variety+color
export function getGroupedProducts(): Product[] {
  const groups = new Map<string, Product[]>();
  for (const p of products) {
    const key = `${p.variety}---${p.color}`.toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }
  const result: Product[] = [];
  for (const [, variants] of groups) {
    const best = [...variants].sort((a, b) => {
      if (a.has_photo !== b.has_photo) return a.has_photo ? -1 : 1;
      if (a.is_on_deal !== b.is_on_deal) return a.is_on_deal ? -1 : 1;
      return a.display_order - b.display_order;
    })[0];
    result.push(best);
  }
  return result;
}

// Category slug helper
export function categoryToSlug(category: string): string {
  return category
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+$/, "");
}

export function slugToCategory(slug: string): string | undefined {
  return products.find((p) => categoryToSlug(p.category) === slug)?.category;
}

// Validate promo code
export function validatePromoCode(
  code: string,
  cartItems: { vendor?: string | null; category: string }[],
) {
  const promo =
    PROMO_CODES[code.toUpperCase() as keyof typeof PROMO_CODES];
  if (!promo) return { valid: false, error: "Invalid code" };
  if (new Date(promo.expiry) < new Date())
    return { valid: false, error: "Code expired" };

  const filters = promo.scope_filter
    .split(",")
    .map((s: string) => s.trim());
  const scope = promo.scope as string;
  const qualifying = cartItems.filter((item) => {
    if (scope === "vendor")
      return filters.includes(item.vendor || "");
    if (scope === "category") return filters.includes(item.category);
    return true;
  });

  return {
    valid: true,
    discount_type: promo.discount_type,
    discount_value: promo.discount_value,
    qualifying_items: qualifying.length,
    scope_label: promo.scope_filter,
  };
}
