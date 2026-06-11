#!/usr/bin/env bash
# bootstrap-oauth-secrets.sh — populate Google/GitHub OAuth credentials in Secrets Manager
#
# Run this ONCE after the first `terraform apply` for website-dev or website-prod.
# Terraform creates the secret shell (with PENDING_BOOTSTRAP values); this script
# fills in the real credentials. Subsequent terraform applies never overwrite them
# (lifecycle.ignore_changes is set in the module).
#
# Usage:
#   ./infra/scripts/bootstrap-oauth-secrets.sh dev
#   ./infra/scripts/bootstrap-oauth-secrets.sh prod
#   ./infra/scripts/bootstrap-oauth-secrets.sh prod --region eu-west-2
#
# Prerequisites:
#   - AWS CLI v2 with credentials for the target account/region
#   - jq  (brew install jq)
#   - terraform apply for website-<env> must already have run

set -euo pipefail

# ── Helpers ────────────────────────────────────────────────────────────────────

# Read a credential interactively.
# Prompts go to stderr (so they're visible even when output is captured).
# The entered value (or the existing one if Enter is pressed) is echoed to stdout.
read_credential() {
  local key="$1"
  local label="$2"
  local hide="${3:-false}"   # true = mask input (for secrets)

  local existing
  existing=$(printf '%s' "$CURRENT_JSON" | jq -r --arg k "$key" '.[$k] // "PENDING_BOOTSTRAP"')

  if [[ "$existing" == "PENDING_BOOTSTRAP" ]]; then
    printf "  %-40s [not yet set]\n  > " "$label" >&2
  else
    printf "  %-40s [set — press Enter to keep]\n  > " "$label" >&2
  fi

  local input=""
  if [[ "$hide" == "true" ]]; then
    # Save terminal state, disable echo, read, then unconditionally restore.
    # read -s alone doesn't always restore echo on macOS if interrupted.
    local saved_tty
    saved_tty=$(stty -g </dev/tty 2>/dev/null || true)
    stty -echo </dev/tty 2>/dev/null || true
    IFS= read -r input </dev/tty || true
    if [[ -n "$saved_tty" ]]; then
      stty "$saved_tty" </dev/tty 2>/dev/null || true
    else
      stty echo </dev/tty 2>/dev/null || true
    fi
    printf "\n" >&2
  else
    IFS= read -r input </dev/tty || true
  fi

  if [[ -z "$input" ]]; then
    printf '%s' "$existing"
  else
    printf '%s' "$input"
  fi
}

# ── Arg parsing ────────────────────────────────────────────────────────────────

ENV="${1:-}"
if [[ -z "$ENV" || ( "$ENV" != "dev" && "$ENV" != "prod" ) ]]; then
  echo "Usage: $0 <dev|prod> [--region <region>]" >&2
  exit 1
fi

