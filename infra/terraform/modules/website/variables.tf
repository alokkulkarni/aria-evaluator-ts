variable "app_name" {
  description = "Application name used as a prefix for all resource names"
  type        = string
  default     = "aria"
}

variable "environment" {
  description = "Deployment environment (dev, prod)"
  type        = string

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment must be dev, staging, or prod."
  }
}

variable "aws_region" {
  description = "AWS region for all resources (except ACM cert which is always us-east-1)"
  type        = string
  default     = "eu-west-2"
}

# ── Networking ─────────────────────────────────────────────────────────────────

variable "vpc_cidr" {
  description = "CIDR block for the website VPC"
  type        = string
  default     = "10.50.0.0/16"
}

variable "public_subnet_cidrs" {
  description = "CIDR blocks for public subnets (one per AZ)"
  type        = list(string)
  default     = ["10.50.1.0/24", "10.50.2.0/24"]
}

variable "availability_zones" {
  description = "Availability zones to use (must match public_subnet_cidrs length)"
  type        = list(string)
  default     = ["eu-west-2a", "eu-west-2b"]
}

# ── ECS / Container ─────────────────────────────────────────────────────────────

variable "container_image" {
  description = "Full URI of the Next.js container image to deploy"
  type        = string
}

variable "container_port" {
  description = "Port the Next.js container listens on"
  type        = number
  default     = 3000
}

variable "cpu" {
  description = "ECS task CPU units (256=0.25vCPU, 512=0.5vCPU, 1024=1vCPU)"
  type        = number
  default     = 512
}

variable "memory" {
  description = "ECS task memory in MB"
  type        = number
  default     = 1024
}

variable "desired_count" {
  description = "Desired number of ECS task instances"
  type        = number
  default     = 2
}

variable "min_capacity" {
  description = "Minimum number of ECS tasks (auto-scaling)"
  type        = number
  default     = 1
}

variable "max_capacity" {
  description = "Maximum number of ECS tasks (auto-scaling)"
  type        = number
  default     = 10
}

# ── Auth & Secrets ─────────────────────────────────────────────────────────────

variable "nextauth_secret" {
  description = "32-character secret for NextAuth.js JWT signing"
  type        = string
  sensitive   = true
}

variable "google_client_id" {
  description = "Google OAuth 2.0 Client ID"
  type        = string
  default     = ""
  sensitive   = true
}

variable "google_client_secret" {
  description = "Google OAuth 2.0 Client Secret"
  type        = string
  default     = ""
  sensitive   = true
}

variable "github_client_id" {
  description = "GitHub OAuth App Client ID"
  type        = string
  default     = ""
  sensitive   = true
}

variable "github_client_secret" {
  description = "GitHub OAuth App Client Secret"
  type        = string
  default     = ""
  sensitive   = true
}

# ── Domain & TLS ────────────────────────────────────────────────────────────────

variable "domain_name" {
  description = "Primary domain for the website (e.g. ariaeval.io)"
  type        = string
  default     = ""
}

variable "route53_zone_id" {
  description = "Route53 hosted zone ID for the domain. Leave empty to skip DNS management."
  type        = string
  default     = ""
}

variable "acm_certificate_arn_us_east_1" {
  description = "ACM certificate ARN in us-east-1 for the CloudFront distribution custom domain. Leave empty to use default CloudFront cert."
  type        = string
  default     = ""
}

variable "acm_certificate_arn_regional" {
  description = "ACM certificate ARN in the deployment region for the ALB HTTPS listener. Leave empty to use HTTP only for ALB."
  type        = string
  default     = ""
}

# ── CloudFront ─────────────────────────────────────────────────────────────────

variable "price_class" {
  description = "CloudFront price class"
  type        = string
  default     = "PriceClass_100"

  validation {
    condition     = contains(["PriceClass_100", "PriceClass_200", "PriceClass_All"], var.price_class)
    error_message = "Must be PriceClass_100, PriceClass_200, or PriceClass_All."
  }
}

# ── Control Plane ──────────────────────────────────────────────────────────────

variable "control_plane_url" {
  description = "URL of the control plane API (Phase 1). Leave empty until Phase 1 is built."
  type        = string
  default     = ""
}

# ── Logging ────────────────────────────────────────────────────────────────────

variable "log_retention_days" {
  description = "CloudWatch log retention in days"
  type        = number
  default     = 30
}

variable "log_bucket_suffix" {
  description = "Unique suffix for the ALB access log S3 bucket (e.g. account ID last 6 digits)"
  type        = string
  default     = ""
}

# ── Alarms & Notifications ─────────────────────────────────────────────────────

variable "alarm_sns_topic_arn" {
  description = "SNS topic ARN to receive CloudWatch alarm notifications. Leave empty to skip."
  type        = string
  default     = ""
}

# ── Tags ────────────────────────────────────────────────────────────────────────

variable "tags" {
  description = "Additional tags to apply to all resources"
  type        = map(string)
  default     = {}
}
