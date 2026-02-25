#!/usr/bin/env bash
# Run the trustless_work_webhook_events seed SQL against Postgres.
# Use this to verify the seed file works when Hasura CLI is not installed.
#
# Prerequisites:
#   - Docker Compose postgres running (e.g. docker compose up -d postgres)
#   - Migrations applied so public.trustless_work_webhook_events exists
#
# Usage (from repo root):
#   ./bin/seed_trustless_webhook_events.sh
#
# Or with default docker-compose postgres (port 5433):
#   ./bin/seed_trustless_webhook_events.sh

set -e
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SEED_FILE="${REPO_ROOT}/seeds/safetrust/_trustless_work_webhook_events.sql"

if [[ ! -f "$SEED_FILE" ]]; then
  echo "Seed file not found: $SEED_FILE"
  exit 1
fi

cd "$REPO_ROOT"

# 1) Try Docker Compose postgres (e.g. docker compose up -d postgres)
if docker compose exec -T postgres psql -U postgres -d postgres -c "SELECT 1" &>/dev/null; then
  echo "Applying seed via Docker postgres..."
  cat "$SEED_FILE" | docker compose exec -T postgres psql -U postgres -d postgres
  echo "Done. Seed applied successfully."
  exit 0
fi

# 2) Fallback: psql on host (PG* or POSTGRES_* env, or defaults for localhost:5433)
if command -v psql &>/dev/null; then
  echo "Applying seed via host psql..."
  export PGPASSWORD="${PGPASSWORD:-${POSTGRES_PASSWORD:-postgrespassword}}"
  psql -h "${PGHOST:-${POSTGRES_HOST:-localhost}}" -p "${PGPORT:-${POSTGRES_PORT:-5433}}" -U "${PGUSER:-${POSTGRES_USER:-postgres}}" -d "${PGDATABASE:-${POSTGRES_DB:-postgres}}" -f "$SEED_FILE"
  echo "Done. Seed applied successfully."
  exit 0
fi

echo "Could not run seed. Either:"
echo "  1. Start postgres: docker compose up -d postgres (then run this script again)"
echo "  2. Install psql and set PGHOST, PGPORT, PGUSER, PGDATABASE, PGPASSWORD"
exit 1