REGION="eu-west-2"
shift
while [[ $# -gt 0 ]]; do
  case "$1" in
    --region) REGION="$2"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

SECRET_NAME="aria-auth-${ENV}-secrets"

echo ""
echo "===================================================================="
echo "  ARIA OAuth Secrets Bootstrap"
echo "  Environment : ${ENV}"
echo "  Secret name : ${SECRET_NAME}"
echo "  Region      : ${REGION}"
echo "===================================================================="
echo ""

# ── Verify the secret exists ───────────────────────────────────────────────────

echo "Checking secret exists in Secrets Manager..."
SECRET_ARN=$(aws secretsmanager describe-secret \
  --secret-id "${SECRET_NAME}" \
  --region "${REGION}" \
  --query "ARN" \
  --output text 2>/dev/null || true)

if [[ -z "$SECRET_ARN" || "$SECRET_ARN" == "None" ]]; then
  echo ""
  echo "ERROR: Secret '${SECRET_NAME}' not found in ${REGION}." >&2
  echo "Run 'terraform apply' for environments/website-${ENV} first." >&2
  exit 1
fi

echo "Found: ${SECRET_ARN}"
echo ""

# ── Read existing secret value ─────────────────────────────────────────────────

echo "Reading current secret value..."
CURRENT_JSON=$(aws secretsmanager get-secret-value \
  --secret-id "${SECRET_NAME}" \
  --region "${REGION}" \
  --query "SecretString" \
  --output text)

# ── Prompt for each credential ─────────────────────────────────────────────────

echo "Enter credentials below. Press Enter to keep an existing value."
echo ""

echo "── Google OAuth ──────────────────────────────────────────────────────"
GOOGLE_CLIENT_ID=$(read_credential "GOOGLE_CLIENT_ID" "Google Client ID")
GOOGLE_CLIENT_SECRET=$(read_credential "GOOGLE_CLIENT_SECRET" "Google Client Secret" true)

echo ""
echo "── GitHub OAuth ──────────────────────────────────────────────────────"
GITHUB_CLIENT_ID=$(read_credential "GITHUB_CLIENT_ID" "GitHub Client ID")
GITHUB_CLIENT_SECRET=$(read_credential "GITHUB_CLIENT_SECRET" "GitHub Client Secret" true)

echo ""

# ── Validate nothing is still PENDING_BOOTSTRAP ───────────────────────────────

ERRORS=0
for key_val in "GOOGLE_CLIENT_ID:$GOOGLE_CLIENT_ID" "GOOGLE_CLIENT_SECRET:$GOOGLE_CLIENT_SECRET" \
               "GITHUB_CLIENT_ID:$GITHUB_CLIENT_ID"  "GITHUB_CLIENT_SECRET:$GITHUB_CLIENT_SECRET"; do
  k="${key_val%%:*}"
  v="${key_val#*:}"
  if [[ "$v" == "PENDING_BOOTSTRAP" || -z "$v" ]]; then
    echo "ERROR: ${k} is still empty or PENDING_BOOTSTRAP." >&2
    ERRORS=$((ERRORS + 1))
  fi
done

if [[ $ERRORS -gt 0 ]]; then
  echo ""
  echo "Aborted — provide all four credentials before proceeding." >&2
  exit 1
fi

# ── Merge new values over existing keys (preserves NEXTAUTH_SECRET, Cognito, etc.) ──

UPDATED_JSON=$(printf '%s' "$CURRENT_JSON" | jq \
  --arg gid  "$GOOGLE_CLIENT_ID" \
  --arg gsec "$GOOGLE_CLIENT_SECRET" \
  --arg ghid  "$GITHUB_CLIENT_ID" \
  --arg ghsec "$GITHUB_CLIENT_SECRET" \
  '. + {
    GOOGLE_CLIENT_ID:     $gid,
    GOOGLE_CLIENT_SECRET: $gsec,
    GITHUB_CLIENT_ID:     $ghid,
    GITHUB_CLIENT_SECRET: $ghsec
  }')

# ── Summary ────────────────────────────────────────────────────────────────────

echo "Keys that will be written to Secrets Manager:"
printf '%s' "$UPDATED_JSON" | jq 'to_entries | map(.key + ": " + (if (.key | test("SECRET|secret")) then "***" else .value end)) | .[]'
echo ""
printf "Proceed? [y/N] "
IFS= read -r confirm </dev/tty
echo ""

if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
  echo "Aborted — secret not modified."
  exit 0
fi

# ── Write to Secrets Manager ───────────────────────────────────────────────────

echo "Writing to Secrets Manager..."
aws secretsmanager put-secret-value \
  --secret-id "${SECRET_NAME}" \
  --region "${REGION}" \
  --secret-string "$UPDATED_JSON" \
  --version-stages AWSCURRENT \
  --output text > /dev/null

echo ""
echo "Done. Credentials are now live in:"
echo "  ${SECRET_ARN}"
echo ""
echo "Force ECS restart to pick up the new values:"
echo "  aws ecs update-service \\"
echo "    --cluster aria-auth-${ENV}-cluster \\"
echo "    --service aria-auth-${ENV}-service \\"
echo "    --force-new-deployment \\"
echo "    --region ${REGION}"
echo ""
if [[ "$ENV" == "prod" ]]; then
  echo "Cognito uses these Google credentials too — run terraform apply again"
  echo "so the Cognito identity provider is updated with the real values."
  echo ""
fi
