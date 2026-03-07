import { supabaseFetchInventory } from "./supabaseClient";

// Raw row as it exists in Supabase floropolis_inventory.
export interface FloropolisInventoryRow {
  id: number;
  scrape_date: string | null;
  name: string;
  category: string | null;
  color: string | null;
  variety: string | null;
  length: string | null;
  price: number | null;
  unit: string | null;
  stems_per_bunch: number | null;
  units_per_box: number | null;
  box_type: string | null;
  stock: number | null;
  vendor: string | null;
  created_at: string | null;
  arrival_date: string | null;
  // New columns for website display (nullable while we roll out)
  is_on_deal?: boolean | null;
  deal_label?: string | null;
  deal_price?: number | null;
  deal_expiry?: string | null;
  is_best_seller?: boolean | null;
  is_featured?: boolean | null;
  display_order?: number | null;
  slug?: string | null;
  images?: unknown | null; // stored as jsonb; we coerce below
  whatsapp_message_template?: string | null;
}

export type BoxType = "QB" | "QB-M" | "HB" | "EB" | "EB-M" | "SB-M" | string;

export interface ProductVariant {
  id: number;
  length: string | null;
  boxType: BoxType | null;
  price: number | null;
  unit: string | null;
  stemsPerBunch: number | null;
  unitsPerBox: number | null;
  stock: number | null;
  arrivalDate: string | null;
}

export interface CatalogProduct {
  slug: string;
  name: string;
  category: string | null;
  color: string | null;
  variety: string | null;
  vendor: string | null;
  basePrice: number | null;
  isOnDeal: boolean;
  dealLabel?: string | null;
  dealPrice?: number | null;
  dealExpiry?: string | null;
  isBestSeller: boolean;
  isFeatured: boolean;
  displayOrder: number;
  images: string[];
  whatsappTemplate?: string | null;
  variants: ProductVariant[];
}

export interface FetchProductsParams {
  category?: string;
  dealsOnly?: boolean;
  search?: string;
  limit?: number;
}

/**
 * Build a stable slug if the row doesn't have one yet.
 * We keep it deterministic (name + vendor) so we can migrate later.
 */
function buildFallbackSlug(row: FloropolisInventoryRow): string {
  const base = row.slug || row.name || `product-${row.id}`;
  const vendor = row.vendor ? `-${row.vendor}` : "";
  return `${(base + vendor)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")}`;
}

function coerceImages(images: unknown): string[] {
  if (!images) return [];
  if (Array.isArray(images) && images.every((v) => typeof v === "string")) {
    return images as string[];
  }
  return [];
}

/**
 * Group raw inventory rows into one CatalogProduct per slug/variety.
 * Each row becomes a variant (length × box_type × price).
 */
export function buildCatalogProducts(
  rows: FloropolisInventoryRow[],
): CatalogProduct[] {
  const bySlug = new Map<string, CatalogProduct>();

  for (const row of rows) {
    const slug = buildFallbackSlug(row);
    const existing = bySlug.get(slug);

    const variant: ProductVariant = {
      id: row.id,
      length: row.length,
      boxType: (row.box_type || null) as BoxType | null,
      price: row.price,
      unit: row.unit,
      stemsPerBunch: row.stems_per_bunch,
      unitsPerBox: row.units_per_box,
      stock: row.stock,
      arrivalDate: row.arrival_date,
    };

    if (!existing) {
      const product: CatalogProduct = {
        slug,
        name: row.name,
        category: row.category,
        color: row.color,
        variety: row.variety,
        vendor: row.vendor,
        basePrice: row.price,
        isOnDeal: !!row.is_on_deal,
        dealLabel: row.deal_label ?? undefined,
        dealPrice: row.deal_price ?? undefined,
        dealExpiry: row.deal_expiry ?? undefined,
        isBestSeller: !!row.is_best_seller,
        isFeatured: !!row.is_featured,
        displayOrder: row.display_order ?? 9999,
        images: coerceImages(row.images),
        whatsappTemplate: row.whatsapp_message_template ?? undefined,
        variants: [variant],
      };
      bySlug.set(slug, product);
    } else {
      existing.variants.push(variant);
      // Keep the lowest price as base reference
      if (
        variant.price != null &&
        (existing.basePrice == null || variant.price < existing.basePrice)
      ) {
        existing.basePrice = variant.price;
      }
      // Bubble up deal / bestseller flags if any variant has them
      existing.isOnDeal = existing.isOnDeal || !!row.is_on_deal;
      existing.isBestSeller = existing.isBestSeller || !!row.is_best_seller;
      existing.isFeatured = existing.isFeatured || !!row.is_featured;
      if (!existing.dealPrice && row.deal_price != null) {
        existing.dealPrice = row.deal_price;
      }
      if (!existing.dealLabel && row.deal_label) {
        existing.dealLabel = row.deal_label;
      }
    }
  }

  const products = Array.from(bySlug.values());

  // Default sort: deals first, then best sellers, then display_order, then name.
  products.sort((a, b) => {
    if (a.isOnDeal !== b.isOnDeal) {
      return a.isOnDeal ? -1 : 1;
    }
    if (a.isBestSeller !== b.isBestSeller) {
      return a.isBestSeller ? -1 : 1;
    }
    const orderA = a.displayOrder ?? 9999;
    const orderB = b.displayOrder ?? 9999;
    if (orderA !== orderB) return orderA - orderB;
    return a.name.localeCompare(b.name);
  });

  return products;
}

/**
 * Fetch products from Supabase with optional filters (REST API).
 */
export async function fetchCatalogProducts(
  params: FetchProductsParams = {},
): Promise<CatalogProduct[]> {
  const { category, dealsOnly, search, limit } = params;

  const queryParams: Record<string, string> = {
    order: "is_on_deal.desc.nullslast,is_best_seller.desc.nullslast,display_order.asc.nullsfirst,name.asc",
  };

  if (category) {
    queryParams.category = `eq.${category}`;
  }
  if (dealsOnly === true) {
    queryParams.is_on_deal = "eq.true";
  }
  if (search && search.trim()) {
    const term = `*${search.trim()}*`;
    queryParams.or = `(name.ilike.${term},variety.ilike.${term},color.ilike.${term},vendor.ilike.${term})`;
  }
  if (limit && limit > 0) {
    queryParams.limit = String(limit);
  }

  const data = await supabaseFetchInventory(queryParams);
  return buildCatalogProducts((data ?? []) as FloropolisInventoryRow[]);
}

/**
 * Fetch a single catalog product (grouped by slug) from Supabase.
 * Queries by slug column; if no rows have slug yet, fetches all and finds by fallback slug.
 */
export async function fetchCatalogProductBySlug(
  slug: string,
): Promise<CatalogProduct | null> {
  const data = await supabaseFetchInventory({ slug: `eq.${slug}` });
  const rows = data as FloropolisInventoryRow[];

  if (rows.length > 0) {
    const products = buildCatalogProducts(rows);
    return products[0] ?? null;
  }

  // Fallback: slug column may be empty; fetch recent rows and match by built slug
  const all = await supabaseFetchInventory({
    limit: "500",
    order: "name.asc",
  });
  const products = buildCatalogProducts((all ?? []) as FloropolisInventoryRow[]);
  return products.find((p) => p.slug === slug) ?? null;
}


