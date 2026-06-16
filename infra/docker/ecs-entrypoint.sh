#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/app"
STATE_DIR="${APP_STATE_DIR:-/app/state}"
STATE_BUCKET="${AWS_S3_STATE_BUCKET:-}"
STATE_PREFIX="${AWS_S3_STATE_PREFIX:-aria-evaluator}"
SYNC_INTERVAL="${S3_SYNC_INTERVAL_SECONDS:-30}"

mkdir -p \
  "${STATE_DIR}/data" \
  "${STATE_DIR}/reports" \
  "${STATE_DIR}/transcripts/audio" \
  "${STATE_DIR}/scenarios"

restore_state() {
  if [[ -z "${STATE_BUCKET}" ]]; then
    return 0
  fi
  echo "ℹ Restoring state from s3://${STATE_BUCKET}/${STATE_PREFIX}/"
  aws s3 sync "s3://${STATE_BUCKET}/${STATE_PREFIX}/" "${STATE_DIR}/" --only-show-errors || true
}

sync_state() {
  if [[ -z "${STATE_BUCKET}" ]]; then
    return 0
  fi
  aws s3 sync "${STATE_DIR}/" "s3://${STATE_BUCKET}/${STATE_PREFIX}/" --only-show-errors || true
}

wire_paths() {
  rm -rf "${APP_DIR}/reports" "${APP_DIR}/transcripts" "${APP_DIR}/data"
  ln -s "${STATE_DIR}/reports" "${APP_DIR}/reports"
  ln -s "${STATE_DIR}/transcripts" "${APP_DIR}/transcripts"
  ln -s "${STATE_DIR}/data" "${APP_DIR}/data"

  if [[ -f "${STATE_DIR}/.env" ]]; then
    ln -sf "${STATE_DIR}/.env" "${APP_DIR}/.env"
  fi
}

restore_state
wire_paths

# Postgres everywhere (Aurora for dev/prod, a local container for local). Require
# a connection string — fail loudly rather than silently falling back to SQLite.
export DATABASE_URL="${DATABASE_URL:?DATABASE_URL must be set to a PostgreSQL connection string}"
export EVAL_REPORT_OUTPUT_DIR="${EVAL_REPORT_OUTPUT_DIR:-${STATE_DIR}/reports}"
export SCENARIOS_DIR="${SCENARIOS_DIR:-${STATE_DIR}/scenarios}"
export API_PORT="${API_PORT:-3001}"

sync_loop() {
  while true; do
    sleep "${SYNC_INTERVAL}"
    sync_state
  done
}

shutdown() {
  set +e
  echo "ℹ Flushing final state to S3…"
  sync_state
  if [[ -n "${APP_PID:-}" ]]; then
    kill "${APP_PID}" >/dev/null 2>&1 || true
    wait "${APP_PID}" >/dev/null 2>&1 || true
  fi
  if [[ -n "${SYNC_PID:-}" ]]; then
    kill "${SYNC_PID}" >/dev/null 2>&1 || true
    wait "${SYNC_PID}" >/dev/null 2>&1 || true
  fi
}

trap shutdown EXIT INT TERM

if [[ -n "${STATE_BUCKET}" ]]; then
  sync_loop &
  SYNC_PID=$!
fi

echo "🗄️  Applying database schema…"
if [[ -n "${STATE_BUCKET}" ]]; then
  # Persistent environment (dev/prod, S3-backed state): apply reviewed migrations
  # with `migrate deploy`. Migrations are authored SQL, so data-preserving
  # changes (renames, type changes, backfills) apply automatically and nothing is
  # ever silently dropped — unlike `db push`, which can only drop to match the
  # schema. A database first created with `db push` (tables present, no migration
  # history) is adopted into the baseline so deploy doesn't try to recreate it.
  db_has_table() {
    printf 'SELECT 1 FROM "%s" LIMIT 1;' "$1" \
      | npx prisma db execute --schema prisma/schema.prisma --stdin >/dev/null 2>&1
  }
  if ! db_has_table "_prisma_migrations" && db_has_table "User"; then
    echo "  Adopting existing database into the migration baseline (0_init)…"
    npx prisma migrate resolve --applied 0_init 2>&1 | sed 's/^/  /'
  fi
  if ! npx prisma migrate deploy 2>&1 | sed 's/^/  /'; then
    echo "❌ Database migration failed (see above). The deploy is failing so the" >&2
    echo "   platform rolls back; existing data is left untouched. Fix the" >&2
    echo "   migration and redeploy." >&2
    exit 1
  fi
else
  # Local/ephemeral: fast iteration — reset freely to match the schema directly.
  npx prisma db push --skip-generate --accept-data-loss 2>&1 | sed 's/^/  /'
fi

echo "🚀 Starting API server on port ${API_PORT}"
node dist/api/server.js &
APP_PID=$!
wait "${APP_PID}"
