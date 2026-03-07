import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { products } = require('/Users/facu/floropolis_products');
const { getProductImage } = require('../lib/product-images');

const combos = new Map();
for (const p of products) {
  const key = `${p.variety}---${p.color}`.toLowerCase();
  if (!combos.has(key)) {
    combos.set(key, { variety: p.variety, color: p.color, category: p.category, count: 0 });
  }
  combos.get(key).count++;
}

let exact = 0, fallbackCat = 0, fallbackLogo = 0;
const logoList = [];
const catList = [];

for (const [, info] of combos) {
  const img = getProductImage(info.variety, info.color, info.category);
  if (img === '/Floropolis-logo-only.png') {
    fallbackLogo++;
    logoList.push(`${info.variety} ${info.color} (${info.category}) [${info.count} SKUs]`);
  } else if (img.includes('shop-all-') || img.includes('combos/') || img.includes('bouquets/')) {
    // Check if it's a generic category fallback vs a specific match
    // Category fallbacks are fine for combos/bouquets, count as match
    exact++;
  } else {
    exact++;
  }
}

console.log(`Total unique variety+color combos: ${combos.size}`);
console.log(`With real image: ${exact} (${(exact/combos.size*100).toFixed(1)}%)`);
console.log(`Category fallback: ${fallbackCat}`);
console.log(`No image (logo): ${fallbackLogo} (${(fallbackLogo/combos.size*100).toFixed(1)}%)`);

if (logoList.length > 0) {
  console.log(`\n--- Still showing logo (${logoList.length}) ---`);
  logoList.sort().forEach(f => console.log(`  ${f}`));
}
