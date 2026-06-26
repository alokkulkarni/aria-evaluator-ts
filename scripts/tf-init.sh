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

# ── Helper: read bootstrap outputs from the local state file (no terraform) ────
#
# Checks both the 'outputs' section (present after a full apply) and the raw
# resource attributes (present even when outputs weren't recorded).  Prints
# four lines: BUCKET / LOCKS / ECR / KMS (empty string when not found).
read_state_outputs() {
  local statefile="$BOOTSTRAP_DIR/terraform.tfstate"
  [[ -f "$statefile" ]] || { printf '\n\n\n\n'; return; }
  python3 - "$statefile" <<'PYEOF'
import json, sys

try:
    state = json.load(open(sys.argv[1]))
except Exception:
    print('\n\n\n')
    sys.exit(0)

outputs = state.get('outputs', {})

def out(key):
    v = (outputs.get(key) or {}).get('value', '')
    return v if v and str(v) not in ('None', 'null', '') else ''

def rattr(rtype, rname, key):
    for r in state.get('resources', []):
        if r.get('type') == rtype and r.get('name') == rname:
            for i in r.get('instances', []):
                v = i.get('attributes', {}).get(key, '')
                if v: return v
    return ''

bucket = out('state_bucket_name') or rattr('aws_s3_bucket', 'terraform_state', 'id')
locks  = out('locks_table_name')  or rattr('aws_dynamodb_table', 'terraform_locks', 'name')
ecr    = out('ecr_repository_url') or rattr('aws_ecr_repository', 'shared', 'repository_url')
kms    = out('kms_key_arn')       or rattr('aws_kms_key', 'secrets', 'arn')

print(bucket)
print(locks)
print(ecr)
print(kms)
PYEOF
}

