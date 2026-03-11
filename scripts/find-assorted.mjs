import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { products } = require('/Users/facu/floropolis_products');

const assorted = products.filter(p =>
  p.color?.toLowerCase().includes("assorted") ||
  p.variety?.toLowerCase().includes("combo box") ||
  p.category === "Mixed Boxes"
);

const categories = new Set(assorted.map(p => p.category));
console.log("Categories with assorted/combo:", [...categories]);
console.log("Total products to discount:", assorted.length);
console.log("\nSample:");
assorted.slice(0, 10).forEach(p => {
  console.log(`  ${p.variety} ${p.color} (${p.category}) - $${p.price} | deal: ${p.is_on_deal ? p.deal_price : 'none'}`);
});

// Count how many already have deals
const withDeals = assorted.filter(p => p.is_on_deal);
console.log(`\nAlready on deal: ${withDeals.length}/${assorted.length}`);
console.log(`Need 10% discount: ${assorted.length - withDeals.length}`);
