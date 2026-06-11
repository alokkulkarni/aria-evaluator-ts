variable "aws_region" {
  description = "AWS region to deploy into"
  type        = string
  default     = "eu-west-2"
}

variable "app_name" {
  type    = string
  default = "aria-control-plane"
}

variable "environment" {
  type    = string
  default = "prod"
}

variable "tenant_id" {
  type    = string
  default = "control-plane"
}

variable "pricing_tier" {
  type    = string
  default = "platform"
}

variable "bucket_suffix" {
  type = string
}

variable "vpc_cidr" {
  type    = string
  default = "10.62.0.0/16"
}

variable "public_subnet_cidrs" {
  type    = list(string)
  default = ["10.62.1.0/24", "10.62.2.0/24"]
}

variable "private_subnet_cidrs" {
  type    = list(string)
  default = ["10.62.3.0/24", "10.62.4.0/24"]
}

variable "ecr_repository_url" {
  description = "ECR repository URL from bootstrap (e.g. 123456789.dkr.ecr.eu-west-2.amazonaws.com/aria-evaluator)"
  type        = string
}

variable "image_tag" {
  description = "Docker image tag to build and push"
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

variable "container_port" {
  type    = number
  default = 3002
}

variable "cpu" {
  type    = number
  default = 512
}

variable "memory" {
  type    = number
  default = 1024
}

variable "desired_count" {
  type    = number
  default = 2
}

variable "log_retention_days" {
  type    = number
  default = 30
}

variable "kms_key_arn" {
  type = string
}

variable "cloudtrail_kms_key_arn" {
  description = "Optional dedicated KMS key ARN for CloudTrail. Leave empty to use SSE-S3 for CloudTrail logs."
  type        = string
  default     = ""
}

variable "s3_state_prefix" {
  type    = string
  default = "aria-control-plane"
}

variable "cloudtrail_alert_sns_topic_arn" {
  description = "SNS topic ARN for CloudTrail CIS security alarms. Required in prod — set to your existing alerts topic or a dedicated security topic."
  type        = string
  default     = ""
}

# ── Provisioning infrastructure variables ──────────────────────────────────────

variable "terraform_state_bucket" {
  description = "S3 bucket for Terraform remote state (used by CodeBuild for per-user infrastructure)"
  type        = string
}

variable "terraform_state_kms_key_arn" {
  description = "KMS key ARN for encrypting Terraform state bucket"
  type        = string
}

variable "terraform_state_lock_table" {
  description = "DynamoDB table for Terraform state locking"
  type        = string
  default     = "aria-evaluator-tf-locks"
}

variable "github_repo_url" {
  description = "GitHub repository URL for evaluator-app-prod Terraform code"
  type        = string
  default     = "https://github.com/alokkulkarni/aria-evaluator-ts.git"
}

variable "github_branch" {
  description = "GitHub branch for CodeBuild to clone"
  type        = string
  default     = "main"
}

variable "allowed_origins" {
  description = "CORS allowed origins for the control-plane API"
  type        = list(string)
  default     = ["http://localhost:3000", "https://ariaeval.io"]
}

variable "instance_base_url" {
  description = "Base URL used by the control plane to generate tenant instance links"
  type        = string
  default     = "https://ariaeval.io"
}

# ── Security & Authentication Variables ────────────────────────────────────────

variable "cognito_user_pool_id" {
  description = "Cognito User Pool ID for JWT validation (required for production)"
  type        = string
  default     = ""
}

variable "jwt_audience" {
  description = "JWT audience claim value for token validation"
  type        = string
  default     = "aria-evaluator-api"
}

# ── Cost Guardrail Variables ───────────────────────────────────────────────────

variable "max_instances_per_user" {
  description = "Maximum number of active evaluator instances per user"
  type        = number
  default     = 2
}

variable "max_monthly_spend_per_user" {
  description = "Maximum monthly spend per user in USD"
  type        = number
  default     = 1000
}

variable "cost_per_instance_hour" {
  description = "Estimated hourly cost per evaluator instance in USD"
  type        = number
  default     = 0.50
}

# ── Alerting ───────────────────────────────────────────────────────────────────

variable "alert_email" {
  description = "Email address for provisioning alerts and CodeBuild failure notifications"
  type        = string
  default     = "kulkarni.alok@gmail.com"
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

variable "codebuild_project_name" {
  description = "CodeBuild project name for tenant provisioning. Leave empty to skip CodeBuild (local/dev)."
  type        = string
  default     = ""
}

# control_plane_internal_url is now auto-derived from module.alb.alb_dns_name via aws_ssm_parameter

variable "control_plane_internal_secret" {
  description = "Optional: provide a specific secret value. Leave empty to auto-generate via random_password."
  type        = string
  default     = ""
  sensitive   = true
}
