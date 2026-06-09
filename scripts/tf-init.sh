#!/usr/bin/env bash
# ── tf-init.sh ─────────────────────────────────────────────────────────────────
# Automated Terraform init with S3 backend configuration.
#
# For prod/dev: ALWAYS uses S3 backend. If bootstrap hasn't been run yet
# (no state bucket), runs bootstrap automatically first.
#
# For local environments: uses local backend (no S3).
#
# Usage:
#   cd infra/terraform/environments/<env>
#   ../../scripts/tf-init.sh
#
# Or from repo root:
#   ./scripts/tf-init.sh <env>
#   ./scripts/tf-init.sh website-prod
#
# Environment variables (optional overrides):
#   TF_VAR_bucket_suffix   — override bucket suffix
#   ARIA_TF_REGION         — override region (default: eu-west-2)
#   ARIA_TF_KMS_KEY_ARN    — override KMS key ARN

set -euo pipefail

# ── Resolve environment directory ──────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BOOTSTRAP_DIR="$REPO_ROOT/infra/terraform/bootstrap"

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

# ── Helper: extract a var value from a .tfvars file ────────────────────────────

extract_var() {
  local varname="$1"
  local file="$2"
  local line
  line=$(grep -E "^\s*${varname}\s*=" "$file" 2>/dev/null | head -1) || true
  if [[ -n "$line" ]]; then
    echo "$line" | sed 's/[^=]*=\s*//' | sed 's/^[[:space:]]*//' | sed 's/[[:space:]]*$//' | sed 's/^"\(.*\)"$/\1/'
  fi
}

# ── Extract bucket_suffix ──────────────────────────────────────────────────────

REGION="${ARIA_TF_REGION:-eu-west-2}"
BUCKET_SUFFIX="${TF_VAR_bucket_suffix:-}"

if [[ -z "$BUCKET_SUFFIX" && -f terraform.tfvars ]]; then
  BUCKET_SUFFIX=$(extract_var "bucket_suffix" terraform.tfvars)
fi

# ── Initialize bootstrap outputs vars ─────────────────────────────────────────

BOOTSTRAP_BUCKET=""
BOOTSTRAP_ECR=""
BOOTSTRAP_KMS=""
BOOTSTRAP_LOCKS="aria-evaluator-tf-locks"

# ── If no bucket_suffix → check/run bootstrap ────────────────────────────────

if [[ -z "$BUCKET_SUFFIX" || "$BUCKET_SUFFIX" == "REPLACE_WITH"* ]]; then
  echo ""
  echo "🔍 No bucket_suffix found. Checking if bootstrap has been run..."

  BOOTSTRAP_STATE="$BOOTSTRAP_DIR/terraform.tfstate"
  BOOTSTRAP_RAN=false

  # Check if bootstrap state exists with resources
  if [[ -f "$BOOTSTRAP_STATE" ]]; then
    RESOURCE_COUNT=$(python3 -c "
import json
try:
    state = json.load(open('$BOOTSTRAP_STATE'))
    print(len(state.get('resources', [])))
except:
    print(0)
" 2>/dev/null || echo "0")

    if [[ "$RESOURCE_COUNT" -gt 0 ]]; then
      BOOTSTRAP_RAN=true
      echo "✅ Bootstrap state found ($RESOURCE_COUNT resources)"
    fi
  fi

  # ── Run bootstrap if it hasn't been run ───────────────────────────────────
  if [[ "$BOOTSTRAP_RAN" == "false" ]]; then
    echo ""
    echo "🏗️  Bootstrap has NOT been run yet. Running it now..."
    echo "   This creates: S3 state bucket, DynamoDB lock table, ECR repo, KMS key"
    echo ""

    # Ensure bootstrap has a terraform.tfvars with bucket_suffix
    if [[ ! -f "$BOOTSTRAP_DIR/terraform.tfvars" ]]; then
      ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null || "")
      if [[ -z "$ACCOUNT_ID" ]]; then
        echo "❌ Cannot determine AWS account ID. Ensure AWS CLI is configured:"
        echo "   aws configure"
        exit 1
      fi
      AUTO_SUFFIX="${ACCOUNT_ID: -6}"
      echo "   Auto-generating bucket_suffix: $AUTO_SUFFIX (from account ...${ACCOUNT_ID: -4})"
      cat > "$BOOTSTRAP_DIR/terraform.tfvars" <<EOF
