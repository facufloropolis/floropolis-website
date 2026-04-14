// Preflight + WQS D2: real image resolution audit matching lib/product-images.ts getProductImage().
//
// HARD FAIL: any IMAGE_MAP or CATEGORY_IMAGE_MAP entry points to a missing file on disk.
// EMITS (for heartbeat parsing):
//   "D2 variety-specific: X% (N/total)"
//   "D2 any-image: X%"
// SOFT WARN: products falling to logo fallback.

import { readFileSync, existsSync } from "fs";
import path from "path";

const ROOT = process.cwd();
const IMAGE_MAP_FILE = path.join(ROOT, "lib/product-images.ts");
const PRODUCTS_FILE = path.join(ROOT, "lib/data/floropolis_products.ts");

if (!existsSync(IMAGE_MAP_FILE)) { console.error(`⚠  Missing ${IMAGE_MAP_FILE}`); process.exit(0); }

const src = readFileSync(IMAGE_MAP_FILE, "utf8");

function extractConst(name) {
  const re = new RegExp("const\\s+" + name + "\\b[^=]*=\\s*\\{");
  const m = re.exec(src);
  if (!m) return "";
  const start = m.index + m[0].length;
  const end = src.indexOf("\n};", start);
  return src.slice(start, end);
}
// Accept both quoted ("Mixed Boxes": ...) and unquoted (Rose: ...) keys.
function parseMap(body) {
  const out = {};
  const re = /^\s*(?:["']([^"']+)["']|([A-Za-z][A-Za-z0-9_ &]*?))\s*:\s*["']([^"']+)["']/gm;
  for (const m of body.matchAll(re)) {
    const key = (m[1] ?? m[2] ?? "").trim();
    if (key) out[key] = m[3];
  }
  return out;
}

const IMAGE_MAP = parseMap(extractConst("IMAGE_MAP"));
const CATEGORY_IMAGE_MAP = parseMap(extractConst("CATEGORY_IMAGE_MAP"));

// ━━━ Hard check: every local path resolves on disk ━━━
const allEntries = { ...IMAGE_MAP, ...CATEGORY_IMAGE_MAP };
const missingFiles = [];
for (const [slug, value] of Object.entries(allEntries)) {
  if (value.startsWith("http://") || value.startsWith("https://")) continue;
  if (!value.startsWith("/")) continue;
  const onDisk = path.join(ROOT, "public", value.slice(1));
  if (!existsSync(onDisk)) missingFiles.push(`${slug} → ${value}`);
}

console.log(`  IMAGE_MAP entries:          ${Object.keys(IMAGE_MAP).length}`);
console.log(`  CATEGORY_IMAGE_MAP entries: ${Object.keys(CATEGORY_IMAGE_MAP).length}`);
if (missingFiles.length) {
  console.log(`\n  ❌ ${missingFiles.length} map entries point to missing files:`);
  missingFiles.slice(0,20).forEach(f => console.log(`    - ${f}`));
  process.exit(1);
}

// ━━━ D2 audit: simulate getProductImage for every product ━━━
if (!existsSync(PRODUCTS_FILE)) { console.log("  (no products file — skipping D2 audit)"); process.exit(0); }

const normalize = (s) => (s || "").toLowerCase().replace(/\s+/g, "-").replace(/['']/g, "'").trim();
const catFolderMap = {
  Rose: "roses", Anemone: "anemone", Ranunculus: "ranunculus", Delphinium: "delphinium",
  "Greens & Foliage": "greens", Tropicals: "tropicals", Bouquets: "bouquets",
  "Mixed Boxes": "combos", Gypsophila: "other", Scabiosa: "other", "Bells of Ireland": "other",
  Craspedia: "other", Thistle: "other", Larkspur: "delphinium",
};
function resolve(variety, color, category) {
  const v = normalize(variety), c = normalize(color);
  const keys = [];
  if (v && c) keys.push(`${v}-${c}`);
  if (v) keys.push(v);
  for (const k of keys) if (IMAGE_MAP[k]) return "exact";
  const catFolder = catFolderMap[category];
  if (catFolder) {
    const entries = Object.entries(IMAGE_MAP).filter(([, p]) => p.includes(`/${catFolder}/`));
    if (v.length >= 4) {
      for (const [k] of entries) if (k.startsWith(v)) return "fuzzy_prefix";
      for (const [k] of entries) if (k.length >= 4 && v.startsWith(k)) return "fuzzy_starts";
    }
    if (v.length >= 5) {
      for (const [k] of entries) if (k.includes(v)) return "fuzzy_contains";
    }
  }
  if (CATEGORY_IMAGE_MAP[category]) return "category_fallback";
  return "logo_fallback";
}

const psrc = readFileSync(PRODUCTS_FILE, "utf8");
const body = psrc.slice(psrc.indexOf("["));
const blocks = body.match(/\{[^{}]*"slug"\s*:\s*"[^"]+"[^{}]*\}/g) || [];

const counts = { http_image: 0, exact: 0, fuzzy_prefix: 0, fuzzy_starts: 0, fuzzy_contains: 0, category_fallback: 0, logo_fallback: 0 };
for (const b of blocks) {
  const variety = (b.match(/"variety"\s*:\s*"([^"]*)"/) || [])[1] || "";
  const color = (b.match(/"color"\s*:\s*"([^"]*)"/) || [])[1] || "";
  const category = (b.match(/"category"\s*:\s*"([^"]*)"/) || [])[1] || "";
  const imagesMatch = b.match(/"images"\s*:\s*\[([^\]]*)\]/);
  const hasHttp = imagesMatch && /"https?:\/\/[^"]+"/.test(imagesMatch[1]);
  if (hasHttp) { counts.http_image++; continue; }
  counts[resolve(variety, color, category)]++;
}

const total = blocks.length;
const specific = counts.http_image + counts.exact + counts.fuzzy_prefix + counts.fuzzy_starts + counts.fuzzy_contains;
const real = total - counts.logo_fallback;

console.log(`  products scanned: ${total}`);
console.log(`  D2 variety-specific: ${(specific/total*100).toFixed(1)}% (${specific}/${total})`);
console.log(`  D2 any-image:        ${(real/total*100).toFixed(1)}%`);
console.log(`  Category-generic:    ${counts.category_fallback}`);
console.log(`  Logo fallback:       ${counts.logo_fallback}`);

if (counts.logo_fallback > 0) {
  console.log(`  ⚠  ${counts.logo_fallback} products render the logo (category not in CATEGORY_IMAGE_MAP).`);
}
process.exit(0);
