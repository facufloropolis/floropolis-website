import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { products } = require('/Users/facu/floropolis_products');

const combos = new Map();
for (const p of products) {
  const key = `${p.variety}---${p.color}`.toLowerCase();
  if (!combos.has(key)) {
    combos.set(key, { variety: p.variety, color: p.color, category: p.category, count: 0 });
  }
  combos.get(key).count++;
}

const byCategory = {};
for (const [, info] of combos) {
  if (!byCategory[info.category]) byCategory[info.category] = [];
  byCategory[info.category].push(`${info.variety} ${info.color} [${info.count} SKUs]`);
}

console.log(`Total unique variety+color combos: ${combos.size}`);
for (const [cat, items] of Object.entries(byCategory).sort()) {
  console.log(`\n${cat} (${items.length} varieties):`);
  items.sort().forEach(i => console.log(`  ${i}`));
}
