#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# deploy.sh — Build, push, and deploy aria-evaluator-ts to ECS via Terraform
#
# Usage:
#   ./infra/terraform/scripts/deploy.sh [ENV] [IMAGE_TAG]
#
# Arguments:
#   ENV        Target environment: dev | prod  (default: dev)
#   IMAGE_TAG  Docker image tag to build and push  (default: git short SHA)
#
# Prerequisites:
#   - AWS CLI configured with credentials for the target account
#   - Terraform >= 1.6 installed
#   - Docker running
#   - terraform.tfvars present in the target environment directory
#
# Examples:
#   ./infra/terraform/scripts/deploy.sh dev
#   ./infra/terraform/scripts/deploy.sh prod v1.2.3
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Arguments ─────────────────────────────────────────────────────────────────
ENV="${1:-dev}"
IMAGE_TAG="${2:-$(git rev-parse --short HEAD 2>/dev/null || echo "latest")}"

if [[ "$ENV" != "dev" && "$ENV" != "prod" ]]; then
  echo "ERROR: ENV must be 'dev' or 'prod'. Got: $ENV" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
TF_DIR="${SCRIPT_DIR}/../environments/${ENV}"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  ARIA Evaluator — Deploy                                     ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  Environment : ${ENV}"
echo "║  Image tag   : ${IMAGE_TAG}"
echo "║  Terraform   : ${TF_DIR}"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# ── Step 1: Terraform init + apply (infra only, placeholder image) ────────────
echo "▶  Step 1/4 — Terraform init"
terraform -chdir="${TF_DIR}" init -upgrade

echo ""
echo "▶  Step 2/4 — Terraform apply (infrastructure)"
terraform -chdir="${TF_DIR}" apply \
  -var-file=terraform.tfvars \
  -auto-approve

# ── Step 2: Read ECR URI from Terraform output ────────────────────────────────
echo ""
echo "▶  Step 3/4 — Build and push Docker image"

ECR_URL=$(terraform -chdir="${TF_DIR}" output -raw ecr_repository_url)
AWS_REGION=$(terraform -chdir="${TF_DIR}" output -raw cloudfront_url 2>/dev/null | true)
# Derive region from ECR URL (format: <account>.dkr.ecr.<region>.amazonaws.com/<name>)
AWS_REGION=$(echo "${ECR_URL}" | sed -E 's/.*\.dkr\.ecr\.([^.]+)\.amazonaws\.com.*/\1/')
FULL_IMAGE_URI="${ECR_URL}:${IMAGE_TAG}"

echo "   ECR URL    : ${ECR_URL}"
echo "   Region     : ${AWS_REGION}"
echo "   Image URI  : ${FULL_IMAGE_URI}"
echo ""

# Authenticate Docker to ECR
aws ecr get-login-password --region "${AWS_REGION}" \
  | docker login --username AWS --password-stdin "${ECR_URL}"

# Build for linux/amd64 (Fargate requirement)
docker build \
  --platform linux/amd64 \
  --tag "${FULL_IMAGE_URI}" \
  "${REPO_ROOT}"

docker push "${FULL_IMAGE_URI}"
echo "   Image pushed: ${FULL_IMAGE_URI}"

# ── Step 3: Re-apply Terraform with the real image URI ────────────────────────
echo ""
echo "▶  Step 4/4 — Terraform apply (update ECS task definition with new image)"
terraform -chdir="${TF_DIR}" apply \
  -var-file=terraform.tfvars \
  -var="app_image_uri=${FULL_IMAGE_URI}" \
  -auto-approve

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
CLOUDFRONT_URL=$(terraform -chdir="${TF_DIR}" output -raw cloudfront_url 2>/dev/null || echo "(run terraform output cloudfront_url)")
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  Deploy complete                                             ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  App URL : ${CLOUDFRONT_URL}"
echo "║  Image   : ${FULL_IMAGE_URI}"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
