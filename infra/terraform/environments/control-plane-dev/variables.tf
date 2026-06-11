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
  default = "dev"
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
  default = "10.52.0.0/16"
}

variable "public_subnet_cidrs" {
  type    = list(string)
  default = ["10.52.1.0/24", "10.52.2.0/24"]
}

variable "private_subnet_cidrs" {
  type    = list(string)
  default = ["10.52.3.0/24", "10.52.4.0/24"]
}

variable "control_plane_image_uri" {
  type = string
}

variable "container_port" {
  type    = number
  default = 3002
}

variable "cpu" {
  type    = number
  default = 256
}

variable "memory" {
  type    = number
  default = 512
}

variable "desired_count" {
  type    = number
  default = 1
}

variable "log_retention_days" {
  type    = number
  default = 14
}

variable "kms_key_arn" {
  type = string
}

variable "s3_state_prefix" {
  type    = string
  default = "aria-control-plane"
}

variable "cloudtrail_alert_sns_topic_arn" {
  description = "SNS topic ARN for CloudTrail CIS security alarms. Leave empty to skip alarm creation."
  type        = string
  default     = ""
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

variable "allowed_origins" {
  description = "CORS allowed origins for the control-plane API (comma-separated when passed as env var)"
  type        = list(string)
  default     = ["http://localhost:3000", "http://localhost:3001"]
}

variable "instance_base_url" {
  description = "Base URL used by the control plane to generate tenant instance links (e.g. the dev website CloudFront URL)"
  type        = string
  default     = ""
}

# ── Provisioning infrastructure (optional in dev) ─────────────────────────────

variable "alert_email" {
  description = "Email address for provisioning failure notifications. Leave empty to skip notification infrastructure."
  type        = string
  default     = "kulkarni.alok@gmail.com"
}

variable "terraform_state_bucket" {
  description = "S3 bucket used by CodeBuild for per-tenant Terraform remote state. Required when codebuild_project_name is set."
  type        = string
  default     = ""
}

variable "terraform_state_kms_key_arn" {
  description = "KMS key ARN for encrypting Terraform state. Required when codebuild_project_name is set."
  type        = string
  default     = ""
}

variable "terraform_state_lock_table" {
  description = "DynamoDB table name for Terraform state locking."
  type        = string
  default     = "aria-evaluator-tf-locks-dev"
}

variable "github_repo_url" {
  description = "GitHub repository URL for CodeBuild to clone."
  type        = string
  default     = "https://github.com/alokkulkarni/aria-evaluator-ts.git"
}

variable "github_branch" {
  description = "GitHub branch for CodeBuild to clone."
  type        = string
  default     = "main"
}

variable "ecr_repository_url" {
  description = "ECR repository URL for the evaluator image. Required when codebuild_project_name is set."
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
