import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { products } = require('../lib/data/products');

const discounted = products.filter(p => p.deal_label === "10% Off");
console.log(`Products with 10% Off deal: ${discounted.length}`);
console.log("\nSamples:");
discounted.slice(0, 8).forEach(p => {
  console.log(`  ${p.variety} ${p.color} (${p.category}) — $${p.price} → $${p.deal_price} (${p.deal_label})`);
});

const allDeals = products.filter(p => p.is_on_deal);
console.log(`\nTotal products on any deal: ${allDeals.length} / ${products.length}`);
