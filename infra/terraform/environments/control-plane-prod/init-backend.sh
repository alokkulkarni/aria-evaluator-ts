#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TFVARS_FILE="${SCRIPT_DIR}/terraform.tfvars"

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
STATE_BUCKET="${TERRAFORM_STATE_BUCKET:-$(extract_var "terraform_state_bucket" "${TFVARS_FILE}")}"
STATE_KMS_KEY_ARN="${TERRAFORM_STATE_KMS_KEY_ARN:-$(extract_var "terraform_state_kms_key_arn" "${TFVARS_FILE}")}"
STATE_LOCK_TABLE="${TERRAFORM_STATE_LOCK_TABLE:-$(extract_var "terraform_state_lock_table" "${TFVARS_FILE}")}"

if [[ -z "${AWS_REGION}" || -z "${STATE_BUCKET}" || -z "${STATE_KMS_KEY_ARN}" ]]; then
  echo "ERROR: Missing required backend values (aws_region, terraform_state_bucket, terraform_state_kms_key_arn)." >&2
  exit 1
fi

if [[ -z "${STATE_LOCK_TABLE}" ]]; then
  STATE_LOCK_TABLE="aria-evaluator-tf-locks"
fi

STATE_KEY="${TERRAFORM_STATE_KEY:-control-plane/prod/terraform.tfstate}"

echo "Initializing backend with:"
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
