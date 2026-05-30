variable "app_name" {
  description = "Application name used as a prefix for Docker resources"
  type        = string
  default     = "aria-evaluator"
}

variable "environment" {
  description = "Deployment environment label"
  type        = string
  default     = "local"
}

# ── Application image ──────────────────────────────────────────────────────────

variable "app_image_name" {
  description = "Docker image name:tag for the application. Used as-is when app_dockerfile_context is empty."
  type        = string
  default     = "aria-evaluator:local"
}

variable "app_dockerfile_context" {
  description = <<-EOT
    Absolute path to the directory containing the Dockerfile (the repo root).
    Terraform always builds the image locally — it never pulls from a registry.
    Leave empty (default) to let the module auto-detect the repo root from its
    own path (four levels up from modules/docker-local/).
    Set explicitly when the module is used from a non-standard location.
  EOT
  type        = string
  default     = ""
}

# ── Ports ──────────────────────────────────────────────────────────────────────

variable "container_port" {
  description = "Port the application listens on inside the container"
  type        = number
  default     = 3001
}

variable "host_port" {
  description = "Host port mapped to container_port — application accessible at http://localhost:<host_port>"
  type        = number
  default     = 3001
}

# ── Extra environment variables ────────────────────────────────────────────────

variable "extra_environment_vars" {
  description = "Additional environment variables injected into the application container"
  type = list(object({
    name  = string
    value = string
  }))
  default = []
}

# ── Local Bedrock proxy ────────────────────────────────────────────────────────

variable "bedrock_proxy_enabled" {
  description = <<-EOT
    Deploy a local Bedrock proxy container alongside the application.
    The proxy wraps lambda/bedrock_proxy/handler.py as a plain HTTP server on bedrock_proxy_host_port.
    Requires valid AWS credentials available to the Docker host (e.g. ~/.aws or env vars).
    When disabled (default), point BEDROCK_LAMBDA_ENDPOINT in extra_environment_vars at a live AWS API GW URL.
  EOT
  type        = bool
  default     = false
}

variable "bedrock_proxy_image_name" {
  description = "Docker image name:tag for the local Bedrock proxy"
  type        = string
  default     = "aria-bedrock-proxy:local"
}

variable "bedrock_proxy_dockerfile_context" {
  description = "Absolute path to the directory containing Dockerfile.local for the Bedrock proxy (e.g. lambda/bedrock_proxy). Leave empty to use a pre-built image."
  type        = string
  default     = ""
}

variable "bedrock_proxy_host_port" {
  description = "Host port for the local Bedrock proxy — accessible at http://localhost:<port>"
  type        = number
  default     = 8765
}

variable "bedrock_model_id" {
  description = "Bedrock model ID, ARN, or cross-region inference profile ARN passed to the local proxy"
  type        = string
  default     = ""
}

variable "bedrock_region" {
  description = "AWS region for Bedrock API calls made by the local proxy"
  type        = string
  default     = "eu-west-2"
}

variable "bedrock_system_prompt" {
  description = "Default system prompt for the local Bedrock proxy"
  type        = string
  default     = ""
}

variable "bedrock_max_tokens" {
  description = "Maximum tokens for Bedrock responses via the local proxy"
  type        = number
  default     = 2048
}
