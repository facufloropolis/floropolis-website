#!/bin/bash

echo "🔍 FLOROPOLIS PRE-DEPLOYMENT CHECK"
echo "=================================="
echo ""

PASS=0
FAIL=0
WARN=0

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# ============================================
# TEST 1: CASE-SENSITIVE IMAGE PATHS
# Catches: TESTIMONIALS vs Testimonials (Linux = case-sensitive, macOS = not)
# ============================================
echo "📸 TEST 1: Case-sensitive image paths..."

# Check folder is correctly cased (Testimonials, not TESTIMONIALS)
if [ -d "public/images/Testimonials" ]; then
  echo -e "${GREEN}✅ PASS: public/images/Testimonials/ correctly cased${NC}"
  ((PASS++))
else
  echo -e "${RED}❌ FAIL: public/images/Testimonials/ missing or wrong case (check for TESTIMONIALS/)${NC}"
  ((FAIL++))
fi

# Verify all image src paths in code actually exist on disk (case-sensitive check via node)
node --input-type=module << 'NODESCRIPT' 2>/dev/null
import { readFileSync, existsSync } from 'fs';
import { readdirSync } from 'fs';
import path from 'path';

// Extract all /images/... paths from TSX files
const glob = (dir, ext) => {
  let files = [];
  for (const entry of readdirSync(dir, {withFileTypes:true})) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules' && entry.name !== '.next') files = [...files, ...glob(full, ext)];
    else if (entry.isFile() && entry.name.endsWith(ext)) files.push(full);
  }
  return files;
};

const tsxFiles = glob('app', '.tsx').concat(glob('components', '.tsx')).concat(glob('lib', '.ts'));
const imgPattern = /src=["'](\/images\/[^"']+)["']/g;
const missing = [];
const checked = new Set();

for (const file of tsxFiles) {
  const content = readFileSync(file, 'utf8');
  let m;
  while ((m = imgPattern.exec(content)) !== null) {
    const imgPath = 'public' + decodeURIComponent(m[1]);
    if (checked.has(imgPath)) continue;
    checked.add(imgPath);
    if (!existsSync(imgPath)) missing.push({ file: file.replace(process.cwd()+'/', ''), path: imgPath });
  }
}

if (missing.length === 0) {
  console.log('\x1b[32m✅ PASS: All image src paths exist on disk (case-sensitive)\x1b[0m');
  process.exit(0);
} else {
  console.log('\x1b[31m❌ FAIL: Missing image files (will 404 on Vercel Linux):\x1b[0m');
  missing.forEach(m => console.log(`  ${m.file}: ${m.path}`));
  process.exit(1);
}
NODESCRIPT
if [ $? -eq 0 ]; then ((PASS++)); else ((FAIL++)); fi

echo ""

# ============================================
# TEST 2: DUPLICATE PRODUCT CARDS
# Catches: same variety+color appearing as 2 cards due to different naming
# ============================================
echo "🌸 TEST 2: Duplicate product cards (variety+color grouping)..."

node --input-type=module << 'NODESCRIPT' 2>/dev/null
import { readFileSync } from 'fs';
const content = readFileSync('lib/data/floropolis_products.ts', 'utf8');
const matches = [...content.matchAll(/\{[^{}]*"slug"[^{}]*\}/gs)];
const products = matches.map(m => {
  const get = k => { const r = m[0].match(new RegExp(`"${k}":\\s*"([^"]*)"`)); return r ? r[1] : ''; };
  return { variety: get('variety'), color: get('color'), category: get('category'), name: get('name') };
});

const groups = new Map();
for (const p of products) {
  const key = `${p.variety}---${p.color}---${p.category}`.toLowerCase();
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(p);
}

// Known false positives: genuinely different products that share a substring in variety name
// Format: "variety_a|||variety_b|||category" (order-insensitive, lowercase)
const FALSE_POSITIVES = new Set([
  // Gypsophila 250G = different weight packaging, not a duplicate card
  'cosmic|||cosmic 250g|||gypsophila',
  'polar|||polar 250g|||gypsophila',
  'million stars|||million stars 250g|||gypsophila',
  'million star|||million star 250g|||gypsophila',
  'xlence|||xlence 250g|||gypsophila',
  'new love|||new love 250g|||gypsophila',
  // Rose varieties: "Pink X" is a distinct cultivar from "X" in the trade
  'cream shimmer|||shimmer|||rose',
  'pink cream shimmer|||shimmer|||rose',
  'cream shimmer|||pink cream shimmer|||rose',
  'full monty|||pink full monty|||rose',
  'hot explorer|||pink hot explorer|||rose',
  // Ranunculus: Pink Amandine is a distinct cultivar
  'amandine|||pink amandine|||ranunculus',
]);
const fpKey = (va, vb, cat) => [va, vb].sort().join('|||') + '|||' + cat.toLowerCase();

