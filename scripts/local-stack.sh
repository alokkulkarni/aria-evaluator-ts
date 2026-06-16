#!/usr/bin/env bash
# ── local-stack.sh ─────────────────────────────────────────────────────────────
# One-command lifecycle for the full local ARIA stack, provisioned by Terraform
# (kreuzwerker/docker provider — local Docker containers, NO AWS, NO compose).
#
# Brings up / tears down the four local Terraform roots in dependency order:
#   1. local              → postgres + redis + evaluator app   (:3001, db :5432, redis :6379)
#   2. bedrock-proxy-local → bedrock proxy                       (:8765)
#   3. control-plane-local → tenant control plane (local mode)   (:4000)
#   4. website-local       → marketing + signup site             (:3000)
#
# Multi-tenant is wired in the tfvars/modules: the evaluator runs with
# TENANT_SCOPING_MODE=enforce against the shared postgres, and the control plane
# runs in local mode (no PLATFORM_* env) seeding a demo tenant.
#
# Usage:
#   scripts/local-stack.sh up       # terraform init + apply all roots (in order)
#   scripts/local-stack.sh down     # terraform destroy all roots (reverse order)
#   scripts/local-stack.sh status   # docker ps for the aria-* containers
#   scripts/local-stack.sh restart  # down then up

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_DIR="$REPO_ROOT/infra/terraform/environments"

# Dependency order (postgres/redis first; website last as it fronts the rest).
ROOTS=(local bedrock-proxy-local control-plane-local website-local)

apply_root() {
  local root="$1"
  echo ""
  echo "▶ terraform apply: $root"
  cd "$ENV_DIR/$root"
  terraform init -input=false >/dev/null
  terraform apply -input=false -auto-approve
}

destroy_root() {
  local root="$1"
  echo ""
  echo "▶ terraform destroy: $root"
  cd "$ENV_DIR/$root"
  terraform init -input=false >/dev/null
  terraform destroy -input=false -auto-approve
}

cmd="${1:-up}"
case "$cmd" in
  up)
    for r in "${ROOTS[@]}"; do apply_root "$r"; done
    echo ""
    echo "✅ Local stack up:"
    echo "   evaluator      http://localhost:3001"
    echo "   control-plane  http://localhost:4000"
    echo "   website        http://localhost:3000"
    echo "   bedrock-proxy  http://localhost:8765"
    ;;
  down)
    for ((i=${#ROOTS[@]}-1; i>=0; i--)); do destroy_root "${ROOTS[$i]}"; done
    echo ""
    echo "✅ Local stack destroyed."
    ;;
  restart)
    "$0" down
    "$0" up
    ;;
  status)
    docker ps --filter "label=managed-by=terraform" \
      --format 'table {{.Names}}\t{{.Ports}}\t{{.Status}}'
    ;;
  *)
    echo "Usage: $0 {up|down|restart|status}" >&2
    exit 1
    ;;
esac
