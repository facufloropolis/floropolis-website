// Preflight: D0 WQS quick-check on the static catalog (floropolis_products.ts).
//
// HARD FAIL:
//   - any product has price <= 0 or NaN (breaks add-to-quote + shows $0 to florists)
//
// SOFT WARN (reports D0 sub-scores, does NOT block):
//   - w0b tier-date window: T1/T2 in [today+5, today+180]; T3 in [today+14, today+180]
//   - stale dates beyond window = "regenerate catalog" signal, not a push-blocker
//
// w0a (coverage vs master catalog) requires Supabase and runs nightly, not here.

import { readFileSync } from 'fs';
import path from 'path';

const PRODUCTS_FILE = path.join(process.cwd(), 'lib/data/floropolis_products.ts');
const src = readFileSync(PRODUCTS_FILE, 'utf8');
const body = src.slice(src.indexOf('['));
const objects = [...body.matchAll(/\{[^{}]*"slug"\s*:\s*"[^"]+"[^{}]*\}/g)].map(m => m[0]);

const today = new Date(); today.setHours(0,0,0,0);
const msPerDay = 86400000;
const dayDiff = (d) => Math.round((new Date(d).setHours(0,0,0,0) - today) / msPerDay);

let total = 0, priceBad = 0, windowBad = 0, tierMissing = 0, dateMissing = 0;
const priceFailures = [], dateFailures = [];

for (const block of objects) {
  total++;
  const slug = (block.match(/"slug"\s*:\s*"([^"]+)"/) || [])[1] || '?';
  const price = parseFloat((block.match(/"price"\s*:\s*([\d.]+)/) || [])[1]);
  const tier = (block.match(/"tier"\s*:\s*"(T[123])"/) || [])[1] || null;
  const dateRaw = (block.match(/"available_from"\s*:\s*"([^"]+)"/) || [])[1] || null;

  if (!(price > 0)) {
    priceBad++;
    if (priceFailures.length < 10) priceFailures.push(`PRICE ${slug}: ${price}`);
    continue;
  }
  if (!tier) { tierMissing++; continue; }
  if (!dateRaw) { dateMissing++; continue; }

  const d = dayDiff(dateRaw);
  const min = (tier === 'T3') ? 14 : 5;
  const max = 180;
  if (d < min || d > max) {
    windowBad++;
    if (dateFailures.length < 5) dateFailures.push(`${slug} (${tier}): ${dateRaw} = ${d}d`);
  }
}

const w0c = total ? ((total - priceBad) / total * 100) : 0;
const rated = total - tierMissing - dateMissing;
const w0b = rated ? ((rated - windowBad) / rated * 100) : 0;

console.log(`  products: ${total}`);
console.log(`  w0c price-sanity:     ${w0c.toFixed(1)}%   (target 100%, hard fail if <100%)`);
console.log(`  w0b tier-date window: ${w0b.toFixed(1)}%   (target 100%, soft warn)`);
if (tierMissing) console.log(`  ⚠  tier missing on ${tierMissing}`);
if (dateMissing) console.log(`  ⚠  available_from missing on ${dateMissing}`);

// Hard fail on price issues only.
if (priceBad > 0) {
  console.log('\n  ❌ Price failures:');
  priceFailures.forEach(f => console.log(`    - ${f}`));
  process.exit(1);
}

// Soft warn on date window.
if (windowBad > 0) {
  console.log(`\n  ⚠  ${windowBad} products with stale/out-of-window dates (sample):`);
  dateFailures.forEach(f => console.log(`    - ${f}`));
  console.log(`     Fix: run \`node scripts/generate-products.mjs\` to refresh from Supabase.`);
  console.log(`     Not blocking, but D0 w0b = ${w0b.toFixed(1)}% — belongs in tonight's heartbeat report.`);
}

process.exit(0);
