#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# destroy.sh — Tear down an aria-evaluator-ts environment
#
# Usage:
#   ./infra/terraform/scripts/destroy.sh [ENV]
#
# Arguments:
#   ENV   Target environment: dev | prod  (default: dev)
#
# WARNING: This destroys ALL infrastructure in the target environment.
#          The prod environment requires an explicit confirmation prompt.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ENV="${1:-dev}"

if [[ "$ENV" != "dev" && "$ENV" != "prod" ]]; then
  echo "ERROR: ENV must be 'dev' or 'prod'. Got: $ENV" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TF_DIR="${SCRIPT_DIR}/../environments/${ENV}"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  ARIA Evaluator — DESTROY                                    ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  Environment : ${ENV}"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

if [[ "$ENV" == "prod" ]]; then
  echo "WARNING: You are about to destroy the PRODUCTION environment."
  read -r -p "Type 'destroy-prod' to confirm: " CONFIRM
  if [[ "$CONFIRM" != "destroy-prod" ]]; then
    echo "Aborted."
    exit 1
  fi
fi

terraform -chdir="${TF_DIR}" init -upgrade

terraform -chdir="${TF_DIR}" destroy \
  -var-file=terraform.tfvars \
  -auto-approve

echo ""
echo "Environment '${ENV}' destroyed."
