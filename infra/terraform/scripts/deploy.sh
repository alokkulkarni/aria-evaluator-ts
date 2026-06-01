#!/usr/bin/env bash
# =============================================================================
# deploy.sh — Deploy aria-evaluator-ts to AWS via Terraform
#
# Deploys the ARIA Evaluator (ECS + CloudFront) and optionally the Bedrock
# proxy Lambda. Both components can be deployed independently.
#
# Usage:
#   ./infra/terraform/scripts/deploy.sh [OPTIONS]
#
# Options:
#   -e, --env ENV           Target environment: dev | prod  (default: dev)
#   -t, --tag TAG           Docker image tag  (default: git short SHA)
#   -c, --component COMP    What to deploy: all | evaluator | bedrock  (default: all)
#   -h, --help              Show this help
#
# Examples:
#   # Deploy everything to dev
#   ./infra/terraform/scripts/deploy.sh
#
#   # Deploy only the Bedrock proxy to prod
#   ./infra/terraform/scripts/deploy.sh -e prod -c bedrock
#
#   # Deploy only the evaluator to dev with a specific tag
#   ./infra/terraform/scripts/deploy.sh -e dev -t v1.2.3 -c evaluator
#
# Prerequisites:
#   - AWS CLI configured with credentials for the target account
#   - Terraform >= 1.6 installed
#   - Docker running (only needed when deploying the evaluator)
#   - terraform.tfvars present in the target environment directory
# =============================================================================
set -euo pipefail

# ── Defaults ──────────────────────────────────────────────────────────────────
ENV="dev"
IMAGE_TAG=""
COMPONENT="all"

# ── Argument parsing ──────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    -e|--env)       ENV="$2";       shift 2 ;;
    -t|--tag)       IMAGE_TAG="$2"; shift 2 ;;
    -c|--component) COMPONENT="$2"; shift 2 ;;
    -h|--help)
      sed -n '/^# Usage/,/^# Prerequisites/p' "$0"
      exit 0
      ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

# ── Validate arguments ────────────────────────────────────────────────────────
if [[ "$ENV" != "dev" && "$ENV" != "prod" ]]; then
  echo "ERROR: --env must be 'dev' or 'prod'. Got: $ENV" >&2; exit 1
fi
if [[ "$COMPONENT" != "all" && "$COMPONENT" != "evaluator" && "$COMPONENT" != "bedrock" ]]; then
  echo "ERROR: --component must be 'all', 'evaluator', or 'bedrock'. Got: $COMPONENT" >&2; exit 1
fi

# ── Paths ─────────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
TF_DIR="${SCRIPT_DIR}/../environments/${ENV}"

# Default image tag to git short SHA
if [[ -z "$IMAGE_TAG" ]]; then
  IMAGE_TAG="$(git -C "${REPO_ROOT}" rev-parse --short HEAD 2>/dev/null || echo "latest")"
fi

# ── Banner ────────────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  ARIA Evaluator — AWS Deploy                                 ║"
echo "╠══════════════════════════════════════════════════════════════╣"
printf "║  Environment : %-45s║\n" "$ENV"
printf "║  Component   : %-45s║\n" "$COMPONENT"
printf "║  Image tag   : %-45s║\n" "$IMAGE_TAG"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# ── Helper: run terraform ─────────────────────────────────────────────────────
tf() { terraform -chdir="${TF_DIR}" "$@"; }

# ── Step 1: Init ──────────────────────────────────────────────────────────────
echo "▶  [1/4] terraform init"
tf init -upgrade

# ── Step 2: Apply infrastructure (with placeholder image if evaluator) ────────
echo ""
echo "▶  [2/4] terraform apply — infrastructure"

if [[ "$COMPONENT" == "bedrock" ]]; then
  # Only enable the Bedrock Lambda; leave evaluator unchanged
  tf apply \
    -var-file=terraform.tfvars \
    -var="bedrock_lambda_enabled=true" \
    -target=module.bedrock_lambda \
    -auto-approve
  echo ""
  echo "▶  Bedrock proxy deployed. Skipping evaluator steps."
  _SKIP_EVALUATOR=true
