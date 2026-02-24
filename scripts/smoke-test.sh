#!/usr/bin/env bash
# ────────────────────────────────────────────────────────────────────────────
# MVP Smoke Test — runs 6 checks against a live AgentForge / Ghostfolio API.
#
# Usage:
#   ./scripts/smoke-test.sh                           # defaults to localhost
#   ./scripts/smoke-test.sh https://xyz.up.railway.app/api/v1
# ────────────────────────────────────────────────────────────────────────────
set -euo pipefail

BASE_URL="${1:-http://127.0.0.1:3333/api/v1}"
PASS=0
FAIL=0
TOTAL=6

green() { printf "\033[32m%s\033[0m\n" "$1"; }
red()   { printf "\033[31m%s\033[0m\n" "$1"; }
bold()  { printf "\033[1m%s\033[0m\n" "$1"; }

record_pass() { PASS=$((PASS + 1)); green "  ✓ $1"; }
record_fail() { FAIL=$((FAIL + 1)); red   "  ✗ $1: $2"; }

# ── Helpers ──────────────────────────────────────────────────────────────────

http_get() {
  curl -sf --max-time 10 "$1" 2>/dev/null || true
}

http_post() {
  local url="$1" body="$2"
  shift 2
  curl -sf --max-time 60 -X POST "$url" \
    -H 'Content-Type: application/json' \
    "$@" \
    -d "$body" 2>/dev/null || true
}

json_field() {
  # Extract a top-level string/number field from JSON (no jq dependency)
  local json="$1" field="$2"
  node -e "
    const d = JSON.parse(process.argv[1]);
    const v = d['${field}'];
    process.stdout.write(String(v ?? ''));
  " "$json" 2>/dev/null || true
}

# ── 1. Health check ─────────────────────────────────────────────────────────

bold "Smoke testing ${BASE_URL}"
echo ""
bold "[1/6] Health check"

HEALTH=$(http_get "${BASE_URL}/health")
if echo "$HEALTH" | grep -q '"status":"OK"'; then
  record_pass "GET /health → OK"
else
  record_fail "GET /health" "expected {\"status\":\"OK\"}, got: ${HEALTH:-<empty>}"
  red "Cannot continue without a healthy API."
  exit 1
fi

# ── 2. Create user ──────────────────────────────────────────────────────────

bold "[2/6] Create test user"

USER_RESP=$(http_post "${BASE_URL}/user" '{}')
AUTH_TOKEN=$(json_field "$USER_RESP" "authToken")

if [ -n "$AUTH_TOKEN" ] && [ "$AUTH_TOKEN" != "undefined" ]; then
  record_pass "POST /user → authToken received"
else
  record_fail "POST /user" "no authToken in response: ${USER_RESP:-<empty>}"
  red "Cannot continue without auth."
  exit 1
fi

AUTH_HEADER="Authorization: Bearer ${AUTH_TOKEN}"

# ── 3. Import sample holdings ───────────────────────────────────────────────

bold "[3/6] Import sample holdings"

IMPORT_PAYLOAD='{
  "activities": [
    {"currency":"USD","dataSource":"MANUAL","date":"2025-01-05T00:00:00.000Z","fee":0,"quantity":10,"symbol":"11111111-1111-4111-8111-111111111111","type":"BUY","unitPrice":100},
    {"currency":"USD","dataSource":"MANUAL","date":"2025-01-10T00:00:00.000Z","fee":0,"quantity":5,"symbol":"22222222-2222-4222-8222-222222222222","type":"BUY","unitPrice":200},
    {"currency":"USD","dataSource":"MANUAL","date":"2025-01-15T00:00:00.000Z","fee":0,"quantity":3,"symbol":"33333333-3333-4333-8333-333333333333","type":"BUY","unitPrice":150},
    {"currency":"USD","dataSource":"MANUAL","date":"2025-01-20T00:00:00.000Z","fee":0,"quantity":2,"symbol":"22222222-2222-4222-8222-222222222222","type":"SELL","unitPrice":210}
  ]
}'

IMPORT_RESP=$(http_post "${BASE_URL}/import" "$IMPORT_PAYLOAD" -H "$AUTH_HEADER")

if echo "$IMPORT_RESP" | grep -q '"activities"'; then
  record_pass "POST /import → activities imported"
else
  record_fail "POST /import" "unexpected response: ${IMPORT_RESP:-<empty>}"
fi

# ── 4. Chat: portfolio summary ──────────────────────────────────────────────

bold "[4/6] Chat: portfolio summary"

CHAT1=$(http_post "${BASE_URL}/ai/chat" \
  '{"message":"Summarize my holdings and total portfolio value.","toolNames":["get_portfolio_summary"]}' \
  -H "$AUTH_HEADER")
CHAT1_STATUS=$(json_field "$CHAT1" "status")
CHAT1_TOOLS=$(json_field "$CHAT1" "toolCalls")

if [ "$CHAT1_STATUS" = "completed" ] && [ "${CHAT1_TOOLS:-0}" -ge 1 ] 2>/dev/null; then
  record_pass "portfolio summary → status=completed, toolCalls=${CHAT1_TOOLS}"
else
  record_fail "portfolio summary" "status=${CHAT1_STATUS:-<empty>}, toolCalls=${CHAT1_TOOLS:-0}"
fi

# ── 5. Chat: transaction history ────────────────────────────────────────────

bold "[5/6] Chat: transaction history"

CHAT2=$(http_post "${BASE_URL}/ai/chat" \
  '{"message":"Show my recent transactions.","toolNames":["get_transaction_history"]}' \
  -H "$AUTH_HEADER")
CHAT2_STATUS=$(json_field "$CHAT2" "status")
CHAT2_TOOLS=$(json_field "$CHAT2" "toolCalls")

if [ "$CHAT2_STATUS" = "completed" ] && [ "${CHAT2_TOOLS:-0}" -ge 1 ] 2>/dev/null; then
  record_pass "transaction history → status=completed, toolCalls=${CHAT2_TOOLS}"
else
  record_fail "transaction history" "status=${CHAT2_STATUS:-<empty>}, toolCalls=${CHAT2_TOOLS:-0}"
fi

# ── 6. Chat: risk analysis ─────────────────────────────────────────────────

bold "[6/6] Chat: risk analysis"

CHAT3=$(http_post "${BASE_URL}/ai/chat" \
  '{"message":"What are the main risk flags in my portfolio?","toolNames":["analyze_risk"]}' \
  -H "$AUTH_HEADER")
CHAT3_STATUS=$(json_field "$CHAT3" "status")
CHAT3_TOOLS=$(json_field "$CHAT3" "toolCalls")

if [ "$CHAT3_STATUS" = "completed" ] && [ "${CHAT3_TOOLS:-0}" -ge 1 ] 2>/dev/null; then
  record_pass "risk analysis → status=completed, toolCalls=${CHAT3_TOOLS}"
else
  record_fail "risk analysis" "status=${CHAT3_STATUS:-<empty>}, toolCalls=${CHAT3_TOOLS:-0}"
fi

# ── Summary ─────────────────────────────────────────────────────────────────

echo ""
bold "═══════════════════════════════════════"
if [ "$FAIL" -eq 0 ]; then
  green "  All ${TOTAL} smoke tests passed ✓"
else
  red   "  ${FAIL}/${TOTAL} smoke tests failed"
fi
bold "═══════════════════════════════════════"

exit "$FAIL"