// Check for varieties that are substrings of others within same category+color
const varieties = [...new Set(products.map(p => `${p.variety}|||${p.category}`))];
const suspicious = [];
for (let i = 0; i < varieties.length; i++) {
  const [va, ca] = varieties[i].split('|||');
  for (let j = i+1; j < varieties.length; j++) {
    const [vb, cb] = varieties[j].split('|||');
    if (ca !== cb) continue;
    if (va === vb) continue;
    if (FALSE_POSITIVES.has(fpKey(va.toLowerCase(), vb.toLowerCase(), ca))) continue;
    if (vb.toLowerCase().includes(va.toLowerCase()) || va.toLowerCase().includes(vb.toLowerCase())) {
      // Check if they share any color
      const colorsA = new Set(products.filter(p => p.variety===va && p.category===ca).map(p=>p.color));
      const colorsB = new Set(products.filter(p => p.variety===vb && p.category===cb).map(p=>p.color));
      const shared = [...colorsA].filter(c => colorsB.has(c));
      if (shared.length > 0) suspicious.push(`"${va}" + "${vb}" [${ca}] shared colors: ${shared.join(', ')}`);
    }
  }
}

if (suspicious.length === 0) {
  console.log('\x1b[32m✅ PASS: No duplicate product cards detected\x1b[0m');
  process.exit(0);
} else {
  console.log('\x1b[31m❌ FAIL: Duplicate product cards found (same plant, different variety name):\x1b[0m');
  suspicious.forEach(s => console.log(`  ${s}`));
  process.exit(1);
}
NODESCRIPT
if [ $? -eq 0 ]; then ((PASS++)); else ((FAIL++)); fi

echo ""

# ============================================
# TEST 3: EXTERNAL LINKS USING NEXT.JS <LINK>
# Catches: href="https://..." inside <Link> component (should use <a> for external)
# ============================================
echo "🔗 TEST 3: External URLs not wrapped in Next.js <Link>..."

BAD_LINKS=$(grep -rn 'href={.*"https://' app/ components/ 2>/dev/null | grep -v "//\|\.test\." || true)
BAD_LINKS2=$(grep -rn "href='https://" app/ components/ 2>/dev/null | grep -v "//\|\.test\." || true)

if [ -z "$BAD_LINKS" ] && [ -z "$BAD_LINKS2" ]; then
  echo -e "${GREEN}✅ PASS: No external https:// URLs in dynamic href props${NC}"
  ((PASS++))
else
  # Check if they're inside <Link components
  LINK_EXTERNAL=$(grep -B5 'href={.*"https://' app/ components/ -rn 2>/dev/null | grep -B5 "href" | grep "<Link" | head -5 || true)
  if [ -n "$LINK_EXTERNAL" ]; then
    echo -e "${RED}❌ FAIL: External URL inside Next.js <Link> — use <a> tag instead:${NC}"
    echo "$BAD_LINKS" | head -5
    ((FAIL++))
  else
    echo -e "${GREEN}✅ PASS: External URLs in <a> tags (OK)${NC}"
    ((PASS++))
  fi
fi

echo ""

# ============================================
# TEST 4: PRODUCT DATA INTEGRITY
# ============================================
echo "📦 TEST 4: Product data integrity..."

node --input-type=module << 'NODESCRIPT' 2>/dev/null
import { readFileSync } from 'fs';
const content = readFileSync('lib/data/floropolis_products.ts', 'utf8');
const matches = [...content.matchAll(/\{[^{}]*"slug"[^{}]*\}/gs)];
const products = matches.map(m => {
  const get = k => { const r = m[0].match(new RegExp(`"${k}":\\s*"([^"]*)"`)); return r ? r[1] : ''; };
  const getN = k => { const r = m[0].match(new RegExp(`"${k}":\\s*([\\d.]+)`)); return r ? parseFloat(r[1]) : 0; };
  return { slug: get('slug'), name: get('name'), variety: get('variety'), color: get('color'), price: getN('price') };
});

const errors = [];

// Check for duplicate slugs
const slugs = products.map(p => p.slug);
const dupSlugs = slugs.filter((s, i) => slugs.indexOf(s) !== i);
if (dupSlugs.length) errors.push(`Duplicate slugs: ${[...new Set(dupSlugs)].join(', ')}`);

