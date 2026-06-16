# modules/tenant-service — per-tenant compute attached to the shared platform stack.
# One ECS service + target group + ALB host-header rule + autoscaling per tenant.
# See docs/MULTI_TENANT_SPEC.md (Phase 5).

variable "app_name" {
  description = "Application name prefix (e.g. aria-evaluator)."
  type        = string
  default     = "aria-evaluator"
}

variable "environment" {
  description = "Deployment environment label (dev/staging/prod)."
  type        = string
}

variable "aws_region" {
  description = "AWS region (for the awslogs driver)."
  type        = string
}

variable "tenant_id" {
  description = "Unique tenant identifier — also the subdomain label and S3 state prefix."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$", var.tenant_id))
    error_message = "tenant_id must be DNS-label-safe: lowercase alphanumerics and dashes, 3-40 chars."
  }
}

variable "host" {
  description = "Fully-qualified host that routes to this tenant (e.g. acme.aria-evaluator.app)."
  type        = string
}

variable "pricing_tier" {
  description = "Pricing tier label (informational; sizing is set via cpu/memory)."
  type        = string
  default     = ""
}

# ── Image ──────────────────────────────────────────────────────────────────────
variable "app_image_uri" {
  description = "ECR image URI for the evaluator app."
  type        = string
}

variable "container_port" {
  description = "Container port the app listens on."
  type        = number
  default     = 3001
}

# ── Shared platform wiring (from module.platform outputs) ──────────────────────
variable "cluster_arn" {
  description = "ARN of the shared ECS cluster."
  type        = string
}

variable "cluster_name" {
  description = "Name of the shared ECS cluster (for the autoscaling resource id)."
  type        = string
}

variable "vpc_id" {
  description = "Shared VPC id (for the target group)."
  type        = string
}

variable "private_subnet_ids" {
  description = "Private subnet ids the Fargate task runs in."
  type        = list(string)
}

variable "tenant_ecs_sg_id" {
  description = "Shared security group for tenant ECS tasks."
  type        = string
}

variable "alb_https_listener_arn" {
  description = "ARN of the shared ALB HTTPS listener to attach a host-header rule to."
  type        = string
}

variable "listener_rule_priority" {
  description = "Unique priority for this tenant's listener rule (1-50000)."
  type        = number
}

variable "database_url_secret_arn" {
  description = "Secrets Manager ARN holding the shared Aurora DATABASE_URL connection string."
  type        = string
}

variable "execution_role_arn" {
  description = "ECS task execution role ARN (must be able to read the DATABASE_URL secret)."
  type        = string
}

variable "task_role_arn" {
  description = "ECS task role ARN (application permissions)."
  type        = string
}

variable "state_bucket_name" {
  description = "Shared S3 state bucket name (scenarios seed prefix)."
  type        = string
}

variable "redis_host" {
  description = "Shared Redis endpoint host."
  type        = string
  default     = ""
}

variable "redis_port" {
  description = "Shared Redis port."
  type        = number
  default     = 6379
}

variable "control_plane_internal_url" {
  description = "Internal control-plane URL for SSO verification."
  type        = string
  default     = ""
}

variable "website_url" {
  description = "Marketing website URL (ARIA_WEBSITE_URL)."
  type        = string
  default     = ""
}

# ── Sizing & scaling ───────────────────────────────────────────────────────────
variable "cpu" {
  description = "Fargate task CPU units."
  type        = number
  default     = 512
}

variable "memory" {
  description = "Fargate task memory (MiB)."
  type        = number
  default     = 1024
}

variable "desired_count" {
  description = "Initial desired task count. 0 = start suspended (scale-to-zero; control-plane wakes on login)."
  type        = number
  default     = 0
}

variable "min_capacity" {
  description = "Autoscaling minimum tasks. 0 enables scale-to-zero for idle tenants."
  type        = number
  default     = 0
}

variable "max_capacity" {
  description = "Autoscaling maximum tasks (tier cap)."
  type        = number
  default     = 2
}

variable "cpu_scale_target" {
  description = "Target average CPU utilization (%) for target-tracking autoscaling."
  type        = number
  default     = 70
}

variable "log_retention_days" {
  description = "CloudWatch log retention for this tenant."
  type        = number
  default     = 14
}

variable "extra_environment_vars" {
  description = "Additional plaintext environment variables."
  type        = list(object({ name = string, value = string }))
  default     = []
}

variable "extra_secrets" {
  description = "Additional secrets injected as valueFrom (Secrets Manager / SSM ARNs)."
  type        = list(object({ name = string, valueFrom = string }))
  default     = []
}

variable "tags" {
  description = "Tags applied to all resources."
  type        = map(string)
  default     = {}
}
