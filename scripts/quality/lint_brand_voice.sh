#!/usr/bin/env bash
# Brand voice lint -- J.5 made real
# v1 | 2026-05-17 | Job_PM [V8 SHADOW]
#
# Enforces ~/Claude_MA_v8/Job_PM/kb/brand_voice.md across customer-facing code:
#   1. ASCII-clean rule: zero chars with ord > 127 in app/ (excluding mockups)
#   2. Never-say list: banned phrases like "farm-direct", "stunning", "Shop now"
#
# Runs:
#   - Locally: bash scripts/quality/lint_brand_voice.sh
#   - In CI: called from .github/workflows/quality.yml
#   - Pre-commit: optionally hooked via husky (not installed yet)
#
# Exit codes:
#   0  no violations
#   1  ASCII violations found
#   2  banned phrase found
#   3  both

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

# Scope: customer-facing code only. Excludes:
#   - mockups (internal review surface)
#   - data files (lib/shop-products.ts is enum/type data, not marketing copy)
#   - generated catalogs
SCOPE_PATHS=(app components lib)
EXCLUDE_REGEX='(node_modules|\.next|app/mockups|_archive|/test/|\.test\.|\.spec\.|lib/shop-products\.ts|lib/data/floropolis_products\.ts)'

# Banned phrases (case-insensitive marketing-pressure phrases).
# Source: kb/brand_voice.md Section 6.
# NOTE: "In stock" / "available now" / "ships fast" are factual status -- allowed as badge labels.
# They're banned in MARKETING taglines but the lint can't distinguish context, so we trust admin
# review for those. We catch the higher-signal violations here.
BANNED_PHRASES=(
  'farm-direct'
  'farm direct'
  'stunning flowers'
  'gorgeous flowers'
  'beautiful flowers'
  'shop now'
  'buy now'
  'order today'
  'limited time'
  'click here'
  "don't miss out"
  'introducing the'
  'exciting news'
  'effortless'
)

# Collect candidate files
get_files() {
  find "${SCOPE_PATHS[@]}" -type f \( -name '*.tsx' -o -name '*.ts' -o -name '*.jsx' -o -name '*.js' -o -name '*.html' \) 2>/dev/null \
    | grep -Ev "$EXCLUDE_REGEX" \
    || true
}

ASCII_VIOLATIONS=0
PHRASE_VIOLATIONS=0

echo "=== Brand voice lint (J.5) ==="
echo "Scope: ${SCOPE_PATHS[*]} (excluding ${EXCLUDE_REGEX})"
echo ""

# Check 1: ASCII-clean rule
echo "[1/2] ASCII check (zero chars > 127 in customer-facing code)..."
ASCII_HITS=$(get_files | while read -r f; do
  if grep -nP '[^\x00-\x7F]' "$f" 2>/dev/null; then
    echo "  ^^ in: $f"
    echo "---"
  fi
done)

if [ -n "$ASCII_HITS" ]; then
  echo "ASCII violations:"
  echo "$ASCII_HITS"
  ASCII_VIOLATIONS=1
else
  echo "  OK -- no non-ASCII chars in customer paths"
fi
echo ""

# Check 2: Never-say list
echo "[2/2] Never-say phrase check..."
PHRASE_HITS=""
for phrase in "${BANNED_PHRASES[@]}"; do
  HITS=$(get_files | xargs grep -inE "$phrase" 2>/dev/null || true)
  if [ -n "$HITS" ]; then
    PHRASE_HITS="${PHRASE_HITS}
Phrase: '$phrase'
$HITS
"
  fi
done

if [ -n "$PHRASE_HITS" ]; then
  echo "Banned phrase violations:"
  echo "$PHRASE_HITS"
  PHRASE_VIOLATIONS=1
else
  echo "  OK -- no banned phrases in customer paths"
fi
echo ""

# Final verdict
EXIT_CODE=0
if [ $ASCII_VIOLATIONS -eq 1 ] && [ $PHRASE_VIOLATIONS -eq 1 ]; then
  EXIT_CODE=3
elif [ $PHRASE_VIOLATIONS -eq 1 ]; then
  EXIT_CODE=2
elif [ $ASCII_VIOLATIONS -eq 1 ]; then
  EXIT_CODE=1
fi

if [ $EXIT_CODE -eq 0 ]; then
  echo "=== PASS ==="
else
  echo "=== FAIL (exit $EXIT_CODE) ==="
  echo "Fix: see ~/Claude_MA_v8/Job_PM/kb/brand_voice.md Sections 3 + 6"
fi

exit $EXIT_CODE
