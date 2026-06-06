module "docker_local" {
  source = "../../modules/docker-local"

  app_name    = var.app_name
  environment = var.environment

  # Image — set app_dockerfile_context to the repo root for automatic builds,
  # or leave empty and pre-build: `docker build -t aria-evaluator:local .`
  app_image_name         = var.app_image_name
  app_dockerfile_context = var.app_dockerfile_context

  container_port = 3001
  host_port      = var.host_port

  extra_environment_vars = var.extra_environment_vars

  # ── External Bedrock proxy ───────────────────────────────────────────────────
  # The Bedrock proxy now runs as a completely standalone service deployed with:
  #   cd infra/terraform/environments/bedrock-proxy-local && terraform apply
  #
  # After deploying the proxy, set bedrock_proxy_url here so the evaluator can
  # reach it across Docker network boundaries via the host loopback.
  # On macOS/Windows (Docker Desktop):  "http://host.docker.internal:8765"
  # On Linux native Docker:             "http://host.docker.internal:8765"
  #   (the proxy module sets extra_hosts so host.docker.internal resolves)
  # Leave empty to omit BEDROCK_LAMBDA_ENDPOINT (set it manually via
  # extra_environment_vars pointing at AWS API Gateway instead).
  bedrock_proxy_url = var.bedrock_proxy_url

  # ── Scenarios / DB bind-mounts ───────────────────────────────────────────────
  local_scenarios_dir = var.local_scenarios_dir
  local_db_path       = var.local_db_path

  # ── Control plane SSO ────────────────────────────────────────────────────────
  # Point at the local control-plane container. Use host.docker.internal so the
  # evaluator container can reach the control-plane container on the host network.
  # Override in terraform.tfvars if using a different host port.
  control_plane_internal_url    = var.control_plane_internal_url
  control_plane_internal_secret = var.control_plane_internal_secret

  website_url = var.website_url
}
