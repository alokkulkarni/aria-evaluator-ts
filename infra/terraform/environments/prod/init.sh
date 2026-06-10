#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TFVARS_FILE="${TFVARS_FILE:-${SCRIPT_DIR}/terraform.tfvars}"

if [[ ! -f "${TFVARS_FILE}" ]]; then
  echo "ERROR: terraform.tfvars not found at ${TFVARS_FILE}" >&2
  exit 1
fi

extract_var() {
  local var_name="$1"
  local file="$2"
  grep -E "^[[:space:]]*${var_name}[[:space:]]*=" "$file" | tail -1 | sed -E 's/^[^=]*=[[:space:]]*"?([^"]*)"?[[:space:]]*$/\1/'
}

AWS_REGION="${AWS_REGION:-$(extract_var "aws_region" "${TFVARS_FILE}")}"
TENANT_ID="${TENANT_ID:-$(extract_var "tenant_id" "${TFVARS_FILE}")}"
BUCKET_SUFFIX="${BUCKET_SUFFIX:-$(extract_var "bucket_suffix" "${TFVARS_FILE}")}"
STATE_KMS_KEY_ARN="${TERRAFORM_STATE_KMS_KEY_ARN:-$(extract_var "kms_key_arn" "${TFVARS_FILE}")}"
STATE_LOCK_TABLE="${TERRAFORM_STATE_LOCK_TABLE:-aria-evaluator-tf-locks}"

check_placeholder() {
  local var_name="$1"
  local var_value="$2"
  if [[ -z "${var_value}" ]]; then
    echo "ERROR: ${var_name} is empty. Check terraform.tfvars or override with env var." >&2
    exit 1
  fi
  if [[ "${var_value}" == *REPLACE* || "${var_value}" == *PLACEHOLDER* ]]; then
    echo "ERROR: ${var_name} still contains a placeholder value: '${var_value}'" >&2
    echo "       Run: terraform -chdir=../../bootstrap output  and fill in terraform.tfvars" >&2
    exit 1
  fi
}

check_placeholder "tenant_id"    "${TENANT_ID}"
check_placeholder "bucket_suffix" "${BUCKET_SUFFIX}"
check_placeholder "kms_key_arn"  "${STATE_KMS_KEY_ARN}"

STATE_BUCKET="${TERRAFORM_STATE_BUCKET:-aria-evaluator-tf-state-${BUCKET_SUFFIX}}"
STATE_KEY="${TERRAFORM_STATE_KEY:-tenants/${TENANT_ID}/terraform.tfstate}"

if [[ -z "${AWS_REGION}" ]]; then
  echo "ERROR: aws_region is empty in terraform.tfvars." >&2
  exit 1
fi

echo "Initializing backend with:"
echo "  tfvars         = ${TFVARS_FILE}"
echo "  bucket         = ${STATE_BUCKET}"
echo "  key            = ${STATE_KEY}"
echo "  region         = ${AWS_REGION}"
echo "  dynamodb_table = ${STATE_LOCK_TABLE}"
echo "  kms_key_id     = ${STATE_KMS_KEY_ARN}"

terraform init \
  -backend-config="bucket=${STATE_BUCKET}" \
  -backend-config="key=${STATE_KEY}" \
  -backend-config="region=${AWS_REGION}" \
  -backend-config="dynamodb_table=${STATE_LOCK_TABLE}" \
  -backend-config="kms_key_id=${STATE_KMS_KEY_ARN}" \
  -reconfigure

echo ""
echo "Backend init complete."
echo "Next:"
echo "  terraform plan -var-file=terraform.tfvars"
echo "  terraform apply -var-file=terraform.tfvars"
echo "  terraform destroy -var-file=terraform.tfvars"
