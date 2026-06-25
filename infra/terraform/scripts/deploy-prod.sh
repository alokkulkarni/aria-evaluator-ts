#!/usr/bin/env bash
# =============================================================================
# deploy-prod.sh — deploy the full LINKED prod stack in one command.
#
# Stands up, in strict dependency order:
#   1. control-plane-prod   builds its image in-apply; publishes the SSM params
#                           (internal-url + internal-secret-arn) the evaluator reads
#   2. evaluator-prod       two-phase: apply (creates ECR) → build+push image →
#                           re-apply with the real image URI; reads the control-plane
#                           SSM params at apply time
#   3. connectivity-prod    VPC peering + routes + SG rule so the evaluator can
#                           reach the control-plane internal ALB for the SSO verify call
#
# The auth linkage (CONTROL_PLANE_INTERNAL_URL / _SECRET) auto-wires via SSM +
# Secrets Manager — no hand-copied values. This script just enforces the order.
#
# Usage:
#   ./infra/terraform/scripts/deploy-prod.sh [-t IMAGE_TAG] [-y]
#     -t TAG   evaluator image tag (default: git short SHA)
#     -y       auto-approve terraform applies (non-interactive)
#
# Prerequisites:
#   - AWS CLI configured for the prod account
#   - Terraform >= 1.6, Docker running
#   - terraform.tfvars present in each of the three prod env directories
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENVS="${SCRIPT_DIR}/../environments"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
REGION="${AWS_REGION:-eu-west-2}"

IMAGE_TAG="$(git -C "${REPO_ROOT}" rev-parse --short HEAD 2>/dev/null || echo latest)"
APPROVE=""
while getopts "t:yh" opt; do
  case "$opt" in
    t) IMAGE_TAG="$OPTARG" ;;
    y) APPROVE="-auto-approve" ;;
    h) sed -n '2,30p' "$0"; exit 0 ;;
    *) echo "Unknown option" >&2; exit 1 ;;
  esac
done

apply_env() {
  local dir="$1"
  ( cd "${ENVS}/${dir}" && ./init-backend.sh && terraform apply ${APPROVE} -var-file=terraform.tfvars )
}

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  Deploy prod: control-plane → evaluator → connectivity        ║"
echo "║  Evaluator image tag: ${IMAGE_TAG}"
echo "╚══════════════════════════════════════════════════════════════╝"

# ── 1. control-plane-prod ─────────────────────────────────────────────────────
echo ""; echo "▶  [1/3] control-plane-prod"
apply_env control-plane-prod

# control-plane publishes the SSM params the evaluator reads at apply time.
echo ""; echo "▶  verifying control-plane → evaluator SSO linkage (SSM)"
aws ssm get-parameter --name "/aria/control-plane/prod/internal-url"        --region "${REGION}" >/dev/null
aws ssm get-parameter --name "/aria/control-plane/prod/internal-secret-arn" --region "${REGION}" >/dev/null
echo "   control-plane internal URL + secret published ✓"

# ── 2. evaluator-prod (two-phase image build) ─────────────────────────────────
echo ""; echo "▶  [2/3] evaluator-prod"
EVAL_DIR="${ENVS}/evaluator-prod"
( cd "${EVAL_DIR}" && ./init-backend.sh )
# Phase A: create infra (ECR, ALB, Aurora, …) with the placeholder image.
( cd "${EVAL_DIR}" && terraform apply ${APPROVE} -var-file=terraform.tfvars )
# Build + push the evaluator image to its ECR repo.
ECR_URL="$( cd "${EVAL_DIR}" && terraform output -raw ecr_repository_url )"
IMG="${ECR_URL}:${IMAGE_TAG}"
echo "   building + pushing ${IMG}"
aws ecr get-login-password --region "${REGION}" | docker login --username AWS --password-stdin "${ECR_URL}"
docker build --tag "${IMG}" "${REPO_ROOT}"
docker push "${IMG}"
# Phase B: re-apply so the ECS task definition uses the real image.
( cd "${EVAL_DIR}" && terraform apply ${APPROVE} -var-file=terraform.tfvars -var="app_image_uri=${IMG}" )

# ── 3. connectivity-prod ──────────────────────────────────────────────────────
echo ""; echo "▶  [3/3] connectivity-prod"
apply_env connectivity-prod

echo ""
echo "✅ prod deployed and SSO-linked (control-plane ↔ evaluator)."
EVAL_URL="$( cd "${EVAL_DIR}" && terraform output -raw evaluator_url 2>/dev/null || echo '(see evaluator-prod outputs)' )"
echo "   Evaluator: ${EVAL_URL}"
echo "   First sign-up becomes the admin; manage users in-app from the Team page."
