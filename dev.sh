#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

API_PID_FILE=".dev/api.pid"
API_LOG_FILE=".dev/api.log"
DEFAULT_HOST="${HOST:-127.0.0.1}"
DEFAULT_PORT="${PORT:-3333}"

print_usage() {
  cat <<'EOF'
Usage: ./dev.sh [command]

Commands:
  up        Start docker deps, rebuild API, restart API server (default)
  restart   Alias for "up"
  stop      Stop API server started by this script
  status    Show API process and health status
  test      Run focused AI test suite
  coverage  Run focused AI test suite with coverage report
  eval      Run MVP eval pack (requires RUN_MVP_EVALS=1)
  seed      Seed database with rich demo portfolio (idempotent)
  token     Print a fresh JWT for the demo user

Environment overrides:
  HOST=<host> PORT=<port>
EOF
}

ensure_dev_dir() {
  mkdir -p .dev
}

start_infra() {
  echo "[dev] Starting PostgreSQL + Redis..."
  docker compose -f docker/docker-compose.dev.yml up -d
}

build_client() {
  echo "[dev] Building Angular client..."
  npx nx run client:build >/dev/null
}

build_api() {
  echo "[dev] Building API..."
  npx nx run api:copy-assets >/dev/null
  npx nx run api:build >/dev/null
}

stop_api() {
  local pid=""

  if [[ -f "$API_PID_FILE" ]]; then
    pid="$(cat "$API_PID_FILE" || true)"

    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      echo "[dev] Stopping API process $pid"
      kill "$pid" 2>/dev/null || true
      sleep 1
    fi

    rm -f "$API_PID_FILE"
  fi

  # Safety net for stale local runs
  pkill -f "node dist/apps/api/main.js" >/dev/null 2>&1 || true
}

start_api() {
  ensure_dev_dir

  echo "[dev] Starting API on http://${DEFAULT_HOST}:${DEFAULT_PORT}"
  HOST="$DEFAULT_HOST" PORT="$DEFAULT_PORT" node dist/apps/api/main.js >"$API_LOG_FILE" 2>&1 &
  echo $! >"$API_PID_FILE"
}

wait_for_health() {
  local max_attempts=40
  local attempt=1

  echo "[dev] Waiting for /api/v1/health..."

  while (( attempt <= max_attempts )); do
    if curl -fsS "http://${DEFAULT_HOST}:${DEFAULT_PORT}/api/v1/health" >/dev/null 2>&1; then
      echo "[dev] API is healthy"
      return 0
    fi

    sleep 0.5
    ((attempt++))
  done

  echo "[dev] API health check failed. See logs at $API_LOG_FILE"
  return 1
}

run_ai_tests() {
  echo "[dev] Running focused AI tests..."
  npx jest \
    apps/api/src/app/endpoints/ai \
    --config apps/api/jest.config.ts \
    --runInBand
}

run_ai_coverage() {
  echo "[dev] Running focused AI tests with coverage..."
  npx jest \
    apps/api/src/app/endpoints/ai \
    --config apps/api/jest.config.ts \
    --runInBand \
    --coverage \
    --collectCoverageFrom='**/endpoints/ai/**/*.ts' \
    --collectCoverageFrom='!**/*.spec.ts' \
    --coverageReporters=text \
    --coverageReporters=text-summary \
    --coverageReporters=html
}

run_seed_demo() {
  echo "[dev] Seeding demo portfolio..."

  # Load .env so the seed script can read ACCESS_TOKEN_SALT
  if [[ -f .env ]]; then
    set -a
    # shellcheck disable=SC1091
    source .env
    set +a
  fi

  npx tsx prisma/seed-demo.mts
}