else
  tf apply \
    -var-file=terraform.tfvars \
    -auto-approve
  _SKIP_EVALUATOR=false
fi

# ── Step 3: Build and push Docker image (evaluator only) ─────────────────────
if [[ "$_SKIP_EVALUATOR" == "false" ]]; then
  echo ""
  echo "▶  [3/4] Build and push Docker image"

  ECR_URL="$(tf output -raw ecr_repository_url)"
  # Extract region from ECR URL: <account>.dkr.ecr.<region>.amazonaws.com/<name>
  AWS_REGION="$(echo "${ECR_URL}" | sed -E 's/[^.]+\.dkr\.ecr\.([^.]+)\.amazonaws\.com.*/\1/')"
  FULL_IMAGE_URI="${ECR_URL}:${IMAGE_TAG}"

  printf "   ECR URL   : %s\n" "${ECR_URL}"
  printf "   Region    : %s\n" "${AWS_REGION}"
  printf "   Image URI : %s\n" "${FULL_IMAGE_URI}"
  echo ""

  aws ecr get-login-password --region "${AWS_REGION}" \
    | docker login --username AWS --password-stdin "${ECR_URL}"

  # Build stage runs natively (no --platform on build stage) — runtime stage
  # is linux/amd64 for Fargate x86. See Dockerfile for details.
  docker build \
    --tag "${FULL_IMAGE_URI}" \
    "${REPO_ROOT}"

  docker push "${FULL_IMAGE_URI}"
  echo "   Pushed: ${FULL_IMAGE_URI}"

  # ── Step 4: Re-apply with real image URI ────────────────────────────────────
  echo ""
  echo "▶  [4/4] terraform apply — update ECS task definition"
  tf apply \
    -var-file=terraform.tfvars \
    -var="app_image_uri=${FULL_IMAGE_URI}" \
    -auto-approve
else
  echo ""
  echo "▶  [3/4] Skipped (bedrock-only deploy)"
  echo "▶  [4/4] Skipped (bedrock-only deploy)"
fi

# ── Print all URLs ─────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  Deploy complete — URLs                                      ║"
echo "╠══════════════════════════════════════════════════════════════╣"

_cf_url="$(tf output -raw evaluator_url 2>/dev/null || echo "(not deployed)")"
_alb_url="$(tf output -raw evaluator_alb_dns 2>/dev/null || echo "(not deployed)")"
_bp_chat="$(tf output -raw bedrock_proxy_chat_url 2>/dev/null || echo "(not deployed)")"
_bp_health="$(tf output -raw bedrock_proxy_health_url 2>/dev/null || echo "(not deployed)")"
_ecr="$(tf output -raw ecr_repository_url 2>/dev/null || echo "(not deployed)")"
_cluster="$(tf output -raw ecs_cluster_name 2>/dev/null || echo "(not deployed)")"
_logs="$(tf output -raw ecs_log_group_name 2>/dev/null || echo "(not deployed)")"

printf "║  Evaluator (CloudFront) : %-34s║\n" "${_cf_url}"
printf "║  Evaluator (ALB direct) : %-34s║\n" "http://${_alb_url}"
printf "║  Bedrock proxy /chat    : %-34s║\n" "${_bp_chat}"
printf "║  Bedrock proxy /health  : %-34s║\n" "${_bp_health}"
echo "╠══════════════════════════════════════════════════════════════╣"
printf "║  ECR repository         : %-34s║\n" "${_ecr}"
printf "║  ECS cluster            : %-34s║\n" "${_cluster}"
printf "║  CloudWatch logs        : %-34s║\n" "${_logs}"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "  Run 'terraform -chdir=${TF_DIR} output summary' to see all outputs."
echo ""
