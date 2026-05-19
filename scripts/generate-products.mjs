#!/usr/bin/env node
/**
 * Fetches products from Supabase floropolis_inventory and generates
 * floropolis_products.ts (the master catalog file used by the site).
 *
 * Usage: node scripts/generate-products.mjs
 * Output: /Users/facu/Desktop/floropolis_products.ts
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from "fs";
import { resolve, dirname, basename, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Read .env.local for Supabase credentials
const envPath = resolve(__dirname, "../.env.local");
const envContent = readFileSync(envPath, "utf-8");
const env = {};
for (const line of envContent.split("\n")) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) {
    let v = match[2].trim();
    // Vercel `vercel env pull` writes values wrapped in double-quotes; strip
    // a single surrounding pair so URL parsing doesn't break.
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    env[match[1].trim()] = v;
  }
}

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_KEY in .env.local");
  process.exit(1);
}

// ============================================================================
// BACKUP project (supabase-backup, ibckhcjvyxzrhvdiazbx) — owns the 16-gate
// validator output: catalog_classifications, visibility_overrides,
// tier_visibility_windows. These tables are the source of truth for what is
// allowed to ship to /shop, /shop/[slug], and the homepage carousel.
//
// Prior to 2026-05-19 the generator queried floropolis_inventory directly and
// ignored these gate tables — non-publishable SKUs were leaking to the site.
// This is Contract P2: catalog publishability is enforced HERE, in the
// generator, before the static catalog file is written.
// ============================================================================
const BACKUP_URL =
  env.BACKUP_SUPABASE_URL || env.NEXT_PUBLIC_BACKUP_SUPABASE_URL;
const BACKUP_KEY =
  env.BACKUP_SUPABASE_SERVICE_KEY || env.NEXT_PUBLIC_BACKUP_SUPABASE_ANON_KEY;

if (!BACKUP_URL || !BACKUP_KEY) {
  console.error(
    "\n!! MISSING BACKUP_SUPABASE_* env — cannot enforce publishability gate.",
  );
  console.error(
    "   Need one of: BACKUP_SUPABASE_URL + BACKUP_SUPABASE_SERVICE_KEY",
  );
  console.error(
    "        or:    NEXT_PUBLIC_BACKUP_SUPABASE_URL + NEXT_PUBLIC_BACKUP_SUPABASE_ANON_KEY",
  );
  console.error("   Refusing to regenerate catalog (would ship leaky data).\n");
  process.exit(1);
}

// Vendor -> origin_country mapping. tier_visibility_windows is keyed by
// (tier, origin_country) but floropolis_inventory carries no country column,
// so we map via vendor. Per BRD 2026-05-19 every active Floropolis vendor is
// Ecuador-based; Colombia + US-domestic windows are seeded but `accepted=false`.
// If a new non-Ecuador vendor is onboarded, add it here OR a row will be
// dropped in the tier-window stage (fail-closed is correct).
const VENDOR_ORIGIN_COUNTRY = {
  Ecoroses: "Ecuador",
  Flodecol: "Ecuador",
  "Magic Flowers": "Ecuador",
  Megaflor: "Ecuador",
  // "Unknown" intentionally omitted — already filtered out upstream by
  // the missing-vendor guard, but explicit absence here also fails closed.
};

async function fetchAll() {
  // Supabase REST API has a default limit of 1000, so paginate
  const allRows = [];
  let offset = 0;
  const limit = 500;

  while (true) {
    const params = new URLSearchParams({
      tier: "in.(T2,T3,PLATINUM)",
      has_open_price_alert: "eq.false",
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

// D1 backfill: extract length from name when the length column is null/empty.
// Matches "50cm", "50 cm", "60-70cm", "80CM". Returns "50 cm" style string or null.
function extractLengthFromName(name) {
  if (!name) return null;
  const m = name.match(/(\d{2,3}(?:-\d{2,3})?)\s*c[mM]\b/);
  if (!m) return null;
  return `${m[1]} cm`;
}

// D3 backfill: extract color from variety/name when color column is null/empty.
// Common colors in the catalog — pulled from Supabase color distinct values.
const KNOWN_COLORS = [
  "White","Red","Pink","Yellow","Orange","Peach","Cream","Lavender","Purple",
  "Green","Burgundy","Blue","Bicolor","Assorted","Rainbow","Salmon","Coral",
  "Fuchsia","Magenta","Black","Dark Pink","Light Pink","Hot Pink","Dark Red",
  "Light Yellow","Sandy Cream","Light Peach","Cherry","Mauve","Brown",
];
function extractColorFromName(name) {
  if (!name) return null;
  // Prefer longer matches first to avoid "Pink" matching inside "Hot Pink"
  const sorted = [...KNOWN_COLORS].sort((a, b) => b.length - a.length);
  for (const c of sorted) {
    // Word-boundary match, case-insensitive
    const re = new RegExp("\\b" + c.replace(/\s/g, "\\s+") + "\\b", "i");
    if (re.test(name)) return c;
  }
  return null;
}

// D1 backfill: default box_type by category when null/empty.
// Values mirror what the catalog actually uses in Supabase.
const BOX_TYPE_BY_CATEGORY = {
  Rose: "QB",
  Anemone: "EB",
  Ranunculus: "EB",
  Delphinium: "FB",
  "Greens & Foliage": "HB",
  Tropicals: "HB",
  Bouquets: "QB",
  "Mixed Boxes": "QB",
  Gypsophila: "EB",
  Scabiosa: "EB",
  "Bells of Ireland": "HB",
  Craspedia: "EB",
  Thistle: "EB",
  Larkspur: "FB",
  Anthurium: "HB",
};
function defaultBoxType(category) {
  return BOX_TYPE_BY_CATEGORY[category] || "QB";
}

// D0b (source-of-truth rule): site shows the full catalog at a tier-valid date.
// Effective available_from = max(supabase_arrival_date, today + tier_min_days + 1 TZ buffer).
// T1/T2 min = 5 days; T3 min = 14 days. +1 day buffer absorbs TZ rounding (UTC vs local).
function clampAvailableFrom(arrivalDateISO, tier) {
  // Work in UTC to avoid TZ drift between generator + validator.
  const nowUTC = new Date();
  const todayUTC = new Date(Date.UTC(nowUTC.getUTCFullYear(), nowUTC.getUTCMonth(), nowUTC.getUTCDate()));
  const tierMin = 5; // T2, T3, PLATINUM all available from today+5
  const floor = new Date(todayUTC.getTime() + (tierMin + 1) * 86400000);
  const db = arrivalDateISO ? new Date(arrivalDateISO) : null;
  const effective = !db || isNaN(db.getTime()) || db < floor ? floor : db;
  return effective.toISOString().slice(0, 10);
}

function toProduct(row) {
  const tier = row.tier || "T3";
  const category = row.category || "Other";
  const length = row.length || extractLengthFromName(row.name);
  const color = row.color || extractColorFromName(row.variety) || extractColorFromName(row.name) || "";
  const box_type = row.box_type || defaultBoxType(category);
  return {
    id: row.id,
    name: row.name || "",
    category,
    color,
    variety: row.variety || "",
    length: length || null,
    price: Number(row.price) || 0,
    unit: row.unit || "Stem",
    stems_per_bunch: Number(row.stems_per_bunch) || 0,
    units_per_box: Number(row.units_per_box) || 0,
    box_type,
    stock: Number(row.stock) || 0,
    vendor: row.vendor || "",
    is_on_deal: (() => {
      if (!row.is_on_deal) return false;
      const regularPrice = Number(row.price) || 0;
      const dealPrice = Number(row.deal_price) || 0;
      if (dealPrice > 0 && regularPrice > 0 && dealPrice < regularPrice * 0.60) {
        console.warn(`⚠️  DEAL BLOCKED — potential loss: ${row.name} deal_price=$${dealPrice.toFixed(2)} vs price=$${regularPrice.toFixed(2)} (>${Math.round((1 - dealPrice/regularPrice)*100)}% off). Not publishing deal. Facu must review.`);
        return false;
      }
      return true;
    })(),
    deal_label: row.deal_label || null,
    deal_price: (() => {
      if (!row.is_on_deal || !row.deal_price) return null;
      const regularPrice = Number(row.price) || 0;
      const dealPrice = Number(row.deal_price);
      if (regularPrice > 0 && dealPrice < regularPrice * 0.60) return null;
      return dealPrice;
    })(),
    deal_expiry: row.deal_expiry || null,
    is_best_seller: row.is_best_seller || false,
    is_featured: row.is_featured || false,
    display_order: row.display_order ?? 999,
    slug: (row.slug || "").replace(/&/g, "and").replace(/[^a-z0-9-]/g, "-").replace(/-{2,}/g, "-").replace(/^-|-$/g, ""),
    images: Array.isArray(row.images) ? row.images : [],
    tier,
    has_photo: Array.isArray(row.images) && row.images.length > 0,
    total_stems: row.total_stems ? Number(row.total_stems) : null,
    contents_note: row.contents_note || null,
    available_from: clampAvailableFrom(row.arrival_date, tier),
  };
}

// Generic paginated GET against a Supabase REST endpoint.
async function fetchAllRest(baseUrl, key, table, params = {}) {
  const out = [];
  let offset = 0;
  const limit = 1000;
  while (true) {
    const usp = new URLSearchParams({
      ...params,
      offset: String(offset),
      limit: String(limit),
    });
    const url = `${baseUrl}/rest/v1/${table}?${usp}`;
    const res = await fetch(url, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      throw new Error(
        `Supabase REST ${table} ${res.status}: ${await res.text()}`,
      );
    }
    const data = await res.json();
    out.push(...data);
    if (data.length < limit) break;
    offset += limit;
  }
  return out;
}

// ============================================================================
// 16-GATE GUARD — fetch publishable SKUs, hide overrides, tier windows from
// supabase-backup. Returns three Sets/Maps the main filter chain consumes.
// ============================================================================
async function fetchBackupGate() {
  console.log("\n=== BACKUP GATE FETCH (supabase-backup) ===");

  // Publishable SKUs from catalog_classifications (status='publishable').
  const clsRows = await fetchAllRest(BACKUP_URL, BACKUP_KEY, "catalog_classifications", {
    select: "sku_id,status",
    status: "eq.publishable",
  });
  const publishableSet = new Set();
  for (const r of clsRows) {
    if (r.sku_id != null) publishableSet.add(Number(r.sku_id));
  }
  console.log(`  catalog_classifications publishable: ${publishableSet.size}`);

  // Active hide overrides from visibility_overrides.
  // Active = decision='hide' AND (expires_at IS NULL OR expires_at > now()).
  // Supabase REST: use `or=(expires_at.is.null,expires_at.gt.<iso>)`.
  const nowIso = new Date().toISOString();
  const ovrRows = await fetchAllRest(BACKUP_URL, BACKUP_KEY, "visibility_overrides", {
    select: "sku_id,decision,expires_at",
    decision: "eq.hide",
    or: `(expires_at.is.null,expires_at.gt.${nowIso})`,
  });
  const hideSet = new Set();
  for (const r of ovrRows) {
    if (r.sku_id != null) hideSet.add(Number(r.sku_id));
  }
  console.log(`  visibility_overrides hide (active): ${hideSet.size}`);

  // Tier windows accepted=true. effective_from <= today AND
  // (effective_until IS NULL OR effective_until >= today).
  const tvwRows = await fetchAllRest(BACKUP_URL, BACKUP_KEY, "tier_visibility_windows", {
    select: "tier,origin_country,accepted,effective_from,effective_until",
    accepted: "eq.true",
  });
  const today = new Date().toISOString().slice(0, 10);
  const openWindows = new Set();
  for (const r of tvwRows) {
    if (r.effective_from && r.effective_from > today) continue;
    if (r.effective_until && r.effective_until < today) continue;
    openWindows.add(`${r.tier}|${r.origin_country}`);
  }
  console.log(`  tier_visibility_windows accepted+in-range: ${openWindows.size}`);
  for (const w of openWindows) console.log(`    open: ${w}`);
  console.log("=== END BACKUP GATE FETCH ===\n");

  return { publishableSet, hideSet, openWindows };
}

// Apply the 16-gate + override + tier-window filter chain. Logs diagnostics
// per stage, including the first 5 dropped SKUs at each stage for spot checks.
function applyPublishabilityFilter(rows, gate) {
  const { publishableSet, hideSet, openWindows } = gate;

  const stage = (label, before, predicate) => {
    const kept = [];
    const dropped = [];
    for (const r of before) {
      if (predicate(r)) kept.push(r);
      else dropped.push(r);
    }
    console.log(
      `  ${label}: kept ${kept.length}, dropped ${dropped.length}`,
    );
    if (dropped.length > 0) {
      console.log(`    first 5 dropped:`);
      for (const r of dropped.slice(0, 5)) {
        console.log(
          `      - [${r.id}] [${r.tier}] "${r.name}" (vendor=${r.vendor || "?"})`,
        );
      }
    }
    return kept;
  };

  console.log("\n=== PUBLISHABILITY FILTER CHAIN ===");
  console.log(`  input: ${rows.length} rows from floropolis_inventory`);

  // Stage 1: must be in publishable set.
  const afterPublishable = stage(
    "stage 1 publishable (catalog_classifications.status='publishable')",
    rows,
    (r) => publishableSet.has(Number(r.id)),
  );

  // Stage 2: must NOT be in active hide-override set.
  const afterHide = stage(
    "stage 2 not-hidden (visibility_overrides.decision!='hide')",
    afterPublishable,
    (r) => !hideSet.has(Number(r.id)),
  );

  // Stage 3: must match an open (tier, origin_country) window.
  const afterTier = stage(
    "stage 3 tier-window open (tier_visibility_windows.accepted=true)",
    afterHide,
    (r) => {
      const country = VENDOR_ORIGIN_COUNTRY[r.vendor];
      if (!country) return false; // fail closed on unmapped vendor
      return openWindows.has(`${r.tier}|${country}`);
    },
  );

  console.log(`  final: ${afterTier.length} rows pass all gates`);
  console.log("=== END FILTER CHAIN ===\n");

  return afterTier;
}

async function main() {
  console.log("Fetching products from Supabase...");
  const rows = await fetchAll();
  console.log(`Total products fetched: ${rows.length}`);

  // === 16-GATE PUBLISHABILITY ENFORCEMENT (Contract P2) ===
  // Must run BEFORE downstream quality scans / image validation / TS emit so
  // we never write a non-publishable SKU into floropolis_products.ts.
  const gate = await fetchBackupGate();
  const gatedRows = applyPublishabilityFilter(rows, gate);
  // Replace `rows` for the remainder of main() — keeps the rest of the
  // pipeline (zero-price filter, image validation, etc.) untouched.
  rows.length = 0;
  rows.push(...gatedRows);

  // Filter: skip products with $0 price or missing vendor — they show "Price pending" which hurts conversion
  // RACI: Job decides what to show, Alvar fixes the data, Rose provides pricing data to Alvar
  const skipped = rows.filter(r => !r.price || Number(r.price) <= 0 || !r.vendor || r.vendor === 'Unknown');
  if (skipped.length > 0) {
    console.warn(`⚠️  Filtered ${skipped.length} products with $0 price or unknown vendor (hidden from site until fixed):`);
    for (const r of skipped) console.log(`  🚫 [${r.tier}] "${r.name}" (ID: ${r.id}, price: ${r.price}, vendor: ${r.vendor})`);
  }
  // Warn on roses without stem_length — these hurt conversion but we don't block other categories
  const ROSE_CATEGORIES = ['Rose'];
  const rosesNoLength = rows.filter(r => r.price && Number(r.price) > 0 && r.vendor && r.vendor !== 'Unknown'
    && ROSE_CATEGORIES.includes(r.category)
    && (!r.length || r.length.trim() === '')
    && !extractLengthFromName(r.name));
  if (rosesNoLength.length > 0) {
    console.warn(`⚠️  ${rosesNoLength.length} Rose products have no stem_length (published but showing without size — fix in floropolis_inventory):`);
    for (const r of rosesNoLength) console.log(`  ⚠️  [${r.tier}] "${r.name}" (ID: ${r.id})`);
  }
  const products = rows.filter(r => r.price && Number(r.price) > 0 && r.vendor && r.vendor !== 'Unknown').map(toProduct);

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

  // === IMAGE VALIDATION — catches broken paths before they reach production ===
  const publicDir = resolve(__dirname, "../public");
  const brokenImages = [];
  const autoFixed = [];

  // Build index of all images on disk for fuzzy matching
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

  // Normalize a filename for fuzzy matching: lowercase, strip extensions, collapse separators
  function normalize(filename) {
    return basename(filename).replace(/\.\w+$/, "").toLowerCase().replace(/[-_]+/g, " ").split(" ").sort().join(" ");
  }

  // Build normalized lookup
  const normalizedMap = new Map();
  for (const img of allImages) {
    normalizedMap.set(normalize(img), `/images/shop/${img}`);
  }

  for (const p of products) {
    if (!p.images || p.images.length === 0) continue;
    const validatedImages = [];
    for (const imgPath of p.images) {
      // Skip external URLs (CDN links etc)
      if (imgPath.startsWith("http")) { validatedImages.push(imgPath); continue; }

      const fullPath = resolve(publicDir, imgPath.replace(/^\//, ""));
      if (existsSync(fullPath)) {
        validatedImages.push(imgPath);
      } else {
        // Try fuzzy match
        const norm = normalize(imgPath);
        const match = normalizedMap.get(norm);
        if (match && existsSync(resolve(publicDir, match.replace(/^\//, "")))) {
          autoFixed.push({ id: p.id, name: p.name, was: imgPath, now: match });
          validatedImages.push(match);
        } else {
          brokenImages.push({ id: p.id, name: p.name, vendor: p.vendor, path: imgPath });
          // Strip the broken image so product shows placeholder instead of broken img
          // (has_photo will be recalculated below)
        }
      }
    }
    p.images = validatedImages;
    p.has_photo = validatedImages.length > 0;
  }

  if (autoFixed.length > 0) {
    console.log(`\n=== IMAGE AUTO-FIX (${autoFixed.length} resolved) ===`);
    for (const f of autoFixed) console.log(`  -> [${f.id}] "${f.name}": ${f.was} => ${f.now}`);
  }

  if (brokenImages.length > 0) {
    console.error(`\n=== BROKEN IMAGES (${brokenImages.length} unresolvable) ===`);
    for (const b of brokenImages) console.error(`  !! [${b.id}] "${b.name}" (${b.vendor}): ${b.path} — FILE NOT FOUND`);
    console.error(`\nThese products will render WITHOUT an image until Supabase is fixed.`);
    console.error(`To fix: update the images column in floropolis_inventory with a path that exists in public/images/shop/\n`);
  }

  const photoCounts = { with: products.filter(p => p.has_photo).length, without: products.filter(p => !p.has_photo).length };
  console.log(`\n=== IMAGE REPORT ===`);
  console.log(`Products with verified images: ${photoCounts.with}`);
  console.log(`Products without images: ${photoCounts.without}`);
  if (autoFixed.length) console.log(`Auto-fixed paths: ${autoFixed.length}`);
  if (brokenImages.length) console.log(`Broken (stripped): ${brokenImages.length}`);
  console.log(`=== END IMAGE REPORT ===\n`);


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
