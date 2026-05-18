#!/usr/bin/env bash
# Admin Proposals end-to-end smoke test
# v1 | 2026-05-18 | Job_PM admin-foundation [V8 SHADOW]
#
# Validates the /api/admin/proposals CRUD + approve/reject loop end-to-end
# against a running Next.js server.
#
# Requirements (env):
#   BASE_URL          default: http://127.0.0.1:3000
#   ADMIN_JWT         REQUIRED -- a Supabase access token for a session whose
#                     auth.users.email is in ADMIN_EMAILS (e.g. facu@floropolis.com)
#                     OR whose client_profiles.status='admin'.
#                     Get it from a logged-in browser via
#                       document.cookie or supabase.auth.getSession().
#
# Usage:
#   chmod +x scripts/test_admin_proposals.sh
#   BASE_URL=http://127.0.0.1:3000 ADMIN_JWT="ey..." ./scripts/test_admin_proposals.sh
#
# What this does:
#   1. Creates a visibility_rule.create proposal (uses stub executor -- safe)
#   2. Lists awaiting_facu proposals, verifies ours is there
#   3. Approves it
#   4. Lists approved proposals, verifies status flipped
#   5. Creates a second proposal and rejects it
#
# NOTE: This script does NOT run automatically -- run it manually after deploy.
# It intentionally exercises stub executors (visibility_rule.create / discount_rule.create)
# so it doesn't mutate real source tables on every run.

set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:3000}"
ADMIN_JWT="${ADMIN_JWT:-}"

if [ -z "$ADMIN_JWT" ]; then
  echo "ERROR: set ADMIN_JWT to a Supabase access token for an admin user." >&2
  exit 1
fi

AUTH_HEADER="Authorization: Bearer $ADMIN_JWT"
COOKIE_HEADER="Cookie: sb-access-token=$ADMIN_JWT"

pp() { python3 -m json.tool 2>/dev/null || cat; }

echo "==> 1. CREATE visibility_rule.create proposal"
CREATE_RESP=$(curl -sS -X POST "$BASE_URL/api/admin/proposals" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" \
  -H "$COOKIE_HEADER" \
  -d '{
    "type": "visibility_rule.create",
    "target_table": "visibility_rules",
    "payload": {
      "rule": "hide_low_stock_under_24h",
      "scope": "all",
      "note": "test_admin_proposals.sh smoke"
    },
    "warnings": [
      {"code": "cascade", "severity": "info", "detail": "would hide ~14 SKUs"}
    ],
    "notes": "smoke test from test_admin_proposals.sh"
  }')
echo "$CREATE_RESP" | pp
PROPOSAL_ID=$(echo "$CREATE_RESP" | python3 -c 'import sys,json;print(json.load(sys.stdin)["proposal"]["id"])')
echo "Created proposal id: $PROPOSAL_ID"

echo
echo "==> 2. LIST status=awaiting_facu"
curl -sS "$BASE_URL/api/admin/proposals?status=awaiting_facu&limit=10" \
  -H "$AUTH_HEADER" -H "$COOKIE_HEADER" | pp

echo
echo "==> 3. APPROVE proposal $PROPOSAL_ID"
curl -sS -X POST "$BASE_URL/api/admin/proposals/$PROPOSAL_ID/approve" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" -H "$COOKIE_HEADER" \
  -d '{"reason": "approved by smoke test"}' | pp

echo
echo "==> 4. LIST status=approved (verify ours is there)"
curl -sS "$BASE_URL/api/admin/proposals?status=approved&type=visibility_rule.create&limit=5" \
  -H "$AUTH_HEADER" -H "$COOKIE_HEADER" | pp

echo
echo "==> 5. CREATE second proposal (discount_rule.create) and REJECT it"
REJ_RESP=$(curl -sS -X POST "$BASE_URL/api/admin/proposals" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" -H "$COOKIE_HEADER" \
  -d '{
    "type": "discount_rule.create",
    "target_table": "discount_rules",
    "payload": {"rule": "10pct_returning_buyers"},
    "notes": "reject-test"
  }')
echo "$REJ_RESP" | pp
REJ_ID=$(echo "$REJ_RESP" | python3 -c 'import sys,json;print(json.load(sys.stdin)["proposal"]["id"])')

curl -sS -X POST "$BASE_URL/api/admin/proposals/$REJ_ID/reject" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" -H "$COOKIE_HEADER" \
  -d '{"reason": "rejected by smoke test"}' | pp

echo
echo "==> Done. Manual verification:"
echo "   - override_audit should now have a row for proposal $PROPOSAL_ID (visibility_rules stub)"
echo "   - admin_approvals should have one row per approved + rejected proposal"
echo "   - admin_proposals.status should be 'approved' for $PROPOSAL_ID and 'rejected' for $REJ_ID"