bucket_suffix = "$AUTO_SUFFIX"
EOF
    fi

    pushd "$BOOTSTRAP_DIR" > /dev/null
    echo "── terraform init (bootstrap) ──"
    terraform init -input=false
    echo ""
    echo "── terraform apply (bootstrap) ──"
    terraform apply -input=false -auto-approve
    popd > /dev/null

    echo ""
    echo "✅ Bootstrap complete!"
    BOOTSTRAP_RAN=true
  fi

  # ── Read bootstrap outputs ────────────────────────────────────────────────
  if [[ "$BOOTSTRAP_RAN" == "true" ]]; then
    pushd "$BOOTSTRAP_DIR" > /dev/null
    BOOTSTRAP_BUCKET=$(terraform output -raw state_bucket_name 2>/dev/null || echo "")
    BOOTSTRAP_ECR=$(terraform output -raw ecr_repository_url 2>/dev/null || echo "")
    BOOTSTRAP_KMS=$(terraform output -raw kms_key_arn 2>/dev/null || echo "")
    BOOTSTRAP_LOCKS=$(terraform output -raw locks_table_name 2>/dev/null || echo "aria-evaluator-tf-locks")
    popd > /dev/null

    if [[ -z "$BOOTSTRAP_BUCKET" ]]; then
      echo "❌ Could not read bootstrap outputs. Check bootstrap state in:"
      echo "   $BOOTSTRAP_DIR/terraform.tfstate"
      exit 1
    fi

    # Derive bucket_suffix from bucket name
    BUCKET_SUFFIX="${BOOTSTRAP_BUCKET#aria-evaluator-tf-state-}"

    echo ""
    echo "📦 Bootstrap outputs:"
    echo "   State bucket:  $BOOTSTRAP_BUCKET"
    echo "   ECR repo:      $BOOTSTRAP_ECR"
    echo "   KMS key:       $BOOTSTRAP_KMS"
    echo "   Locks table:   $BOOTSTRAP_LOCKS"

    # ── Auto-populate terraform.tfvars with bootstrap outputs ───────────────
    if [[ -f terraform.tfvars ]]; then
      ADDED=""
      if ! grep -q '^\s*bucket_suffix\s*=' terraform.tfvars 2>/dev/null; then
        echo "" >> terraform.tfvars
        echo "# ── Auto-populated from bootstrap ──" >> terraform.tfvars
        echo "bucket_suffix = \"$BUCKET_SUFFIX\"" >> terraform.tfvars
        ADDED="bucket_suffix"
      fi
      if [[ -n "$BOOTSTRAP_KMS" ]] && ! grep -q '^\s*kms_key_arn\s*=' terraform.tfvars 2>/dev/null; then
        if grep -q 'variable "kms_key_arn"' "$ENV_DIR/variables.tf" 2>/dev/null; then
          echo "kms_key_arn = \"$BOOTSTRAP_KMS\"" >> terraform.tfvars
          ADDED="$ADDED kms_key_arn"
        fi
      fi
      if [[ -n "$BOOTSTRAP_ECR" ]] && ! grep -q '^\s*ecr_repository_url\s*=' terraform.tfvars 2>/dev/null; then
        if grep -q 'variable "ecr_repository_url"' "$ENV_DIR/variables.tf" 2>/dev/null; then
          echo "ecr_repository_url = \"$BOOTSTRAP_ECR\"" >> terraform.tfvars
          ADDED="$ADDED ecr_repository_url"
        fi
      fi
      if [[ -n "$ADDED" ]]; then
        echo "📝 Auto-added to terraform.tfvars: $ADDED"
      fi
    fi
  fi
fi

# ── Final validation ──────────────────────────────────────────────────────────

if [[ -z "$BUCKET_SUFFIX" || "$BUCKET_SUFFIX" == "REPLACE_WITH"* ]]; then
  echo "❌ bucket_suffix could not be determined."
  echo "   Set it in terraform.tfvars or export TF_VAR_bucket_suffix=<suffix>"
  exit 1
fi

BUCKET="${BOOTSTRAP_BUCKET:-aria-evaluator-tf-state-${BUCKET_SUFFIX}}"
LOCKS_TABLE="${BOOTSTRAP_LOCKS:-aria-evaluator-tf-locks}"

# ── Determine state key based on environment ───────────────────────────────────

case "$ENV_NAME" in
  prod)
    TENANT_ID="${TF_VAR_tenant_id:-}"
    if [[ -z "$TENANT_ID" && -f terraform.tfvars ]]; then
      TENANT_ID=$(extract_var "tenant_id" terraform.tfvars)
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
      T=$(extract_var "tenant_id" terraform.tfvars)
      [[ -n "$T" ]] && TENANT_ID="$T"
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
  KMS_KEY=$(extract_var "kms_key_arn" terraform.tfvars)
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

terraform init -reconfigure \
  -backend-config="bucket=$BUCKET" \
  -backend-config="key=$STATE_KEY" \
  -backend-config="region=$REGION" \
  -backend-config="dynamodb_table=$LOCKS_TABLE" \
  -backend-config="encrypt=true" \
  ${KMS_ARG}

echo ""
echo "✅ Terraform initialized with S3 backend."
echo "   Run 'terraform plan' or 'terraform apply' to proceed."
