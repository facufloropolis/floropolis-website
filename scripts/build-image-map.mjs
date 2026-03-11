/**
 * Generates the product image mapping by scanning actual files
 * in public/images/shop/ and matching to product varieties.
 *
 * Run: node scripts/build-image-map.mjs
 * Output: prints the TypeScript map to paste into lib/product-images.ts
 */
import fs from 'fs';
import path from 'path';

const SHOP_DIR = path.join(process.cwd(), 'public/images/shop');

// Scan all subdirectories
const categories = fs.readdirSync(SHOP_DIR, { withFileTypes: true });
const imageFiles = {};

for (const entry of categories) {
  if (entry.isDirectory()) {
    const catDir = path.join(SHOP_DIR, entry.name);
    const files = fs.readdirSync(catDir).filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f));
    imageFiles[entry.name] = files;
  }
}

// Also scan root files
const rootFiles = fs.readdirSync(SHOP_DIR).filter(f => {
  const full = path.join(SHOP_DIR, f);
  return fs.statSync(full).isFile() && /\.(png|jpg|jpeg|webp)$/i.test(f);
});

console.log('\n=== Image Inventory ===');
for (const [cat, files] of Object.entries(imageFiles)) {
  console.log(`${cat}: ${files.length} files`);
}
console.log(`root: ${rootFiles.length} files`);

// Build the variety map from Komet naming: variety-color.ext -> /images/shop/category/filename
console.log('\n=== Generated Map Entries ===');
const mapEntries = [];

for (const [cat, files] of Object.entries(imageFiles)) {
  // Prefer .png over .jpg
  const pngFiles = new Set(files.filter(f => f.endsWith('.png')).map(f => f.replace('.png', '')));

  for (const file of files) {
    const base = file.replace(/\.(png|jpg|jpeg|webp)$/i, '');
    // Skip .jpg if .png exists for same base
    if (!file.endsWith('.png') && pngFiles.has(base)) continue;

    const imagePath = `/images/shop/${cat}/${file}`;
    mapEntries.push({ key: base, path: imagePath, category: cat });
  }
}

// Print as TypeScript
console.log('\nconst IMAGE_MAP: Record<string, string> = {');
for (const entry of mapEntries.sort((a, b) => a.category.localeCompare(b.category) || a.key.localeCompare(b.key))) {
  console.log(`  "${entry.key}": "${entry.path}",`);
}
console.log('};');

console.log(`\nTotal entries: ${mapEntries.length}`);
