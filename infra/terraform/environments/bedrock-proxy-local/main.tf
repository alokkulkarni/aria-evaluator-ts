module "bedrock_proxy" {
  source = "../../modules/docker-bedrock-proxy"

  app_name           = var.app_name
  environment        = var.environment
  image_name         = var.image_name
  dockerfile_context = var.dockerfile_context
  host_port          = var.host_port
  container_port     = var.container_port
  model_id           = var.model_id
  region             = var.region
  system_prompt      = var.system_prompt
  max_tokens         = var.max_tokens
  bedrock_read_timeout = var.bedrock_read_timeout
  bedrock_max_retries  = var.bedrock_max_retries
}
