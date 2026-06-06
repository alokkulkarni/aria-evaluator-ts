# ── Core ──────────────────────────────────────────────────────────────────────

variable "aws_region" {
  description = "AWS region to deploy into"
  type        = string
  default     = "eu-west-2"
}

variable "app_name" {
  description = "Application name used as a prefix for all resource names"
  type        = string
  default     = "aria-evaluator"
}

variable "environment" {
  description = "Deployment environment"
  type        = string
  default     = "dev"
}

variable "tenant_id" {
  description = "Identifier for this deployment. Dev uses a fixed standalone value."
  type        = string
  default     = "dev-standalone"
}

variable "pricing_tier" {
  description = "Pricing tier tag for resource classification"
  type        = string
  default     = "individual"
}

variable "pricing_track" {
  description = "Pricing track tag for resource classification"
  type        = string
  default     = "individual"
}

variable "bucket_suffix" {
  description = "Short unique suffix appended to the S3 bucket name to ensure global uniqueness (e.g. account ID last 6 digits)"
  type        = string
}

# ── Networking ────────────────────────────────────────────────────────────────

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.42.0.0/16"
}

variable "public_subnet_cidrs" {
  description = "CIDR blocks for public subnets (one per AZ)"
  type        = list(string)
  default     = ["10.42.1.0/24", "10.42.2.0/24"]
}

# ── ECS ───────────────────────────────────────────────────────────────────────

variable "app_image_uri" {
  description = "Full ECR image URI including tag (e.g. 123456789012.dkr.ecr.eu-west-2.amazonaws.com/aria-evaluator:latest)"
  type        = string
  default     = "placeholder/aria-evaluator:latest"
}

variable "container_port" {
  description = "Port the container listens on"
  type        = number
  default     = 3001
}

variable "cpu" {
  description = "Fargate task CPU units"
  type        = number
  default     = 256
}

variable "memory" {
  description = "Fargate task memory in MiB"
  type        = number
  default     = 512
}

variable "desired_count" {
  description = "Number of ECS tasks to run (0 = stopped)"
  type        = number
  default     = 1
}

variable "s3_state_prefix" {
  description = "S3 key prefix for state files"
  type        = string
  default     = "aria-evaluator"
}

variable "s3_sync_interval_seconds" {
  description = "Interval in seconds between S3 state sync operations"
  type        = number
  default     = 30
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days"
  type        = number
  default     = 7
}

# ── Amazon Connect ────────────────────────────────────────────────────────────

variable "connect_instance_id" {
  description = "Amazon Connect instance ID for IAM scoping. Use '*' to allow all instances."
  type        = string
  default     = "*"
}

# ── CloudFront ────────────────────────────────────────────────────────────────

variable "cloudfront_price_class" {
  description = "CloudFront price class"
  type        = string
  default     = "PriceClass_100"
}

variable "acm_certificate_arn" {
  description = "ACM certificate ARN (us-east-1) for custom domain. Leave empty for default CloudFront cert."
  type        = string
  default     = ""
}

variable "cloudfront_aliases" {
  description = "Custom domain aliases for CloudFront (requires acm_certificate_arn)"
  type        = list(string)
  default     = []
}

# ── App-specific environment variables ────────────────────────────────────────

variable "extra_environment_vars" {
  description = "Additional environment variables injected into the ECS container"
  type = list(object({
    name  = string
    value = string
  }))
  default = []
}

variable "tags" {
  description = "Additional tags applied to all resources"
  type        = map(string)
  default     = {}
}

# ── Bedrock Lambda ────────────────────────────────────────────────────────────

variable "bedrock_lambda_enabled" {
  description = "Set to true to deploy the Bedrock proxy Lambda and HTTP API"
  type        = bool
  default     = false
}

variable "bedrock_model_id" {
  description = <<-EOT
    Bedrock model to invoke. Accepts a bare model ID, cross-region inference
    prefix ID, foundation-model ARN, inference-profile ARN, or provisioned-model ARN.
    Examples:
      anthropic.claude-3-5-sonnet-20241022-v2:0
      eu.anthropic.claude-3-5-sonnet-20241022-v2:0
      arn:aws:bedrock:eu-west-2::foundation-model/anthropic.claude-3-5-sonnet-20241022-v2:0
  EOT
  type        = string
  default     = "anthropic.claude-3-haiku-20240307-v1:0"
}

variable "bedrock_region" {
  description = "AWS region used for Bedrock API calls (may differ from the deployment region)"
  type        = string
  default     = "eu-west-2"
}

variable "bedrock_system_prompt" {
  description = "Default system prompt injected into every Bedrock conversation"
  type        = string
  default     = ""
}

variable "bedrock_allowed_origins" {
  description = "Comma-separated CORS origins for the Bedrock HTTP API (e.g. https://app.example.com)"
  type        = string
  default     = "*"
}

variable "bedrock_lambda_memory_size" {
  description = "Memory allocation in MiB for the Bedrock proxy Lambda"
  type        = number
  default     = 512
}

variable "bedrock_lambda_timeout" {
  description = "Timeout in seconds for the Bedrock proxy Lambda"
  type        = number
  default     = 120
}

variable "control_plane_internal_url" {
  description = "Internal ALB URL of the control plane for server-side SSO token exchange"
  type        = string
  default     = ""
}

variable "control_plane_internal_secret" {
  description = "Shared secret for evaluator → control plane SSO verification"
  type        = string
  default     = ""
  sensitive   = true
}

variable "website_url" {
  description = <<-EOT
    Base URL of the ARIA marketing website, injected as ARIA_WEBSITE_URL.
    Used for sign-out redirect and other links that return the user to the
    main website.  Leave empty to use the default (https://ariaeval.io in prod).
  EOT
  type        = string
  default     = ""
}
