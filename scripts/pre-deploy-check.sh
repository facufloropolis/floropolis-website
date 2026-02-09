#!/bin/bash

echo "🔍 FLOROPOLIS PRE-DEPLOYMENT CHECK"
echo "=================================="
echo ""

PASS=0
FAIL=0
WARN=0

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# ============================================
# TEST 1: IMAGE FILES CHECK
# ============================================
echo "📸 TEST 1: Checking image files..."

MISSING_IMAGES=0

# Check TESTIMONIALS folder exists
if [ ! -d "public/images/TESTIMONIALS" ]; then
  echo -e "${RED}❌ FAIL: public/images/TESTIMONIALS/ folder missing${NC}"
  ((FAIL++))
  MISSING_IMAGES=1
else
  # Required testimonial images (actual filenames with spaces – referenced in app)
  REQUIRED_IMAGES=(
    "WhatsApp Image 2025-11-09 at 18.21.31.jpeg"
    "WhatsApp Image 2025-12-12 at 10.04.44 (2).jpeg"
    "WhatsApp Image 2026-01-30 at 10.28.32.jpeg"
    "WhatsApp Image 2025-12-12 at 10.04.44.jpeg"
    "WhatsApp Image 2025-12-12 at 10.04.45.jpeg"
    "WhatsApp Image 2026-02-01 at 10.12.56.jpeg"
    "WhatsApp Image 2026-02-01 at 10.12.56 (1).jpeg"
    "WhatsApp Image 2025-11-07 at 17.08.07.jpeg"
  )

  for img in "${REQUIRED_IMAGES[@]}"; do
    if [ ! -f "public/images/TESTIMONIALS/$img" ]; then
      echo -e "${RED}❌ Missing: $img${NC}"
      ((FAIL++))
      MISSING_IMAGES=1
    fi
  done

  if [ $MISSING_IMAGES -eq 0 ]; then
    echo -e "${GREEN}✅ PASS: All testimonial images present${NC}"
    ((PASS++))
  fi
fi

# Check product images (including Summer Flowers: Anemones, Delphinium)
PRODUCT_IMAGES=(
  "Ranunculus_White_FINAL.PNG"
  "Ranunculus_Red_FINAL.png"
  "Ranunculus_Hot_Pink_FINAL.PNG"
  "Eucalyptus_Silve_Dollar_Green_FINAL.jpg"
  "Anemone_3.png"
  "Delphinium Sea Waltz Dark Blue FINAL.png"
)

MISSING_PRODUCTS=0
for img in "${PRODUCT_IMAGES[@]}"; do
  if [ ! -f "public/images/shop/$img" ]; then
    echo -e "${RED}❌ Missing product image: $img${NC}"
    ((FAIL++))
    MISSING_PRODUCTS=1
  fi
done

if [ $MISSING_PRODUCTS -eq 0 ]; then
  echo -e "${GREEN}✅ PASS: All product images present${NC}"
  ((PASS++))
fi

echo ""

# ============================================
# TEST 2: GA4 TRACKING CHECK
# ============================================
echo "📊 TEST 2: Checking GA4 tracking implementation..."

# Check for GA4 events
if grep -rq "pushEvent\|handleOutboundClick" app/ 2>/dev/null; then
  echo -e "${GREEN}✅ PASS: GA4 event tracking found${NC}"
  ((PASS++))
else
  echo -e "${RED}❌ FAIL: No GA4 event tracking found${NC}"
  ((FAIL++))
fi

# Check for UTM parameters on Komet links
KOMET_LINKS=$(grep -r "eshops.kometsales.com" app/ 2>/dev/null | grep -v "utm_source" || true)
if [ -z "$KOMET_LINKS" ]; then
  echo -e "${GREEN}✅ PASS: All Komet links have UTM parameters${NC}"
  ((PASS++))
else
  echo -e "${YELLOW}⚠️  WARN: Some Komet links missing UTM parameters${NC}"
  echo "$KOMET_LINKS"
  ((WARN++))
fi

echo ""

# ============================================
# TEST 3: DEEP LINK VERIFICATION
# ============================================
echo "🔗 TEST 3: Checking deep links..."

# Extract all Komet URLs
KOMET_URLS=$(grep -roh 'https://eshops\.kometsales\.com/[^"]*' app/ 2>/dev/null | sort -u)

