#!/usr/bin/env bash
# Dev server startup for insider-monitoring worktree
# Uses ts-node to bypass webpack optional-dep errors

REPO=/Users/henrydegrasse/Development/GauntletAi/AgentForge
WORKTREE="$(cd "$(dirname "$0")" && pwd)"

# Expand env vars manually so DATABASE_URL interpolation works
export POSTGRES_USER=user
export POSTGRES_PASSWORD=c9f06dc44ebea56e667ee723bb9e5706
export POSTGRES_DB=ghostfolio-db
export DATABASE_URL="postgresql://user:c9f06dc44ebea56e667ee723bb9e5706@localhost:5432/ghostfolio-db?connect_timeout=300&sslmode=prefer"

while IFS= read -r line; do
  [[ "$line" =~ ^# ]]          && continue
  [[ -z "$line" ]]             && continue
  [[ "$line" =~ DATABASE_URL|POSTGRES|COMPOSE ]] && continue
  export "$line" 2>/dev/null   || true
done < "$REPO/.env"

node \
  --require "$REPO/node_modules/tsconfig-paths/register.js" \
  "$REPO/node_modules/.bin/ts-node" \
  --project "$WORKTREE/apps/api/tsconfig.app.json" \
  --transpile-only \
  "$WORKTREE/apps/api/src/main.ts"
