# ── Module gate ───────────────────────────────────────────────────────────────

variable "enabled" {
  description = "Set to false to skip creating all resources in this module"
  type        = bool
  default     = true
}

# ── Naming ────────────────────────────────────────────────────────────────────

variable "app_name" {
  description = "Application name prefix used in resource names"
  type        = string
}

variable "environment" {
  description = "Deployment environment (dev, staging, prod)"
  type        = string
}

# ── Lambda ────────────────────────────────────────────────────────────────────

variable "lambda_memory_size" {
  description = "Lambda memory allocation in MiB"
  type        = number
  default     = 512
}

variable "lambda_timeout" {
  description = "Lambda execution timeout in seconds (max 900). Set >= 120 for large models."
  type        = number
  default     = 120
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days"
  type        = number
  default     = 7
}

# ── Bedrock configuration ─────────────────────────────────────────────────────

variable "bedrock_model_id" {
  description = <<-EOT
    Bedrock model to invoke. Accepts any of:
      - Bare model ID:               anthropic.claude-3-5-sonnet-20241022-v2:0
      - Cross-region inference ID:   eu.anthropic.claude-3-5-sonnet-20241022-v2:0
      - Foundation-model ARN:        arn:aws:bedrock:eu-west-2::foundation-model/...
      - Inference-profile ARN:       arn:aws:bedrock:us-east-1:ACCOUNT:inference-profile/...
      - Provisioned-model ARN:       arn:aws:bedrock:eu-west-2:ACCOUNT:provisioned-model/...
  EOT
  type        = string
}

variable "bedrock_region" {
  description = <<-EOT
    AWS region for Bedrock API calls. Used as the fallback when bedrock_model_id
    does not contain an embedded region (i.e. it is not a full ARN).
    Defaults to eu-west-2. Cross-region inference profiles auto-detect their
    home region from the model ID, so this may differ from the Lambda region.
  EOT
  type        = string
  default     = "eu-west-2"
}

variable "system_prompt" {
  description = "System prompt injected into every Bedrock conversation. Leave empty for no system prompt."
  type        = string
  default     = ""
}

variable "max_tokens" {
  description = "Default maximum number of tokens to generate"
  type        = number
  default     = 2048
}

variable "temperature" {
  description = "Default sampling temperature (0.0-1.0)"
  type        = number
  default     = 0.7
}

variable "top_p" {
  description = "Default nucleus sampling top-p (0.0-1.0)"
  type        = number
  default     = 0.9
}

# ── CORS ──────────────────────────────────────────────────────────────────────

variable "allowed_origins" {
  description = <<-EOT
    Comma-separated list of allowed CORS origins. Configured at both the
    HTTP API level and inside the Lambda handler.
    Example: "https://app.example.com,https://staging.example.com"
    Use "*" to allow all origins (not recommended for production).
  EOT
  type        = string
  default     = "*"
}

# ── Tags ──────────────────────────────────────────────────────────────────────

variable "tags" {
  description = "Additional tags applied to all resources"
  type        = map(string)
  default     = {}
}