if [ -z "$KOMET_URLS" ]; then
  echo -e "${RED}❌ FAIL: No Komet links found${NC}"
  ((FAIL++))
else
  echo -e "${GREEN}✅ PASS: Found $(echo "$KOMET_URLS" | wc -l | tr -d ' ') unique Komet links${NC}"
  echo "Links:"
  echo "$KOMET_URLS" | sed 's/^/  - /'
  ((PASS++))
fi

echo ""

# ============================================
# TEST 4: CODE QUALITY CHECKS
# ============================================
echo "🔍 TEST 4: Code quality checks..."

# Check for console.log (should be removed in production)
CONSOLE_LOGS=$(grep -r "console\.log" app/ 2>/dev/null | wc -l | tr -d ' ')
if [ "$CONSOLE_LOGS" -gt 0 ]; then
  echo -e "${YELLOW}⚠️  WARN: Found $CONSOLE_LOGS console.log statements${NC}"
  ((WARN++))
else
  echo -e "${GREEN}✅ PASS: No console.log statements${NC}"
  ((PASS++))
fi

# Check for TODO comments
TODOS=$(grep -r "TODO\|FIXME" app/ 2>/dev/null | wc -l | tr -d ' ')
if [ "$TODOS" -gt 0 ]; then
  echo -e "${YELLOW}⚠️  WARN: Found $TODOS TODO/FIXME comments${NC}"
  ((WARN++))
else
  echo -e "${GREEN}✅ PASS: No TODO comments${NC}"
  ((PASS++))
fi

echo ""

# ============================================
# TEST 5: BUILD CHECK
# ============================================
echo "🏗️  TEST 5: Running build check..."

if npm run build > /dev/null 2>&1; then
  echo -e "${GREEN}✅ PASS: Build successful${NC}"
  ((PASS++))
else
  echo -e "${RED}❌ FAIL: Build failed - run 'npm run build' for details${NC}"
  ((FAIL++))
fi

echo ""

# ============================================
# TEST 6: LIGHTHOUSE AUDIT (if installed)
# ============================================
echo "🚦 TEST 6: Performance check..."

if command -v lighthouse &> /dev/null; then
  echo "Running Lighthouse audit on localhost:3000..."

  # Start dev server in background
  npm run dev > /dev/null 2>&1 &
  DEV_PID=$!

  # Wait for server to start
  sleep 5

  # Run lighthouse
  if lighthouse http://localhost:3000 \
    --only-categories=performance,accessibility,seo \
    --output=json \
    --output-path=./lighthouse-report.json \
    --chrome-flags="--headless" \
    --quiet 2>/dev/null; then

    # Parse scores (no bc dependency)
    PERF_SCORE=$(node -pe "JSON.parse(require('fs').readFileSync('./lighthouse-report.json')).categories.performance.score * 100")
    A11Y_SCORE=$(node -pe "JSON.parse(require('fs').readFileSync('./lighthouse-report.json')).categories.accessibility.score * 100")
    SEO_SCORE=$(node -pe "JSON.parse(require('fs').readFileSync('./lighthouse-report.json')).categories.seo.score * 100")

    echo "Performance: $PERF_SCORE/100"
    echo "Accessibility: $A11Y_SCORE/100"
    echo "SEO: $SEO_SCORE/100"

    if awk "BEGIN { exit !($PERF_SCORE >= 70) }"; then
      echo -e "${GREEN}✅ PASS: Performance score acceptable${NC}"
      ((PASS++))
    else
      echo -e "${RED}❌ FAIL: Performance score below 70${NC}"
      ((FAIL++))
    fi
  else
    echo -e "${YELLOW}⚠️  WARN: Lighthouse run failed (is dev server up?)${NC}"
    ((WARN++))
  fi

  # Kill dev server and any child next processes
  kill $DEV_PID 2>/dev/null
  pkill -f "next dev" 2>/dev/null
  wait $DEV_PID 2>/dev/null

  # Clean up
  rm -f lighthouse-report.json
else
  echo -e "${YELLOW}⚠️  SKIP: Lighthouse not installed (npm install -g lighthouse)${NC}"
  ((WARN++))
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
  echo -e "${GREEN}🎉 ALL CRITICAL TESTS PASSED - SAFE TO DEPLOY${NC}"
  exit 0
else
  echo -e "${RED}🚫 DEPLOYMENT BLOCKED - FIX FAILURES BEFORE DEPLOYING${NC}"
  exit 1
fi
