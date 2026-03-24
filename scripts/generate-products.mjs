#!/usr/bin/env node
/**
 * Fetches products from Supabase floropolis_inventory and generates
 * floropolis_products.ts (the master catalog file used by the site).
 *
 * Usage: node scripts/generate-products.mjs
 * Output: /Users/facu/Desktop/floropolis_products.ts
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Read .env.local for Supabase credentials
const envPath = resolve(__dirname, "../.env.local");
const envContent = readFileSync(envPath, "utf-8");
const env = {};
for (const line of envContent.split("\n")) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim();
}

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_KEY in .env.local");
  process.exit(1);
}

async function fetchAll() {
  // Supabase REST API has a default limit of 1000, so paginate
  const allRows = [];
  let offset = 0;
  const limit = 500;

  while (true) {
    const params = new URLSearchParams({
      tier: "in.(T1,T2,T3)",
      order: "tier,category,variety,length",
      offset: String(offset),
      limit: String(limit),
    });
    const url = `${SUPABASE_URL}/rest/v1/floropolis_inventory?${params}`;
    const res = await fetch(url, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        Prefer: "count=exact",
      },
    });

    if (!res.ok) {
      console.error("Supabase error:", res.status, await res.text());
      process.exit(1);
    }

    const data = await res.json();
    allRows.push(...data);
    console.log(`Fetched ${data.length} rows (offset=${offset})`);

    if (data.length < limit) break;
    offset += limit;
  }

  return allRows;
}

function toProduct(row) {
  return {
    id: row.id,
    name: row.name || "",
    category: row.category || "Other",
    color: row.color || "",
    variety: row.variety || "",
    length: row.length || null,
    price: Number(row.price) || 0,
    unit: row.unit || "Stem",
    stems_per_bunch: Number(row.stems_per_bunch) || 0,
    units_per_box: Number(row.units_per_box) || 0,
    box_type: row.box_type || "QB",
    stock: Number(row.stock) || 0,
    vendor: row.vendor || "",
    is_on_deal: row.is_on_deal || false,
    deal_label: row.deal_label || null,
    deal_price: row.deal_price ? Number(row.deal_price) : null,
    deal_expiry: row.deal_expiry || null,
    is_best_seller: row.is_best_seller || false,
    is_featured: row.is_featured || false,
    display_order: row.display_order ?? 999,
    slug: (row.slug || "").replace(/&/g, "and").replace(/[^a-z0-9-]/g, "-").replace(/-{2,}/g, "-").replace(/^-|-$/g, ""),
    images: Array.isArray(row.images) ? row.images : [],
    tier: row.tier || "T3",
    has_photo: Array.isArray(row.images) && row.images.length > 0,
    total_stems: row.total_stems ? Number(row.total_stems) : null,
    contents_note: row.contents_note || null,
    available_from: row.available_from || null,
  };
}

async function main() {
  console.log("Fetching products from Supabase...");
  const rows = await fetchAll();
  console.log(`Total products fetched: ${rows.length}`);

  const products = rows.map(toProduct);

  // Count by tier
  const tierCounts = {};
  for (const p of products) {
    tierCounts[p.tier] = (tierCounts[p.tier] || 0) + 1;
  }
  console.log("By tier:", tierCounts);

  // === DATA QUALITY SCAN ===
  const issues = {
    zeroPrice: [],
    missingUnitsPerBox: [],
    missingStemsPerBunch: [],
    missingSlug: [],
    missingVendor: [],
  };
  for (const p of products) {
    if (p.price <= 0) issues.zeroPrice.push({ id: p.id, name: p.name, slug: p.slug, tier: p.tier });
    if (p.units_per_box <= 0) issues.missingUnitsPerBox.push({ id: p.id, name: p.name, tier: p.tier });
    if (p.stems_per_bunch <= 0) issues.missingStemsPerBunch.push({ id: p.id, name: p.name, tier: p.tier });
    if (!p.slug) issues.missingSlug.push({ id: p.id, name: p.name });
    if (!p.vendor) issues.missingVendor.push({ id: p.id, name: p.name });
  }

  console.log("\n=== DATA QUALITY REPORT ===");
  console.log(`Products with $0 price: ${issues.zeroPrice.length}`);
  for (const p of issues.zeroPrice) console.log(`  ⚠️  [${p.tier}] "${p.name}" (ID: ${p.id}, slug: ${p.slug})`);
  console.log(`Products missing units_per_box: ${issues.missingUnitsPerBox.length}`);
  console.log(`Products missing stems_per_bunch: ${issues.missingStemsPerBunch.length}`);
  console.log(`Products missing slug: ${issues.missingSlug.length}`);
  console.log(`Products missing vendor: ${issues.missingVendor.length}`);
  console.log("=== END REPORT ===\n");

  if (issues.zeroPrice.length > 0) {
    console.warn(`⚠️  ${issues.zeroPrice.length} product(s) have $0 price — these will show "Price pending" on the site.`);
  }

  const ts = `/**
 * Auto-generated product catalog from Supabase floropolis_inventory.
 * Generated: ${new Date().toISOString()}
 * Total products: ${products.length}
 * Tiers: ${JSON.stringify(tierCounts)}
 *
 * DO NOT EDIT MANUALLY — regenerate with: node scripts/generate-products.mjs
 */

export interface Product {
  id: number;
  name: string;
  category: string;
  color: string;
  variety: string;
  length: string | null;
  price: number;
  unit: string;
  stems_per_bunch: number;
  units_per_box: number;
  box_type: string;
  stock: number;
  vendor: string;
  is_on_deal: boolean;
  deal_label: string | null;
  deal_price: number | null;
  deal_expiry: string | null;
  is_best_seller: boolean;
  is_featured: boolean;
  display_order: number;
  slug: string;
  images: string[];
  tier: string;
  has_photo: boolean;
  total_stems: number | null;
  contents_note: string | null;
  available_from: string | null;
}

export const products: Product[] = ${JSON.stringify(products, null, 2)};

export const PROMO_CODES = {
  MAGIC10: {
    discount_type: "percentage" as const,
    discount_value: 10,
    scope: "all" as const,
    scope_filter: "",
    expiry: "2026-06-30",
    active: true,
  },
  SPRING15: {
    discount_type: "percentage" as const,
    discount_value: 15,
    scope: "category" as const,
    scope_filter: "Ranunculus,Anemone,Delphinium",
    expiry: "2026-04-30",
    active: true,
  },
  WELCOME10: {
    discount_type: "percentage" as const,
    discount_value: 10,
    scope: "all" as const,
    scope_filter: "",
    expiry: "2026-12-31",
    active: true,
    first_order_only: true,
  },
} as const;
`;

  // Write into the repo so Vercel can build
  const outPath = resolve(__dirname, "../lib/data/floropolis_products.ts");
  writeFileSync(outPath, ts, "utf-8");
  console.log(`\nWritten to: ${outPath}`);
  console.log(`Products: ${products.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
