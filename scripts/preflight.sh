#!/bin/bash
# Preflight gate — blocks pushes that would break production.
# Installed by Job_PM 2026-04-14 — prevents image/catalog/link breakage.

set -e
cd "$(git rev-parse --show-toplevel)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

fail() { echo -e "${RED}❌ $1${NC}"; exit 1; }
pass() { echo -e "${GREEN}✅ $1${NC}"; }
warn() { echo -e "${YELLOW}⚠  $1${NC}"; }

echo "🛫 PREFLIGHT — Floropolis deploy gate"
echo "========================================"

# 1. npm run build (L-20)
echo ""
echo "▶ 1/5 npm run build"
if npm run build > /tmp/preflight_build.log 2>&1; then
  pass "Build passed"
else
  tail -40 /tmp/preflight_build.log
  fail "Build failed — see /tmp/preflight_build.log"
fi

# 2. Image path case sensitivity
echo ""
echo "▶ 2/5 image path case sensitivity"
if [ -d "public/images/Testimonials" ]; then
  pass "Testimonials folder cased correctly"
else
  fail "public/images/Testimonials missing or miscased"
fi

# 3. Image reference integrity (L-02)
echo ""
echo "▶ 3/5 image references (every IMAGE_MAP entry resolves)"
node scripts/check-image-refs.mjs || fail "Broken image references"
pass "All image references resolve"

# 4. Image size — hard fail on files >10MB (catches catastrophic new additions); warn 500KB+
echo ""
echo "▶ 4/5 image size check (hard fail >10MB; warn 500KB+ (D2 backlog))"
OVERSIZE=$(find public -type f \( -name '*.png' -o -name '*.jpg' -o -name '*.jpeg' -o -name '*.webp' \) -size +10M 2>/dev/null | head -5)
if [ -z "$OVERSIZE" ]; then
  pass "No images over 10MB"
else
  echo "$OVERSIZE"
  fail "Images over 10MB — compress (sips/pngquant) before push"
fi
WARN_COUNT=$(find public -type f \( -name '*.png' -o -name '*.jpg' -o -name '*.jpeg' -o -name '*.webp' \) -size +500k -size -2M 2>/dev/null | wc -l | tr -d ' ')
if [ "$WARN_COUNT" -gt 0 ]; then warn "$WARN_COUNT files 500KB-2MB (track in D2 backlog)"; fi

# 5. Catalog integrity (D0 WQS)
echo ""
echo "▶ 5/5 catalog integrity (D0 w0b/w0c)"
node scripts/verify-catalog.mjs || fail "Catalog integrity failed"
pass "Catalog integrity green"

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}✅ PREFLIGHT GREEN — safe to push${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Post-push: verify Vercel shows ● Ready before ending session."
exit 0
