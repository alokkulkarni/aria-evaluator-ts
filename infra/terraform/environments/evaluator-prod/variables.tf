# ── Core ──────────────────────────────────────────────────────────────────────

variable "aws_region" {
  description = "AWS region to deploy into"
  type        = string
  default     = "eu-west-2"
}

variable "force_destroy" {
  description = "Teardown switch. When true, S3 buckets are emptied on destroy and the ECR repo force-deletes so `terraform destroy` removes everything cleanly. Defaults true in dev so the stack is always trivially destroyable."
  type        = bool
  default     = true
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

# ── Redis ────────────────────────────────────────────────────────────────────────

variable "redis_node_type" {
  description = "ElastiCache node type for Redis (e.g., cache.t4g.micro, cache.t4g.small)"
  type        = string
  default     = "cache.t4g.small"
}

variable "redis_num_cache_nodes" {
  description = "Number of cache nodes (1 for dev, 2 for HA)"
  type        = number
  default     = 1
}

variable "redis_snapshot_retention_limit" {
  description = "Number of days to retain Redis snapshots"
  type        = number
  default     = 5
}

variable "alarm_sns_topic_arn" {
  description = "SNS topic ARN for CloudWatch alarm notifications (optional)"
  type        = string
  default     = ""
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

variable "enable_autoscaling" {
  description = "Enable ECS auto-scaling for the dev environment"
  type        = bool
  default     = false
}

variable "min_capacity" {
  description = "Minimum ECS task count"
  type        = number
  default     = 1
}

variable "max_capacity" {
  description = "Maximum ECS task count"
  type        = number
  default     = 3
}

variable "cpu_scale_target" {
  description = "Target CPU % for auto-scaling trigger"
  type        = number
  default     = 70
}

variable "max_runs_per_month" {
  description = "Override MAX_RUNS_PER_MONTH for this instance (empty = use tier default)"
  type        = string
  default     = ""
}

variable "max_scenarios_per_run" {
  description = "Override MAX_SCENARIOS_PER_RUN for this instance (empty = use tier default)"
  type        = string
  default     = ""
}

variable "max_models" {
  description = "Override MAX_MODELS for this instance (empty = use tier default)"
  type        = string
  default     = ""
}

variable "max_users" {
  description = "Override MAX_USERS for this instance (empty = use tier default)"
  type        = string
  default     = ""
}

# ── Multi-judge committee / calibration (Phase 1–5) ──────────────────────────
variable "judge_committee" {
  description = "JUDGE_COMMITTEE: JSON committee spec. Empty = default 3-judge cross-vendor committee."
  type        = string
  default     = ""
}
variable "judge_disagreement_threshold" {
  description = "JUDGE_DISAGREEMENT_THRESHOLD (0–10). Empty = app default (2)."
  type        = string
  default     = ""
}
variable "judge_weighting_enabled" {
  description = "JUDGE_WEIGHTING_ENABLED: 'true' to enable calibration-weighted committee scoring."
  type        = string
  default     = ""
}
variable "judge_kappa_trusted" {
  description = "JUDGE_KAPPA_TRUSTED threshold. Empty = app default (0.8)."
  type        = string
  default     = ""
}
variable "judge_kappa_min" {
  description = "JUDGE_KAPPA_MIN threshold. Empty = app default (0.6)."
  type        = string
  default     = ""
}
variable "judge_calibration_min_samples" {
  description = "JUDGE_CALIBRATION_MIN_SAMPLES before a judge is gated. Empty = app default (20)."
  type        = string
  default     = ""
}
variable "max_judges" {
  description = "Override MAX_JUDGES committee-size cap (empty = pricing-tier default)."
  type        = string
  default     = ""
}
variable "openai_base_url" {
  description = "OPENAI_BASE_URL override for OpenAI-compatible gateways (optional)."
  type        = string
  default     = ""
}
variable "azure_openai_endpoint" {
  description = "AZURE_OPENAI_ENDPOINT for the Azure OpenAI judge provider (optional)."
  type        = string
  default     = ""
}
variable "azure_openai_api_version" {
  description = "AZURE_OPENAI_API_VERSION (optional; app default 2024-10-21)."
  type        = string
  default     = ""
}

# Cross-vendor judge provider API keys — Secrets Manager ARNs (values never in TF state).
variable "openai_api_key_secret_arn" {
  description = "Secrets Manager ARN holding the OpenAI API key (injected as OPENAI_API_KEY)."
  type        = string
  default     = ""
}
variable "azure_openai_api_key_secret_arn" {
  description = "Secrets Manager ARN holding the Azure OpenAI API key (injected as AZURE_OPENAI_API_KEY)."
  type        = string
  default     = ""
}
variable "anthropic_api_key_secret_arn" {
  description = "Secrets Manager ARN holding the Anthropic API key (injected as ANTHROPIC_API_KEY)."
  type        = string
  default     = ""
}
variable "gemini_api_key_secret_arn" {
  description = "Secrets Manager ARN holding the Google Gemini API key (injected as GEMINI_API_KEY)."
  type        = string
  default     = ""
}

# ── Prod-specific tuning ────────────────────────────────────────────────────────

variable "aurora_min_acu" {
  description = "Aurora Serverless v2 minimum capacity (ACUs)."
  type        = number
  default     = 0.5
}

variable "aurora_max_acu" {
  description = "Aurora Serverless v2 maximum capacity (ACUs)."
  type        = number
  default     = 8
}

# NOTE: The CloudFront WAF web ACL is now created in-stack by `module.waf`
# (us-east-1) and wired straight into `module.cloudfront`, so there is no
# `waf_web_acl_arn` override variable here — prod always gets WAF.

variable "cloudtrail_alert_sns_topic_arn" {
  description = "Optional SNS topic ARN for CloudTrail CIS alarm notifications. Empty disables alarms."
  type        = string
  default     = ""
}
