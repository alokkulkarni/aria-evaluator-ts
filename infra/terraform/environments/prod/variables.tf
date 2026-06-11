variable "app_name" {
  description = "Application name used for naming and tagging"
  type        = string
  default     = "aria-evaluator"
}

variable "environment" {
  description = "Deployment environment"
  type        = string
  default     = "prod"
}

variable "tenant_id" {
  description = "Unique tenant identifier"
  type        = string
}

variable "pricing_tier" {
  description = "Tenant pricing tier"
  type        = string

  validation {
    condition = contains([
      "free",
      "individual",
      "enterprise_starter",
      "enterprise_pro",
      "enterprise_unlimited",
    ], var.pricing_tier)
    error_message = "pricing_tier must be one of free, individual, enterprise_starter, enterprise_pro, or enterprise_unlimited."
  }
}

variable "pricing_track" {
  description = "Pricing track used for tagging"
  type        = string

  validation {
    condition     = contains(["individual", "enterprise"], var.pricing_track)
    error_message = "pricing_track must be individual or enterprise."
  }
}

variable "aws_region" {
  description = "AWS region where tenant resources are deployed"
  type        = string
  default     = "eu-west-2"
}

variable "ecr_repository_url" {
  description = "ECR repository URL from bootstrap (e.g. 123456789.dkr.ecr.eu-west-2.amazonaws.com/aria-evaluator)"
  type        = string
}

variable "image_tag" {
  description = "Docker image tag to build and push for the tenant evaluator app. Leave as \"latest\" to auto-derive an immutable-safe tf-* tag."
  type        = string
  default     = "latest"
}

variable "image_uri" {
  description = "Pre-built image URI (e.g. from CI/CD). When set, skips local Docker build."
  type        = string
  default     = ""
}

variable "force_rebuild" {
  description = "Increment to force a Docker image rebuild even when Dockerfile hasn't changed"
  type        = number
  default     = 1
}

variable "acm_certificate_arn" {
  description = "Regional ACM certificate ARN used by the tenant ALB"
  type        = string
  default     = ""
}

variable "cloudfront_acm_certificate_arn" {
  description = "ACM certificate ARN in us-east-1 used by CloudFront"
  type        = string
  default     = ""
}

variable "vpc_cidr" {
  description = "CIDR block allocated to the tenant VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "public_subnet_cidrs" {
  description = "Public subnet CIDRs for the tenant"
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24"]
}

variable "private_subnet_cidrs" {
  description = "Private subnet CIDRs for the tenant"
  type        = list(string)
  default     = ["10.0.3.0/24", "10.0.4.0/24"]
}

variable "bucket_suffix" {
  description = "Suffix used to make S3 bucket names globally unique"
  type        = string
}

variable "heartbeat_table_arn" {
  description = "ARN of the shared heartbeat DynamoDB table"
  type        = string
}

variable "heartbeat_table_name" {
  description = "Name of the shared heartbeat DynamoDB table"
  type        = string
}

variable "kms_key_arn" {
  description = "KMS key ARN used for secrets, SNS, and EFS encryption"
  type        = string
}

variable "god_mode_enabled" {
  description = "Whether god mode should be enabled for this tenant"
  type        = bool
  default     = false
}

variable "god_mode_secret_arn" {
  description = "Secrets Manager ARN containing the god mode token"
  type        = string
  default     = ""
  sensitive   = true
}

variable "alert_email" {
  description = "Tenant alert email recipient"
  type        = string
  default     = ""
}

variable "control_plane_role_arn" {
  description = "IAM role ARN allowed to invoke the resume Lambda"
  type        = string
  default     = ""
}

variable "suspend_threshold_hours_override" {
  description = "Override for the default suspend threshold; 0 uses the tier default"
  type        = number
  default     = 0
}

variable "connect_instance_id" {
  description = "Amazon Connect instance ID used for IAM scoping"
  type        = string
  default     = "*"
}

variable "cloudfront_enabled" {
  description = "Whether CloudFront should be provisioned for the tenant"
  type        = bool
  default     = true
}

variable "waf_enabled" {
  description = "Whether the CloudFront Web ACL should be provisioned"
  type        = bool
  default     = true
}

variable "s3_force_destroy" {
  description = "Allow destroy to purge non-empty tenant S3 buckets (needed for apply/destroy validation cycles)."
  type        = bool
  default     = true
}

variable "alb_enable_deletion_protection" {
  description = "Whether ALB deletion protection is enabled. Keep false for apply/destroy validation cycles."
  type        = bool
  default     = false
}

variable "cloudtrail_enabled" {
  description = "Whether to provision a dedicated per-tenant CloudTrail trail in this stack. Disabled by default because account trail quotas are shared."
  type        = bool
  default     = false
}

variable "log_retention_days_override" {
  description = "Override for the default log retention; 0 uses the tier default"
  type        = number
  default     = 0
}

variable "tags" {
  description = "Additional tags applied to all tenant resources"
  type        = map(string)
  default     = {}
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

# ── Redis (High Availability) ────────────────────────────────────────────────────

variable "redis_node_type" {
  description = "ElastiCache node type for Redis (cache.m6g.large recommended for prod)"
  type        = string
  default     = "cache.m6g.large"
}

variable "redis_num_cache_nodes" {
  description = "Number of cache nodes (2 for Multi-AZ HA)"
  type        = number
  default     = 2
}

variable "redis_automatic_failover_enabled" {
  description = "Enable automatic failover for Multi-AZ"
  type        = bool
  default     = true
}

variable "redis_transit_encryption_enabled" {
  description = "Enable encryption in transit (recommended for prod)"
  type        = bool
  default     = true
}

variable "redis_snapshot_retention_limit" {
  description = "Number of days to retain Redis snapshots (30 recommended for prod)"
  type        = number
  default     = 30
}

variable "alarm_sns_topic_arn" {
  description = "SNS topic ARN for CloudWatch alarm notifications (required for prod)"
  type        = string
}

variable "website_url" {
  description = <<-EOT
    Base URL of the ARIA marketing website, injected as ARIA_WEBSITE_URL.
    Used for sign-out redirect and other links that return the user to the
    main website.  Defaults to https://ariaeval.io for production.
  EOT
  type        = string
  default     = "https://ariaeval.io"
}

variable "enable_autoscaling" {
  description = "Enable ECS auto-scaling"
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
