variable "app_name" {
  description = "Application name prefix (used in resource names)"
  type        = string
  default     = "aria-bedrock-proxy"
}

variable "environment" {
  description = "Deployment environment label"
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
    Absolute path to the directory containing Dockerfile.local.
    Leave blank to auto-detect from the repository root.
  EOT
  type    = string
  default = ""
}

variable "host_port" {
  description = "Host port to expose the proxy on"
  type        = number
  default     = 8765
}

variable "container_port" {
  description = "Port the proxy listens on inside the container"
  type        = number
  default     = 8000
}

variable "model_id" {
  description = "Bedrock model ID, ARN, or cross-region inference profile ARN"
  type        = string
  default     = "eu.anthropic.claude-sonnet-4-5-20250929-v1:0"
}

variable "region" {
  description = "AWS region for Bedrock API calls"
  type        = string
  default     = "eu-west-2"
}

variable "system_prompt" {
  description = "Default system prompt for the model"
  type        = string
  default     = "You are a helpful AI assistant."
}

variable "max_tokens" {
  description = "Maximum tokens in each model response"
  type        = number
  default     = 2048
}

variable "bedrock_read_timeout" {
  description = "Seconds to wait for a Bedrock response (BEDROCK_READ_TIMEOUT)"
  type        = number
  default     = 45
}

variable "bedrock_max_retries" {
  description = "boto3 retry attempts on throttling/transient errors (BEDROCK_MAX_RETRIES)"
  type        = number
  default     = 1
}