// Check for zero/negative prices — known issue slugs are warnings only, new ones are errors
const KNOWN_ZERO_PRICE_SLUGS = new Set(['focal-scoop-burgundy-55-60cm']);
const zeroPrices = products.filter(p => p.price <= 0);
const newZeroPrices = zeroPrices.filter(p => !KNOWN_ZERO_PRICE_SLUGS.has(p.slug));
const knownZeroPrices = zeroPrices.filter(p => KNOWN_ZERO_PRICE_SLUGS.has(p.slug));
if (knownZeroPrices.length) console.log('\x1b[33m⚠️  WARN: Known $0 price (Alvar owns): ' + knownZeroPrices.map(p=>p.name).join(', ') + '\x1b[0m');
if (newZeroPrices.length) errors.push(`${newZeroPrices.length} NEW products with price <= 0: ${newZeroPrices.slice(0,3).map(p=>p.name).join(', ')}...`);

// Check for known generic variety names that should be normalized
const genericVarieties = ['Large', 'XLarge', 'Small', 'FullStar', 'Green', 'Lemon'];
const stillGeneric = products.filter(p => genericVarieties.includes(p.variety));
if (stillGeneric.length) errors.push(`Generic variety names still present: ${[...new Set(stillGeneric.map(p=>p.variety))].join(', ')}`);

// Check for "Novelty Tropicals" prefix (should be removed)
const noveltyPrefix = products.filter(p => p.variety.startsWith('Novelty Tropicals '));
if (noveltyPrefix.length) errors.push(`"Novelty Tropicals" prefix still present: ${noveltyPrefix.map(p=>p.variety).join(', ')}`);

if (errors.length === 0) {
  console.log('\x1b[32m✅ PASS: Product data integrity OK\x1b[0m');
  process.exit(0);
} else {
  console.log('\x1b[31m❌ FAIL: Product data issues:\x1b[0m');
  errors.forEach(e => console.log(`  - ${e}`));
  process.exit(1);
}
NODESCRIPT
if [ $? -eq 0 ]; then ((PASS++)); else ((FAIL++)); fi

echo ""

# ============================================
# TEST 5: ENV VARS PRESENT LOCALLY
# ============================================
echo "🔑 TEST 5: Required env vars in .env.local..."

REQUIRED_VARS=(
  "NEXT_PUBLIC_SUPABASE_URL"
  "NEXT_PUBLIC_SUPABASE_ANON_KEY"
  "BREVO_API_KEY"
  "GOOGLE_SHEETS_QUOTES_ID"
  "GOOGLE_SHEETS_CREDENTIALS"
  "FACU_EMAIL"
  "JJ_EMAIL"
)

MISSING_VARS=0
for var in "${REQUIRED_VARS[@]}"; do
  if ! grep -q "^${var}=" .env.local 2>/dev/null; then
    echo -e "${RED}❌ Missing: $var${NC}"
    ((FAIL++))
    MISSING_VARS=1
  fi
done

# Check dead var is NOT present
if grep -q "^GOOGLE_SHEETS_APPS_SCRIPT_URL=" .env.local 2>/dev/null; then
  if ! grep -q "^#" .env.local 2>/dev/null; then
    echo -e "${YELLOW}⚠️  WARN: GOOGLE_SHEETS_APPS_SCRIPT_URL is set — this blocks service account. Should be commented out.${NC}"
    ((WARN++))
  fi
fi

if [ $MISSING_VARS -eq 0 ]; then
  echo -e "${GREEN}✅ PASS: All required env vars present${NC}"
  ((PASS++))
fi

echo ""

# ============================================
# TEST 6: GA4 TRACKING
# ============================================
echo "📊 TEST 6: GA4 tracking..."

if grep -rq "pushEvent\|CTA_EVENTS" app/ 2>/dev/null; then
  echo -e "${GREEN}✅ PASS: GA4 event tracking present${NC}"
  ((PASS++))
else
  echo -e "${RED}❌ FAIL: No GA4 event tracking found${NC}"
  ((FAIL++))
fi

echo ""

# ============================================
# TEST 7: BUILD
# ============================================
echo "🏗️  TEST 7: Build check..."

if npm run build > /dev/null 2>&1; then
  echo -e "${GREEN}✅ PASS: Build successful${NC}"
  ((PASS++))
else
  echo -e "${RED}❌ FAIL: Build failed — run 'npm run build' for details${NC}"
  ((FAIL++))
fi

echo ""

# ============================================
# FINAL REPORT
# ============================================
echo "=================================="
echo "📋 FINAL REPORT"
echo "=================================="
echo -e "${GREEN}✅ Passed: $PASS${NC}"
echo -e "${RED}❌ Failed: $FAIL${NC}"
echo -e "${YELLOW}⚠️  Warnings: $WARN${NC}"
echo ""

if [ $FAIL -eq 0 ]; then
  echo -e "${GREEN}🎉 ALL CRITICAL TESTS PASSED — SAFE TO DEPLOY${NC}"
  exit 0
else
  echo -e "${RED}🚫 DEPLOYMENT BLOCKED — FIX FAILURES BEFORE DEPLOYING${NC}"
  exit 1
fi
