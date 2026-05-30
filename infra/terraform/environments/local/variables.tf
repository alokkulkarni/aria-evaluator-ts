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

# ── Image / build ──────────────────────────────────────────────────────────────

variable "app_image_name" {
  description = "Docker image name:tag for the application"
  type        = string
  default     = "aria-evaluator:local"
}

variable "app_dockerfile_context" {
  description = <<-EOT
    Absolute path to the repo root (where the main Dockerfile lives).
    When set, Terraform builds the image automatically on `apply`.
    Leave empty to use a pre-built image.
  EOT
  type        = string
  default     = ""
}

# ── Ports ──────────────────────────────────────────────────────────────────────

variable "host_port" {
  description = "Host port the application is exposed on (http://localhost:<host_port>)"
  type        = number
  default     = 3001
}

# ── Extra environment variables ────────────────────────────────────────────────
# Use this to pass provider-specific configuration (Amazon Connect instance ID,
# judge model, default eval provider, etc.) without modifying module code.
#
# Example for connecting to a live AWS Bedrock Lambda endpoint:
#   extra_environment_vars = [
#     { name = "BEDROCK_LAMBDA_ENDPOINT", value = "https://<api-gw-id>.execute-api.<region>.amazonaws.com" }
#   ]

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
    When true, deploys a local Bedrock proxy container.
    The proxy authenticates using the Docker host's AWS credentials (~/.aws or env vars).
    Requires IAM permission: bedrock:InvokeModel / bedrock:InvokeModelWithResponseStream.
    When false (default), set BEDROCK_LAMBDA_ENDPOINT in extra_environment_vars
    to point at a deployed AWS API Gateway endpoint instead.
  EOT
  type        = bool
  default     = false
}

variable "bedrock_proxy_dockerfile_context" {
  description = "Absolute path to lambda/bedrock_proxy/ directory. Required when bedrock_proxy_enabled = true and you want auto-build."
  type        = string
  default     = ""
}

variable "bedrock_proxy_host_port" {
  description = "Host port for the local Bedrock proxy"
  type        = number
  default     = 8765
}

variable "bedrock_model_id" {
  description = "Bedrock model ID, ARN, or cross-region inference profile ARN for the local proxy"
  type        = string
  default     = ""
}

variable "bedrock_region" {
  description = "AWS region for Bedrock API calls from the local proxy"
  type        = string
  default     = "eu-west-2"
}

variable "bedrock_system_prompt" {
  description = "System prompt for the local Bedrock proxy"
  type        = string
  default     = ""
}

variable "bedrock_max_tokens" {
  description = "Maximum tokens for Bedrock responses"
  type        = number
  default     = 2048
}
