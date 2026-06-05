variable "app_name" {
  description = "Application name prefix (used in resource names)"
  type        = string
  default     = "aria-bedrock-proxy"
}

variable "environment" {
  description = "Deployment environment label (e.g. local, dev, staging)"
  type        = string
  default     = "local"
}

variable "image_name" {
  description = "Docker image name/tag for the built proxy image"
  type        = string
  default     = "aria-bedrock-proxy:local"
}

variable "dockerfile_context" {
  description = <<-EOT
    Absolute path to the directory containing Dockerfile.local for the proxy.
    When empty the module auto-detects the repo root and appends lambda/bedrock_proxy.
  EOT
  type        = string
  default     = ""
}

variable "host_port" {
  description = "Host port to expose the proxy on (maps to container_port inside Docker)"
  type        = number
  default     = 8765
}

variable "container_port" {
  description = "Port the proxy process listens on inside the container"
  type        = number
  default     = 8000
}

variable "model_id" {
  description = <<-EOT
    Bedrock model ID, ARN, or cross-region inference profile ARN.
    Examples:
      anthropic.claude-3-5-sonnet-20241022-v2:0
      eu.anthropic.claude-sonnet-4-5-20250929-v1:0
      arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-3-5-sonnet-20241022-v2:0
  EOT
  type        = string
  default     = "eu.anthropic.claude-sonnet-4-5-20250929-v1:0"
}

variable "region" {
  description = "AWS region for Bedrock API calls (e.g. eu-west-2, us-east-1)"
  type        = string
  default     = "eu-west-2"
}

variable "system_prompt" {
  description = "Default system prompt injected into every conversation"
  type        = string
  default     = "You are a helpful AI assistant."
}

variable "max_tokens" {
  description = "Maximum number of tokens in each Bedrock response"
  type        = number
  default     = 2048
}

variable "bedrock_read_timeout" {
  description = "Seconds boto3 waits for a Bedrock streaming response before raising ReadTimeoutError (BEDROCK_READ_TIMEOUT env var)"
  type        = number
  default     = 45
}

variable "bedrock_max_retries" {
  description = "Maximum boto3 retry attempts on Bedrock throttling/transient errors (BEDROCK_MAX_RETRIES env var)"
  type        = number
  default     = 1
}
