import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { products } = require('../lib/data/products');
const { getProductImage } = require('../lib/product-images');

let mismatches = 0;
let noImage = 0;
const issues = [];

// Check all unique variety+color combos
const seen = new Set();
for (const p of products) {
  const key = `${p.variety}---${p.color}---${p.category}`;
  if (seen.has(key)) continue;
  seen.add(key);

  const img = getProductImage(p.variety, p.color, p.category);

  if (img === '/Floropolis-logo-only.png') {
    noImage++;
    continue;
  }

  // Check for cross-category mismatches
  const isRose = p.category === 'Rose';
  const imgHasRanunculus = img.includes('/ranunculus/');
  const imgHasAnemone = img.includes('/anemone/');

  if (isRose && (imgHasRanunculus || imgHasAnemone)) {
    mismatches++;
    issues.push(`MISMATCH: Rose "${p.variety} ${p.color}" → ${img}`);
  }

  // Check ranunculus getting rose images
  if (p.category === 'Ranunculus' && img.includes('/roses/')) {
    mismatches++;
    issues.push(`MISMATCH: Ranunculus "${p.variety} ${p.color}" → ${img}`);
  }
}

console.log(`Checked: ${seen.size} unique combos`);
console.log(`No image: ${noImage}`);
console.log(`Cross-category mismatches: ${mismatches}`);

if (issues.length > 0) {
  console.log('\n--- ISSUES ---');
  issues.forEach(i => console.log(`  ${i}`));
} else {
  console.log('\nNo cross-category mismatches found!');
}

// Show some rose samples
console.log('\n--- Rose image samples ---');
const roses = products.filter(p => p.category === 'Rose');
const rosesSeen = new Set();
for (const p of roses.slice(0, 20)) {
  const k = `${p.variety}-${p.color}`;
  if (rosesSeen.has(k)) continue;
  rosesSeen.add(k);
  const img = getProductImage(p.variety, p.color, p.category);
  console.log(`  ${p.variety} ${p.color} → ${img.split('/').pop()}`);
}
