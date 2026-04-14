// Preflight: every IMAGE_MAP / CATEGORY_IMAGE_MAP entry that points to a local file must exist on disk.
// L-02 breakage mode: map references a path, file was never added, 404s in production.
//
// HARD FAIL: any map local value → missing file on disk.
// SOFT WARN: products with no image source (no HTTP url AND no IMAGE_MAP entry).

import { readFileSync, existsSync } from 'fs';
import path from 'path';

const ROOT = process.cwd();
const PRODUCTS_FILE = path.join(ROOT, 'lib/data/floropolis_products.ts');
const IMAGE_MAP_FILE = path.join(ROOT, 'lib/product-images.ts');

if (!existsSync(IMAGE_MAP_FILE)) {
  console.error(`⚠  Missing ${IMAGE_MAP_FILE} — skipping hard check.`);
  process.exit(0);
}

const src = readFileSync(IMAGE_MAP_FILE, 'utf8');

// Extract the body of any top-level object literal named *_MAP or IMAGE_MAP.
// Captures balanced braces by locating opening `= {` and the first `\n};` closure.
function extractMap(name) {
  const re = new RegExp(`const\\s+${name}\\b[^=]*=\\s*\\{`);
  const m = re.exec(src);
  if (!m) return null;
  const start = m.index + m[0].length;
  const end = src.indexOf('\n};', start);
  if (end === -1) return null;
  return src.slice(start, end);
}

const mapBlocks = ['IMAGE_MAP', 'CATEGORY_IMAGE_MAP'].map(n => ({ name: n, body: extractMap(n) })).filter(b => b.body);
if (mapBlocks.length === 0) {
  console.error(`❌ No IMAGE_MAP/CATEGORY_IMAGE_MAP const found in ${IMAGE_MAP_FILE}`);
  process.exit(1);
}

let totalEntries = 0, localCount = 0, remoteCount = 0, missing = 0;
const missingFiles = [];
const allKeys = new Set();

for (const { name, body } of mapBlocks) {
  const entries = [...body.matchAll(/^\s*["']([^"']+)["']\s*:\s*["']([^"']+)["']/gm)];
  for (const [, slug, value] of entries) {
    totalEntries++;
    allKeys.add(slug);
    if (value.startsWith('http://') || value.startsWith('https://')) { remoteCount++; continue; }
    if (!value.startsWith('/')) continue; // skip alias / non-path values
    localCount++;
    const onDisk = path.join(ROOT, 'public', value.slice(1));
    if (!existsSync(onDisk)) {
      missing++;
      if (missingFiles.length < 20) missingFiles.push(`[${name}] ${slug} → ${value}`);
    }
  }
}

console.log(`  Maps scanned: ${mapBlocks.map(b => b.name).join(', ')}`);
console.log(`  Entries: ${totalEntries} (local: ${localCount}, remote: ${remoteCount})`);
console.log(`  Local files resolve: ${localCount - missing}/${localCount}`);

if (missing > 0) {
  console.log(`\n  ❌ ${missing} map entries point to missing files:`);
  missingFiles.forEach(f => console.log(`    - ${f}`));
  process.exit(1);
}

// Soft warn on products with no reachable source.
if (existsSync(PRODUCTS_FILE)) {
  const psrc = readFileSync(PRODUCTS_FILE, 'utf8');
  const body = psrc.slice(psrc.indexOf('['));
  const objects = [...body.matchAll(/\{[^{}]*"slug"\s*:\s*"[^"]+"[^{}]*\}/g)].map(m => m[0]);
  let noSource = 0;
  for (const obj of objects) {
    const slug = (obj.match(/"slug"\s*:\s*"([^"]+)"/) || [])[1];
    if (!slug) continue;
    const imagesMatch = obj.match(/"images"\s*:\s*\[([^\]]*)\]/);
    const hasHttp = imagesMatch && /"https?:\/\/[^"]+"/.test(imagesMatch[1]);
    if (!hasHttp && !allKeys.has(slug)) noSource++;
  }
  if (noSource > 0) {
    const rate = (noSource / objects.length * 100).toFixed(1);
    console.log(`  ⚠  ${noSource}/${objects.length} products (${rate}%) have no image source → placeholder fallback.`);
    console.log(`     Not blocking. D2 (WQS) target: <10%.`);
  }
}

process.exit(0);