# ── Helper: discover bootstrap resources from AWS directly ─────────────────────
#
# Accepts a bucket suffix; returns the same four-line format as read_state_outputs.
# Returns non-zero if the state bucket does not exist in AWS.
discover_aws_outputs() {
  local suffix="$1"
  local bucket="aria-evaluator-tf-state-${suffix}"
  aws s3api head-bucket --bucket "$bucket" --region "$REGION" >/dev/null 2>&1 || return 1
  local locks ecr kms
  locks=$(aws dynamodb describe-table \
    --table-name aria-evaluator-tf-locks --region "$REGION" \
    --query 'Table.TableName' --output text 2>/dev/null || echo "aria-evaluator-tf-locks")
  ecr=$(aws ecr describe-repositories \
    --repository-names aria-evaluator --region "$REGION" \
    --query 'repositories[0].repositoryUri' --output text 2>/dev/null || echo "")
  # Try alias first, fall back to tag search
  kms=$(aws kms describe-key \
    --key-id "alias/aria-evaluator-shared-secrets" --region "$REGION" \
    --query 'KeyMetadata.Arn' --output text 2>/dev/null || echo "")
  echo "$bucket"
  echo "${locks:-aria-evaluator-tf-locks}"
  echo "$ecr"
  echo "$kms"
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
  echo "🔍 No bucket_suffix found. Checking bootstrap state..."

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

  # ── Pre-check AWS before applying bootstrap ───────────────────────────────
  #
  # Even when the local state looks empty, the AWS resources may already exist
  # (e.g. after a machine restart wiped the local state).  Attempting
  # 'terraform apply' against pre-existing resources fails.  Derive the
  # expected bucket name from the account ID and probe AWS first.
  if [[ "$BOOTSTRAP_RAN" == "false" ]]; then
    ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null || echo "")
    if [[ -n "$ACCOUNT_ID" ]]; then
      AUTO_SUFFIX="${ACCOUNT_ID: -6}"
      PROBE_BUCKET="aria-evaluator-tf-state-${AUTO_SUFFIX}"
      if aws s3api head-bucket --bucket "$PROBE_BUCKET" --region "$REGION" >/dev/null 2>&1; then
        echo "☁️  Bootstrap resources already exist in AWS (bucket: $PROBE_BUCKET)"
        echo "   Skipping terraform apply — reading details from AWS."
        BOOTSTRAP_RAN=true
        # Ensure bootstrap tfvars exists so subsequent terraform commands work
        if [[ ! -f "$BOOTSTRAP_DIR/terraform.tfvars" ]]; then
          echo "bucket_suffix = \"$AUTO_SUFFIX\"" > "$BOOTSTRAP_DIR/terraform.tfvars"
          echo "📝 Created bootstrap/terraform.tfvars (bucket_suffix=$AUTO_SUFFIX)"
        fi
      fi
    fi
  fi

  # ── Run bootstrap only when resources truly don't exist ───────────────────
  if [[ "$BOOTSTRAP_RAN" == "false" ]]; then
    echo ""
    echo "🏗️  Bootstrap has NOT been run yet. Running it now..."
    echo "   This creates: S3 state bucket, DynamoDB lock table, ECR repo, KMS key"
    echo ""

    # Ensure bootstrap has a terraform.tfvars with bucket_suffix
    if [[ ! -f "$BOOTSTRAP_DIR/terraform.tfvars" ]]; then
      ACCOUNT_ID="${ACCOUNT_ID:-$(aws sts get-caller-identity --query Account --output text 2>/dev/null || "")}"
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
  #
  # Strategy (most to least reliable):
  #   1. Parse the local state JSON directly — works even when .terraform is
  #      absent and even when only some outputs were recorded.
  #   2. Query AWS CLI — fills any gaps left by an incomplete state file.
  #   3. Fall back to 'terraform output' (requires .terraform to be init'd).
  if [[ "$BOOTSTRAP_RAN" == "true" ]]; then
    echo ""
    echo "📖 Reading bootstrap outputs..."

    # Step 1 — state file
    STATE_LINES=$(read_state_outputs 2>/dev/null) || STATE_LINES=""
    BOOTSTRAP_BUCKET=$(echo "$STATE_LINES" | sed -n '1p')
    BOOTSTRAP_LOCKS=$(echo  "$STATE_LINES" | sed -n '2p')
    BOOTSTRAP_ECR=$(echo    "$STATE_LINES" | sed -n '3p')
    BOOTSTRAP_KMS=$(echo    "$STATE_LINES" | sed -n '4p')

    # Step 2 — AWS CLI (fills gaps when state is partial)
    if [[ -z "$BOOTSTRAP_BUCKET" ]]; then
      echo "   State file missing bucket — querying AWS..."
      # Derive suffix: bootstrap tfvars → env var → account ID
      FILL_SUFFIX=$(extract_var "bucket_suffix" "$BOOTSTRAP_DIR/terraform.tfvars" 2>/dev/null || echo "")
      [[ -z "$FILL_SUFFIX" ]] && FILL_SUFFIX="${BUCKET_SUFFIX:-}"
      if [[ -z "$FILL_SUFFIX" ]]; then
        ACCOUNT_ID="${ACCOUNT_ID:-$(aws sts get-caller-identity --query Account --output text 2>/dev/null || "")}"
        [[ -n "$ACCOUNT_ID" ]] && FILL_SUFFIX="${ACCOUNT_ID: -6}"
      fi

      if [[ -n "$FILL_SUFFIX" ]]; then
        AWS_LINES=$(discover_aws_outputs "$FILL_SUFFIX" 2>/dev/null) || AWS_LINES=""
        if [[ -n "$AWS_LINES" ]]; then
          echo "   ✅ Found existing bootstrap resources in AWS"
          [[ -z "$BOOTSTRAP_BUCKET" ]] && BOOTSTRAP_BUCKET=$(echo "$AWS_LINES" | sed -n '1p')
          [[ -z "$BOOTSTRAP_LOCKS"  ]] && BOOTSTRAP_LOCKS=$(echo  "$AWS_LINES" | sed -n '2p')
          [[ -z "$BOOTSTRAP_ECR"    ]] && BOOTSTRAP_ECR=$(echo    "$AWS_LINES" | sed -n '3p')
          [[ -z "$BOOTSTRAP_KMS"    ]] && BOOTSTRAP_KMS=$(echo    "$AWS_LINES" | sed -n '4p')
        fi
      fi
    fi

    # Step 3 — terraform output (last resort; auto-inits providers if needed)
    if [[ -z "$BOOTSTRAP_BUCKET" ]]; then
      echo "   Trying terraform output in bootstrap dir..."
      pushd "$BOOTSTRAP_DIR" > /dev/null
      if [[ ! -d ".terraform/providers" ]]; then
        terraform init -input=false -backend=false >/dev/null 2>&1 || true
      fi
      BOOTSTRAP_BUCKET=$(terraform output -raw state_bucket_name 2>/dev/null || echo "")
      [[ -z "$BOOTSTRAP_LOCKS" ]] && BOOTSTRAP_LOCKS=$(terraform output -raw locks_table_name 2>/dev/null || echo "aria-evaluator-tf-locks")
      [[ -z "$BOOTSTRAP_ECR"   ]] && BOOTSTRAP_ECR=$(terraform output -raw ecr_repository_url 2>/dev/null || echo "")
      [[ -z "$BOOTSTRAP_KMS"   ]] && BOOTSTRAP_KMS=$(terraform output -raw kms_key_arn 2>/dev/null || echo "")
      popd > /dev/null
    fi

    if [[ -z "$BOOTSTRAP_BUCKET" ]]; then
      echo "❌ Could not determine the Terraform state bucket."
      echo "   Checked: local state file, AWS CLI, and terraform output."
      echo "   Ensure AWS credentials are configured and the bootstrap has been run."
      exit 1
    fi

    # Derive bucket_suffix from bucket name
    BUCKET_SUFFIX="${BOOTSTRAP_BUCKET#aria-evaluator-tf-state-}"

    echo ""
    echo "📦 Bootstrap details:"
    echo "   State bucket:  $BOOTSTRAP_BUCKET"
    echo "   ECR repo:      ${BOOTSTRAP_ECR:-(not found)}"
    echo "   KMS key:       ${BOOTSTRAP_KMS:-(not found)}"
    echo "   Locks table:   ${BOOTSTRAP_LOCKS:-aria-evaluator-tf-locks}"

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
  evaluator-prod)
    STATE_KEY="evaluator/prod/terraform.tfstate"
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
echo "   Locking:  use_lockfile=true"
[[ -n "$KMS_KEY" && "$KMS_KEY" != "REPLACE_WITH"* ]] && echo "   KMS:      $KMS_KEY"
echo ""

terraform init -reconfigure \
  -backend-config="bucket=$BUCKET" \
  -backend-config="key=$STATE_KEY" \
  -backend-config="region=$REGION" \
  -backend-config="use_lockfile=true" \
  -backend-config="encrypt=true" \
  ${KMS_ARG}

echo ""
echo "✅ Terraform initialized with S3 backend."
echo "   Run 'terraform plan' or 'terraform apply' to proceed."
