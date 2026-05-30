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
  default     = "prod"
}

variable "bucket_suffix" {
  description = "Short unique suffix appended to the S3 bucket name to ensure global uniqueness"
  type        = string
}

# ── Networking ────────────────────────────────────────────────────────────────

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.43.0.0/16"
}

variable "public_subnet_cidrs" {
  description = "CIDR blocks for public subnets (one per AZ)"
  type        = list(string)
  default     = ["10.43.1.0/24", "10.43.2.0/24"]
}

# ── ECS ───────────────────────────────────────────────────────────────────────

variable "app_image_uri" {
  description = "Full ECR image URI including tag"
  type        = string
}

variable "container_port" {
  description = "Port the container listens on"
  type        = number
  default     = 3001
}

variable "cpu" {
  description = "Fargate task CPU units"
  type        = number
  default     = 512
}

variable "memory" {
  description = "Fargate task memory in MiB"
  type        = number
  default     = 1024
}

variable "desired_count" {
  description = "Number of ECS tasks to run"
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
  default     = 30
}

# ── Amazon Connect ────────────────────────────────────────────────────────────

variable "connect_instance_id" {
  description = "Amazon Connect instance ID for IAM scoping"
  type        = string
}

# ── CloudFront ────────────────────────────────────────────────────────────────

variable "cloudfront_price_class" {
  description = "CloudFront price class"
  type        = string
  default     = "PriceClass_100"
}

variable "acm_certificate_arn" {
  description = "ACM certificate ARN (us-east-1) for custom domain"
  type        = string
  default     = ""
}

variable "cloudfront_aliases" {
  description = "Custom domain aliases for CloudFront"
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
