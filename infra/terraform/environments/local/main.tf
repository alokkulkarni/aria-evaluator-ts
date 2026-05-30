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

  # ── Local Bedrock proxy ──────────────────────────────────────────────────────
  # Option A (default): set bedrock_proxy_enabled = false and pass
  #   BEDROCK_LAMBDA_ENDPOINT via extra_environment_vars pointing at an AWS URL.
  #
  # Option B: set bedrock_proxy_enabled = true to run the proxy locally.
  #   Requires valid AWS credentials on the Docker host with bedrock:InvokeModel.
  bedrock_proxy_enabled            = var.bedrock_proxy_enabled
  bedrock_proxy_dockerfile_context = var.bedrock_proxy_dockerfile_context
  bedrock_proxy_host_port          = var.bedrock_proxy_host_port
  bedrock_proxy_image_name         = "aria-bedrock-proxy:local"
  bedrock_model_id                 = var.bedrock_model_id
  bedrock_region                   = var.bedrock_region
  bedrock_system_prompt            = var.bedrock_system_prompt
  bedrock_max_tokens               = var.bedrock_max_tokens
}
