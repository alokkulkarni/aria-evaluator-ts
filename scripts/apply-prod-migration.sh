#!/usr/bin/env bash
# Break-glass: apply pending Prisma migrations to a dev/prod ARIA database.
#
# The dev/prod DB is a SQLite file persisted to S3 and applied at container boot
# via `prisma migrate deploy` (see infra/docker/ecs-entrypoint.sh). Normally you
# just author a migration, rebuild the image, and redeploy — the new task runs
# migrate deploy automatically. Use THIS script when you need to apply a
# migration out-of-band: a hotfix without an image rebuild, or a deliberately
# destructive change you want to perform by hand after taking a backup.
#
# Safe-by-construction: it scales the ECS service to 0 first (so the running
# task's periodic S3 sync can't overwrite your work), ALWAYS takes a full backup,
# applies `migrate deploy` to a local copy, uploads it, then scales the service
# back up with a fresh deployment.
#
# Usage:
#   scripts/apply-prod-migration.sh <dev|prod> [--yes] [--region <aws-region>]
#
# Env overrides (rarely needed):
#   ARIA_STATE_BUCKET   override the S3 state bucket name
#   ARIA_STATE_PREFIX   override the S3 key prefix (default: aria-evaluator)
#
# Requires: awscli, terraform, and npx (Prisma) with AWS credentials for the
# target account already configured.
set -euo pipefail

ENV="${1:-}"
shift || true
ASSUME_YES=0
REGION_ARG=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --yes|-y) ASSUME_YES=1 ;;
    --region) REGION_ARG=(--region "$2"); shift ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done

if [[ "$ENV" != "dev" && "$ENV" != "prod" ]]; then
  echo "Usage: $0 <dev|prod> [--yes] [--region <aws-region>]" >&2
  exit 2
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_DIR="${REPO_ROOT}/infra/terraform/environments/${ENV}"
[[ -d "$ENV_DIR" ]] || { echo "No such environment dir: $ENV_DIR" >&2; exit 1; }

tf_out() { terraform -chdir="$ENV_DIR" output -raw "$1" 2>/dev/null || true; }

CLUSTER="$(tf_out ecs_cluster_name)"
SERVICE="$(tf_out ecs_service_name)"
BUCKET="${ARIA_STATE_BUCKET:-$(tf_out state_bucket_name)}"
[[ -n "$BUCKET" ]] || BUCKET="$(tf_out s3_bucket_name)"
PREFIX="${ARIA_STATE_PREFIX:-aria-evaluator}"
DB_KEY="${PREFIX}/data/aria-evaluator.db"

if [[ -z "$CLUSTER" || -z "$SERVICE" || -z "$BUCKET" ]]; then
  echo "Could not resolve cluster/service/bucket from terraform outputs in $ENV_DIR." >&2
  echo "  cluster='$CLUSTER' service='$SERVICE' bucket='$BUCKET'" >&2
  echo "Run 'terraform -chdir=$ENV_DIR init' first, or set ARIA_STATE_BUCKET." >&2
  exit 1
fi

aws() { command aws "${REGION_ARG[@]}" "$@"; }

echo "About to apply migrations to the ${ENV} database:"
echo "  cluster : ${CLUSTER}"
echo "  service : ${SERVICE}"
echo "  db      : s3://${BUCKET}/${DB_KEY}"
echo "This will SCALE THE SERVICE TO 0 (downtime) while migrating, then redeploy."
if [[ "$ASSUME_YES" -ne 1 ]]; then
  read -r -p "Proceed? [y/N] " reply
  [[ "$reply" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 0; }
fi

# Remember the current desired count so we can restore it (fall back to 1).
DESIRED="$(aws ecs describe-services --cluster "$CLUSTER" --services "$SERVICE" \
  --query 'services[0].desiredCount' --output text 2>/dev/null || echo 1)"
[[ "$DESIRED" =~ ^[0-9]+$ && "$DESIRED" -gt 0 ]] || DESIRED=1

echo "→ Scaling ${SERVICE} to 0 and waiting for the task to drain…"
aws ecs update-service --cluster "$CLUSTER" --service "$SERVICE" --desired-count 0 >/dev/null
aws ecs wait services-stable --cluster "$CLUSTER" --services "$SERVICE"

STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="${REPO_ROOT}/db-backups/${ENV}-${STAMP}"
mkdir -p "$BACKUP_DIR"
echo "→ Backing up s3://${BUCKET}/${PREFIX}/ to ${BACKUP_DIR} …"
aws s3 cp --recursive "s3://${BUCKET}/${PREFIX}/" "$BACKUP_DIR/" --only-show-errors

LOCAL_DB="$BACKUP_DIR/data/aria-evaluator.db"
[[ -f "$LOCAL_DB" ]] || { echo "DB not found at $LOCAL_DB after backup — aborting." >&2; exit 1; }

WORK_DB="$(mktemp -d)/aria-evaluator.db"
cp "$LOCAL_DB" "$WORK_DB"
export DATABASE_URL="file:${WORK_DB}"

# Adopt an as-yet-unmigrated (db-pushed) DB into the baseline, then apply.
cd "$REPO_ROOT"
db_has_table() {
  printf 'SELECT 1 FROM "%s" LIMIT 1;' "$1" \
    | npx prisma db execute --schema prisma/schema.prisma --stdin >/dev/null 2>&1
}
if ! db_has_table "_prisma_migrations" && db_has_table "User"; then
  echo "→ Adopting existing database into the migration baseline (0_init)…"
  npx prisma migrate resolve --applied 0_init
fi
echo "→ Applying migrations to the local copy…"
npx prisma migrate deploy

echo "→ Uploading migrated DB to s3://${BUCKET}/${DB_KEY} …"
aws s3 cp "$WORK_DB" "s3://${BUCKET}/${DB_KEY}" --only-show-errors

echo "→ Scaling ${SERVICE} back to ${DESIRED} with a fresh deployment…"
aws ecs update-service --cluster "$CLUSTER" --service "$SERVICE" \
  --desired-count "$DESIRED" --force-new-deployment >/dev/null
aws ecs wait services-stable --cluster "$CLUSTER" --services "$SERVICE"

echo "✓ Done. Migrations applied to ${ENV}. Backup kept at: ${BACKUP_DIR}"
