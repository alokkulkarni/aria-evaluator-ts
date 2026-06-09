#!/usr/bin/env bash
# ── tf-init.sh ─────────────────────────────────────────────────────────────────
# Automated Terraform init with S3 backend configuration.
#
# Reads bucket_suffix from terraform.tfvars (or TF_VAR_bucket_suffix env var)
# and runs `terraform init` with the correct backend-config flags.
#
# Usage:
#   cd infra/terraform/environments/<env>
#   ../../scripts/tf-init.sh
#
# Or from repo root:
#   ./scripts/tf-init.sh <env>
#   ./scripts/tf-init.sh prod
#   ./scripts/tf-init.sh website-prod
#   ./scripts/tf-init.sh control-plane-prod
#   ./scripts/tf-init.sh dev
#
# Environment variables (optional overrides):
#   TF_VAR_bucket_suffix   — override bucket suffix
#   ARIA_TF_REGION         — override region (default: eu-west-2)
#   ARIA_TF_KMS_KEY_ARN    — override KMS key ARN

set -euo pipefail

# ── Resolve environment directory ──────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if [[ $# -ge 1 ]]; then
  ENV_DIR="$REPO_ROOT/infra/terraform/environments/$1"
  if [[ ! -d "$ENV_DIR" ]]; then
    echo "❌ Environment '$1' not found at $ENV_DIR"
    echo "Available environments:"
    ls -1 "$REPO_ROOT/infra/terraform/environments/"
    exit 1
  fi
  cd "$ENV_DIR"
else
  ENV_DIR="$(pwd)"
fi

ENV_NAME="$(basename "$ENV_DIR")"
echo "📁 Environment: $ENV_NAME"
echo "📂 Directory:   $ENV_DIR"

# ── Skip backend config for local environments ────────────────────────────────

if [[ "$ENV_NAME" == *"local"* ]]; then
  echo "🏠 Local environment — using local backend (no S3)"
  terraform init
  exit 0
fi

# ── Extract bucket_suffix ──────────────────────────────────────────────────────

BUCKET_SUFFIX="${TF_VAR_bucket_suffix:-}"

if [[ -z "$BUCKET_SUFFIX" ]]; then
  # Try terraform.tfvars
  if [[ -f terraform.tfvars ]]; then
    BUCKET_SUFFIX=$(grep -E '^\s*bucket_suffix\s*=' terraform.tfvars 2>/dev/null \
      | head -1 | sed 's/.*=\s*"\?\([^"]*\)"\?/\1/' | tr -d '[:space:]')
  fi
  # Try cloudtrail_bucket_suffix (website-prod uses this naming)
  if [[ -z "$BUCKET_SUFFIX" && -f terraform.tfvars ]]; then
    BUCKET_SUFFIX=$(grep -E '^\s*cloudtrail_bucket_suffix\s*=' terraform.tfvars 2>/dev/null \
      | head -1 | sed 's/.*=\s*"\?\([^"]*\)"\?/\1/' | tr -d '[:space:]')
  fi
fi

if [[ -z "$BUCKET_SUFFIX" || "$BUCKET_SUFFIX" == "REPLACE_WITH"* ]]; then
  echo "❌ bucket_suffix not found."
  echo "   Set it in terraform.tfvars or export TF_VAR_bucket_suffix=<suffix>"
  exit 1
fi

REGION="${ARIA_TF_REGION:-eu-west-2}"
BUCKET="aria-evaluator-tf-state-${BUCKET_SUFFIX}"
LOCKS_TABLE="aria-evaluator-tf-locks"

# ── Determine state key based on environment ───────────────────────────────────

case "$ENV_NAME" in
  prod)
    # Per-tenant: need tenant_id
    TENANT_ID="${TF_VAR_tenant_id:-}"
    if [[ -z "$TENANT_ID" && -f terraform.tfvars ]]; then
      TENANT_ID=$(grep -E '^\s*tenant_id\s*=' terraform.tfvars 2>/dev/null \
        | head -1 | sed 's/.*=\s*"\?\([^"]*\)"\?/\1/' | tr -d '[:space:]')
    fi
    if [[ -z "$TENANT_ID" || "$TENANT_ID" == "REPLACE_WITH"* ]]; then
      echo "❌ tenant_id not found for prod environment."
      echo "   Set it in terraform.tfvars or export TF_VAR_tenant_id=<id>"
      exit 1
    fi
    STATE_KEY="tenants/${TENANT_ID}/terraform.tfstate"
    ;;
  control-plane-prod)
    STATE_KEY="control-plane/prod/terraform.tfstate"
    ;;
  website-prod)
    STATE_KEY="website/prod/terraform.tfstate"
    ;;
  dev)
    TENANT_ID="${TF_VAR_tenant_id:-dev}"
    if [[ -f terraform.tfvars ]]; then
      TENANT_ID=$(grep -E '^\s*tenant_id\s*=' terraform.tfvars 2>/dev/null \
        | head -1 | sed 's/.*=\s*"\?\([^"]*\)"\?/\1/' | tr -d '[:space:]')
    fi
    STATE_KEY="tenants/${TENANT_ID}/terraform.tfstate"
    ;;
  control-plane-dev)
    STATE_KEY="control-plane/dev/terraform.tfstate"
    ;;
  website-dev)
    STATE_KEY="website/dev/terraform.tfstate"
    ;;
  saas-platform)
    STATE_KEY="saas-platform/terraform.tfstate"
    ;;
  *)
    STATE_KEY="${ENV_NAME}/terraform.tfstate"
    ;;
esac

# ── Optional KMS key ──────────────────────────────────────────────────────────

KMS_ARG=""
KMS_KEY="${ARIA_TF_KMS_KEY_ARN:-}"
if [[ -z "$KMS_KEY" && -f terraform.tfvars ]]; then
  KMS_KEY=$(grep -E '^\s*kms_key_arn\s*=' terraform.tfvars 2>/dev/null \
    | head -1 | sed 's/.*=\s*"\?\([^"]*\)"\?/\1/' | tr -d '[:space:]')
fi
if [[ -n "$KMS_KEY" && "$KMS_KEY" != "REPLACE_WITH"* ]]; then
  KMS_ARG="-backend-config=kms_key_id=$KMS_KEY"
fi

# ── Run terraform init ────────────────────────────────────────────────────────

echo ""
echo "🔧 Backend configuration:"
echo "   Bucket:   $BUCKET"
echo "   Key:      $STATE_KEY"
echo "   Region:   $REGION"
echo "   Lock:     $LOCKS_TABLE"
[[ -n "$KMS_KEY" && "$KMS_KEY" != "REPLACE_WITH"* ]] && echo "   KMS:      $KMS_KEY"
echo ""

terraform init \
  -backend-config="bucket=$BUCKET" \
  -backend-config="key=$STATE_KEY" \
  -backend-config="region=$REGION" \
  -backend-config="dynamodb_table=$LOCKS_TABLE" \
  -backend-config="encrypt=true" \
  $KMS_ARG

echo ""
echo "✅ Terraform initialized with S3 backend."
echo "   Run 'terraform plan' or 'terraform apply' to proceed."
