#!/usr/bin/env bash
# =============================================================================
# destroy-prod.sh — tear down the full prod stack in the correct order.
#
# Reverse of deploy-prod.sh: connectivity FIRST (releases the VPC peering +
# cross-VPC routes + SG rule), then control-plane and evaluator can be
# destroyed independently. Destroying connectivity first prevents the peering
# from pinning either VPC.
#
#   connectivity-prod  →  control-plane-prod  →  evaluator-prod
#
# Usage:
#   ./infra/terraform/scripts/destroy-prod.sh [-y]
#     -y   auto-approve (non-interactive)
#
# NOTE: evaluator-prod's Aurora cluster has deletion protection enabled; you may
# need to disable it before this completes.
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENVS="${SCRIPT_DIR}/../environments"

APPROVE=""
while getopts "yh" opt; do
  case "$opt" in
    y) APPROVE="-auto-approve" ;;
    h) sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "Unknown option" >&2; exit 1 ;;
  esac
done

destroy_env() {
  local dir="$1"
  echo ""; echo "▶  destroying ${dir}"
  ( cd "${ENVS}/${dir}" && ./init-backend.sh && terraform destroy ${APPROVE} -var-file=terraform.tfvars )
}

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  Destroy prod: connectivity → control-plane → evaluator       ║"
echo "╚══════════════════════════════════════════════════════════════╝"

destroy_env connectivity-prod
destroy_env control-plane-prod
destroy_env evaluator-prod

echo ""
echo "✅ prod stack destroyed."
