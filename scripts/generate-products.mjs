#!/usr/bin/env node
/**
 * Generates lib/data/floropolis_products.ts (the static catalog the site ships)
 * from the BACKUP project's publish authority: catalog_published.
 *
 * Usage:  node scripts/generate-products.mjs
 * Output: lib/data/floropolis_products.ts  (this is the ONLY thing it writes)
 *
 * ----------------------------------------------------------------------------
 * STOREFRONT REWIRE (2026-06-03) — Facu decision D01: catalog_published is the
 * single publish authority. It is a VIEW over dim_sku + canonical_cost (facu_
 * approved) + product_chrome (images present) + catalog_availability_windows
 * (facu_approved), MINUS visibility_overrides 'hide'. It therefore already
 * encodes EVERY publishability gate, the images/slug/description display fields,
 * and the availability window. We no longer re-implement the gate chain here.
 *
 * What changed vs the pre-2026-06-03 generator:
 *   - Source is BACKUP `catalog_published` (uuid sku_id), NOT PROD
 *     `floropolis_inventory`. ALL PROD references removed. This script uses the
 *     BACKUP env vars/client like the rest of scripts/.
 *   - The 16-gate / visibility_override / tier-window filter chain is GONE:
 *     catalog_published is already post-gate (547 rows = 547 shippable SKUs).
 *
 * PRICE SOURCE (open question — see header note + final report):
 *   catalog_published carries `farm_cost` but NO customer-facing sell price.
 *   The only uuid-keyed view that has a `price` column (v_catalog_admin) returns
 *   NULL for all 547 published rows (its mirror join is dead post-rebuild).
 *   So the sell price is computed HERE from the CANONICAL pricing formula, with
 *   all constants read from the DB (pricing_constants) — nothing hardcoded:
 *       sell = farm_cost / (1 - gpm_target)  +  delivery_per_stem
 *       delivery_per_stem = ceil(box_chargeable_kg) * fedex_rate_per_kg
 *                           * fuel_surcharge_mult / stems_per_box
 *   This mirrors scripts/jobs/inventory_data_validator.py and the deal
 *   calculator exactly. It is NOT Job_PM originating a price — it is applying
 *   Rose's published formula to Rose's published cost. FLAGGED for Facu/Rose:
 *   the durable fix is a sell-price column on catalog_published so the generator
 *   reads price instead of recomputing it.
 * ----------------------------------------------------------------------------
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from "fs";
import { resolve, dirname, basename, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Env — read BACKUP credentials only. (No PROD vars are read by this script.)
// ---------------------------------------------------------------------------
const envPath = resolve(__dirname, "../.env.local");
const env = {};
if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      let v = match[2].trim();
      // `vercel env pull` wraps values in double-quotes; strip one surrounding pair.
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      env[match[1].trim()] = v;
    }
  }
}
// process.env wins (CI), else fall back to .env.local.
const ENV = { ...env, ...process.env };

const BACKUP_URL =
  ENV.BACKUP_SUPABASE_URL || ENV.NEXT_PUBLIC_BACKUP_SUPABASE_URL;
const BACKUP_KEY =
  ENV.BACKUP_SUPABASE_SERVICE_KEY || ENV.NEXT_PUBLIC_BACKUP_SUPABASE_ANON_KEY;

if (!BACKUP_URL || !BACKUP_KEY) {
  console.error(
    "\n!! MISSING BACKUP_SUPABASE_* env — cannot read the publish authority.",
  );
  console.error(
    "   Need one of: BACKUP_SUPABASE_URL + BACKUP_SUPABASE_SERVICE_KEY",
  );
  console.error(
    "        or:    NEXT_PUBLIC_BACKUP_SUPABASE_URL + NEXT_PUBLIC_BACKUP_SUPABASE_ANON_KEY",
  );
  console.error("   Refusing to regenerate catalog.\n");
  process.exit(1);
}

const PRICING_MARKET = ENV.PRICING_MARKET || "Ecuador";

// ---------------------------------------------------------------------------
// Generic paginated GET against a BACKUP PostgREST endpoint.
// ---------------------------------------------------------------------------
async function fetchAllRest(table, params = {}) {
  const out = [];
  let offset = 0;
  const limit = 1000;
  while (true) {
    const usp = new URLSearchParams({
      ...params,
      offset: String(offset),
      limit: String(limit),
    });
    const url = `${BACKUP_URL}/rest/v1/${table}?${usp}`;
    const res = await fetch(url, {
      headers: {
        apikey: BACKUP_KEY,
        Authorization: `Bearer ${BACKUP_KEY}`,
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      throw new Error(`Supabase REST ${table} ${res.status}: ${await res.text()}`);
    }
    const data = await res.json();
    out.push(...data);
    if (data.length < limit) break;
    offset += limit;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Canonical pricing inputs (constants from DB; box weights/stems from mirror).
// ---------------------------------------------------------------------------
async function loadPricing() {
  const pcRows = await fetchAllRest("pricing_constants", {
    select: "id,market,value_numeric",
    market: `eq.${PRICING_MARKET}`,
    id: "in.(gpm_target,fedex_rate_per_kg,fuel_surcharge_mult)",
  });
  const c = {};
  for (const r of pcRows) {
    const n = Number(r.value_numeric);
    if (Number.isFinite(n)) c[r.id] = n;
  }
  for (const key of ["gpm_target", "fedex_rate_per_kg", "fuel_surcharge_mult"]) {
    if (!(key in c)) {
      throw new Error(
        `pricing_constants missing '${key}' for market=${PRICING_MARKET}; refusing to recompute prices.`,
      );
    }
  }

  // box_master_mirror keyed by (vendor, box_type). Carries chargeable kg +
  // stems_per_box. Used to compute delivery_per_stem.
  const bmRows = await fetchAllRest("box_master_mirror", {
    select:
      "vendor_canonical_name,legacy_box_type,box_family,fedex_chargeable_kg,stems_per_box",
    active: "eq.true",
  });
  const boxByVendorType = new Map(); // `${VENDOR}|${BOXTYPE}` -> {kg, stems}
  const boxByType = new Map(); // `${BOXTYPE}` -> {kg(min), stems(any)}
  for (const r of bmRows) {
    const vendor = String(r.vendor_canonical_name || "").toUpperCase().trim();
    const kg = Number(r.fedex_chargeable_kg);
    const stems = Number(r.stems_per_box);
    if (!Number.isFinite(kg)) continue;
    const types = new Set();
    if (r.legacy_box_type) types.add(String(r.legacy_box_type).toUpperCase().trim());
    if (r.box_family) types.add(String(r.box_family).toUpperCase().trim());
    for (const bt of types) {
      if (!bt) continue;
      if (vendor) boxByVendorType.set(`${vendor}|${bt}`, { kg, stems });
      const prev = boxByType.get(bt);
      if (!prev || kg < prev.kg) {
        boxByType.set(bt, { kg, stems: Number.isFinite(stems) ? stems : prev?.stems });
      }
    }
  }
  return { constants: c, boxByVendorType, boxByType };
}

// Look up box weight + stems for a (vendor, box_type), with min-weight fallback.
function resolveBox(pricing, vendor, boxType) {
  if (!boxType) return null;
  const v = String(vendor || "").toUpperCase().trim();
  const bt = String(boxType).toUpperCase().trim();
  return (
    pricing.boxByVendorType.get(`${v}|${bt}`) ||
    pricing.boxByType.get(bt) ||
    null
  );
}

// sell = farm_cost/(1-gpm) + delivery_per_stem. Returns number or null.
function computeSellPrice(pricing, row) {
  const cost = Number(row.farm_cost);
  if (!Number.isFinite(cost) || cost <= 0) return null;
  const gpm = pricing.constants.gpm_target;
  const priceExDelivery = cost / (1 - gpm);

  const box = resolveBox(pricing, row.vendor, row.box_type);
  // stems_per_box: prefer catalog_published.pack, else mirror's stems_per_box.
  const pack = Number(row.pack);
  const stemsPerBox =
    Number.isFinite(pack) && pack > 0
      ? pack
      : box && Number.isFinite(box.stems) && box.stems > 0
        ? box.stems
        : null;

  if (!box || stemsPerBox == null) {
    // No box weight or no stems-per-box: cannot add delivery. Fail-loud later.
    return null;
  }
  const deliveryPerBox =
    Math.ceil(box.kg) *
    pricing.constants.fedex_rate_per_kg *
    pricing.constants.fuel_surcharge_mult;
  const deliveryPerStem = deliveryPerBox / stemsPerBox;
  return Math.round((priceExDelivery + deliveryPerStem) * 10000) / 10000;
}

// ---------------------------------------------------------------------------
// Availability: catalog_published encodes the window as min/max days ahead.
// Effective available_from = today (UTC) + availability_min_days_ahead.
// (Previously derived from arrival_date + a tier-min clamp; the publish
// authority now owns the window directly.)
// ---------------------------------------------------------------------------
function availableFrom(minDaysAhead) {
  const days = Number.isFinite(Number(minDaysAhead)) ? Number(minDaysAhead) : 14;
  const now = new Date();
  const todayUTC = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const eff = new Date(todayUTC.getTime() + days * 86400000);
  return eff.toISOString().slice(0, 10);
}

function sanitizeSlug(slug) {
  return (slug || "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
}

// catalog_published row -> the Product shape the static file emits.
// id: the storefront Product.id is `number`. catalog_published is uuid-keyed,
// so we derive a stable positive int id from the uuid (FNV-1a 32-bit). Routing
// and search use `slug` as the real key; `id` is only a React key / legacy
// link fallback, so a deterministic hash is safe and collision-free in practice
// for 547 rows. (display_order/stock/deal fields are not on catalog_published —
// they default; downstream lib/data/products.ts re-derives bestseller/deal.)
function uuidToInt(uuid) {
  let h = 0x811c9dc5;
  const s = String(uuid);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % 2000000000; // positive int < 2e9
}

function toProduct(pricing, row) {
  const tier = row.tier || "T3";
  const category = row.web_category || row.category || "Other";
  const length = row.size_cm != null ? `${row.size_cm} cm` : null;
  const price = computeSellPrice(pricing, row) ?? 0;
  // selling_unit on catalog_published is 'stem' | 'na'; map 'na' -> 'Stem'
  // (single-stem default) and capitalize. The shape expects 'Stem'|'Bunch'|'Box'.
  const rawUnit = String(row.selling_unit || "").toLowerCase();
  const unit = rawUnit === "stem" || rawUnit === "na" || rawUnit === "" ? "Stem"
    : rawUnit === "bunch" ? "Bunch"
    : rawUnit === "box" ? "Box"
    : "Stem";
  const stemsPerBox = Number(row.pack);
  return {
    id: uuidToInt(row.sku_id),
    sku_id: String(row.sku_id),
    name: row.display_name || "",
    category,
    color: row.color || "",
    variety: row.variety || "",
    length,
    price,
    unit,
    stems_per_bunch: 1, // catalog_published sells by stem; bunch granularity not modeled here
    units_per_box: Number.isFinite(stemsPerBox) && stemsPerBox > 0 ? stemsPerBox : 0,
    box_type: (row.box_type || "").toUpperCase(),
    stock: 0, // catalog_published does not carry live stock; window-gated availability
    vendor: row.vendor || "",
    is_on_deal: false,
    deal_label: null,
    deal_price: null,
    deal_expiry: null,
    is_best_seller: false,
    is_featured: false,
    display_order: 999,
    slug: sanitizeSlug(row.slug),
    images: Array.isArray(row.images) ? row.images : [],
    tier,
    has_photo: Array.isArray(row.images) && row.images.length > 0,
    total_stems: Number.isFinite(stemsPerBox) && stemsPerBox > 0 ? stemsPerBox : null,
    contents_note: row.description || null,
    available_from: availableFrom(row.availability_min_days_ahead),
  };
}

async function main() {
  console.log("=== STOREFRONT GENERATE (publish authority: catalog_published) ===");
  const pricing = await loadPricing();
  console.log(
    `  pricing_constants(${PRICING_MARKET}): gpm=${pricing.constants.gpm_target} ` +
      `fedex=${pricing.constants.fedex_rate_per_kg} fuel=${pricing.constants.fuel_surcharge_mult}`,
  );
  console.log(`  box_master_mirror weights loaded: ${pricing.boxByType.size} box types`);

  const rows = await fetchAllRest("catalog_published", {
    select:
      "sku_id,vendor,variety,category,color,size_cm,box_type,selling_unit,tier," +
      "origin_country,farm_cost,pack,display_name,slug,images,description,web_category," +
      "availability_min_days_ahead,availability_max_days_ahead",
    order: "tier,web_category,variety,size_cm",
  });
  console.log(`  catalog_published rows: ${rows.length}`);

  const products = rows.map((r) => toProduct(pricing, r));

  // Price diagnostics — published rows that could not be priced (no box weight
  // or no stems-per-box). These would show $0 on the storefront; surface them.
  const unpriced = products.filter((p) => !p.price || p.price <= 0);
  if (unpriced.length > 0) {
    console.warn(`\n!! ${unpriced.length} published SKU(s) could NOT be priced (no box weight / stems-per-box):`);
    for (const p of unpriced.slice(0, 20)) {
      console.warn(`   [${p.tier}] "${p.name}" (sku ${p.sku_id}, vendor ${p.vendor}, box ${p.box_type})`);
    }
    if (unpriced.length > 20) console.warn(`   ... and ${unpriced.length - 20} more`);
  }

  // Count by tier
  const tierCounts = {};
  for (const p of products) tierCounts[p.tier] = (tierCounts[p.tier] || 0) + 1;
  console.log("  by tier:", JSON.stringify(tierCounts));

  // === IMAGE VALIDATION — local-path images are fuzzy-matched against
  // public/images/shop; external (CDN) URLs pass through. catalog_published
  // images are CDN URLs today, so this is mostly a pass-through safety net. ===
  const publicDir = resolve(__dirname, "../public");
  const brokenImages = [];
  const autoFixed = [];

  function indexImages(dir, prefix = "") {
    const entries = [];
    try {
      for (const f of readdirSync(dir, { withFileTypes: true })) {
        const rel = prefix ? `${prefix}/${f.name}` : f.name;
        if (f.isDirectory()) entries.push(...indexImages(join(dir, f.name), rel));
        else entries.push(rel);
      }
    } catch {}
    return entries;
  }
  const allImages = indexImages(resolve(publicDir, "images/shop"));

  function normalize(filename) {
    return basename(filename)
      .replace(/\.\w+$/, "")
      .toLowerCase()
      .replace(/[-_]+/g, " ")
      .split(" ")
      .sort()
      .join(" ");
  }
  const normalizedMap = new Map();
  for (const img of allImages) normalizedMap.set(normalize(img), `/images/shop/${img}`);

  for (const p of products) {
    if (!p.images || p.images.length === 0) continue;
    const validated = [];
    for (const imgPath of p.images) {
      if (imgPath.startsWith("http")) {
        validated.push(imgPath);
        continue;
      }
      const fullPath = resolve(publicDir, imgPath.replace(/^\//, ""));
      if (existsSync(fullPath)) {
        validated.push(imgPath);
      } else {
        const match = normalizedMap.get(normalize(imgPath));
        if (match && existsSync(resolve(publicDir, match.replace(/^\//, "")))) {
          autoFixed.push({ id: p.id, name: p.name, was: imgPath, now: match });
          validated.push(match);
        } else {
          brokenImages.push({ id: p.id, name: p.name, vendor: p.vendor, path: imgPath });
        }
      }
    }
    p.images = validated;
    p.has_photo = validated.length > 0;
  }

  if (autoFixed.length > 0) {
    console.log(`\n=== IMAGE AUTO-FIX (${autoFixed.length} resolved) ===`);
    for (const f of autoFixed) console.log(`  -> [${f.id}] "${f.name}": ${f.was} => ${f.now}`);
  }
  if (brokenImages.length > 0) {
    console.error(`\n=== BROKEN IMAGES (${brokenImages.length} unresolvable) ===`);
    for (const b of brokenImages) console.error(`  !! [${b.id}] "${b.name}" (${b.vendor}): ${b.path}`);
  }
  const photoCounts = {
    with: products.filter((p) => p.has_photo).length,
    without: products.filter((p) => !p.has_photo).length,
  };
  console.log(`\n=== IMAGE REPORT ===`);
  console.log(`  with verified images: ${photoCounts.with}`);
  console.log(`  without images: ${photoCounts.without}`);
  console.log(`=== END IMAGE REPORT ===\n`);

  const ts = `/**
 * Auto-generated product catalog from the BACKUP publish authority (catalog_published).
 * Generated: ${new Date().toISOString()}
 * Total products: ${products.length}
 * Tiers: ${JSON.stringify(tierCounts)}
 *
 * Source of truth: catalog_published (Facu decision D01) — already gate/image/
 * window filtered. Sell price computed from the canonical pricing formula
 * (pricing_constants + box_master_mirror); see scripts/generate-products.mjs.
 *
 * DO NOT EDIT MANUALLY — regenerate with: node scripts/generate-products.mjs
 */

export interface Product {
  id: number;
  sku_id: string;
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

  const outPath = resolve(__dirname, "../lib/data/floropolis_products.ts");
  writeFileSync(outPath, ts, "utf-8");
  console.log(`Written to: ${outPath}`);
  console.log(`Products: ${products.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