get_demo_token() {
  # Look up the demo user's access token from the database, exchange for JWT
  local access_token
  access_token=$(
    docker exec gf-postgres-dev psql -U ghostfolio -d ghostfolio -t -A -c \
      "SELECT \"accessToken\" FROM \"User\" WHERE id = 'd6e4f1a0-b8c3-4e7f-9a2d-1c5e8f3b7d40'" 2>/dev/null
  )

  if [[ -z "$access_token" ]]; then
    echo "[dev] Demo user not found. Run ./dev.sh seed first."
    exit 1
  fi

  # The DB stores the HASHED token. We need the plaintext token to auth.
  # If DEMO_ACCESS_TOKEN env var is set (fixed token mode), use it directly.
  if [[ -f .env ]]; then
    set -a
    # shellcheck disable=SC1091
    source .env
    set +a
  fi

  if [[ -n "${DEMO_ACCESS_TOKEN:-}" ]]; then
    local jwt
    jwt=$(curl -s "http://${DEFAULT_HOST}:${DEFAULT_PORT}/api/v1/auth/anonymous/${DEMO_ACCESS_TOKEN}" | jq -r '.authToken // empty')

    if [[ -z "$jwt" ]]; then
      echo "[dev] Failed to exchange token. Is the API running? Try ./dev.sh up first."
      exit 1
    fi

    echo ""
    echo "🔑 JWT (copy this):"
    echo ""
    echo "   $jwt"
    echo ""
    echo "📋 Usage:"
    echo ""
    echo "   export JWT=\"$jwt\""
    echo ""
    echo "   curl -s http://${DEFAULT_HOST}:${DEFAULT_PORT}/api/v1/ai/chat \\"
    echo "     -H \"Authorization: Bearer \$JWT\" \\"
    echo "     -H \"Content-Type: application/json\" \\"
    echo "     -d '{\"prompt\": \"What is my portfolio allocation?\"}' | jq ."
    echo ""
  else
    echo "[dev] No DEMO_ACCESS_TOKEN in .env."
    echo "[dev] Re-run ./dev.sh seed to generate a token, or set DEMO_ACCESS_TOKEN in .env for a stable token."
    exit 1
  fi
}

run_mvp_evals() {
  if [[ "${RUN_MVP_EVALS:-0}" != "1" ]]; then
    echo "[dev] RUN_MVP_EVALS=1 is required to run evals."
    echo "[dev] Example: RUN_MVP_EVALS=1 ./dev.sh eval"
    exit 1
  fi

  # HOST/PORT env vars are inherited by the Jest subprocess, where
  # resolveMvpEvalBaseUrl() reads them to build the target URL.
  echo "[dev] Running MVP eval suite against ${DEFAULT_HOST}:${DEFAULT_PORT}..."
  npx jest \
    apps/api/test/ai/mvp-evals.spec.ts \
    --config apps/api/jest.config.ts \
    --runInBand \
    --testTimeout=240000
}

show_status() {
  if [[ -f "$API_PID_FILE" ]]; then
    local pid
    pid="$(cat "$API_PID_FILE" || true)"

    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      echo "[dev] API process: $pid (running)"
    else
      echo "[dev] API process file exists, but process is not running"
    fi
  else
    echo "[dev] API process: not started via ./dev.sh"
  fi

  echo "[dev] Health check:"
  curl -sS -i "http://${DEFAULT_HOST}:${DEFAULT_PORT}/api/v1/health" || true
}

command="${1:-up}"

case "$command" in
  up|restart)
    start_infra
    build_client
    build_api
    stop_api
    start_api
    wait_for_health
    echo "[dev] API logs: $API_LOG_FILE"
    ;;
  stop)
    stop_api
    echo "[dev] API stopped"
    ;;
  status)
    show_status
    ;;
  test)
    run_ai_tests
    ;;
  coverage)
    run_ai_coverage
    ;;
  eval)
    run_mvp_evals
    ;;
  seed)
    run_seed_demo
    ;;
  token)
    get_demo_token
    ;;
  help|-h|--help)
    print_usage
    ;;
  *)
    echo "Unknown command: $command"
    print_usage
    exit 1
    ;;
esac
