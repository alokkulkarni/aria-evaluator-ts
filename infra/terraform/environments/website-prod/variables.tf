variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "eu-west-2"
}

variable "public_subnet_cidrs" {
  description = "CIDRs for 3 public subnets across AZs"
  type        = list(string)
  default     = ["10.60.1.0/24", "10.60.2.0/24", "10.60.3.0/24"]
}

variable "container_image" {
  description = "Full URI of the production Next.js container image"
  type        = string
}

# ── Auth Secrets (supply via CI/CD pipeline env vars, never commit) ────────────

variable "nextauth_secret" {
  description = "NextAuth.js signing secret (32+ chars)"
  type        = string
  sensitive   = true
}

variable "google_client_id" {
  type      = string
  sensitive = true
}

variable "google_client_secret" {
  type      = string
  sensitive = true
}

variable "github_client_id" {
  type      = string
  sensitive = true
}

variable "github_client_secret" {
  type      = string
  sensitive = true
}

# ── Domain & TLS ────────────────────────────────────────────────────────────────

variable "domain_name" {
  description = "Production domain (e.g. ariaeval.io)"
  type        = string
  default     = "ariaeval.io"
}

variable "route53_zone_id" {
  description = "Route53 hosted zone ID for the domain"
  type        = string
  default     = ""
}

variable "acm_certificate_arn_us_east_1" {
  description = "ACM certificate ARN in us-east-1 (for CloudFront)"
  type        = string
  default     = ""
}

variable "acm_certificate_arn_regional" {
  description = "ACM certificate ARN in the deployment region (for ALB)"
  type        = string
  default     = ""
}

# ── Notifications ──────────────────────────────────────────────────────────────

variable "alarm_sns_topic_arn" {
  description = "SNS topic ARN for CloudWatch alarms"
  type        = string
  default     = ""
}

# ── Control Plane ──────────────────────────────────────────────────────────────

variable "control_plane_url" {
  description = "Control plane API URL (Phase 1)"
  type        = string
  default     = ""
}

variable "tags" {
  description = "Additional tags"
  type        = map(string)
  default     = {}
}

variable "cloudtrail_bucket_suffix" {
  description = "Short unique suffix for the CloudTrail S3 bucket (e.g. last 6 digits of account ID)"
  type        = string
  default     = "prod"
}

variable "cloudtrail_kms_key_arn" {
  description = "KMS key ARN for encrypting CloudTrail logs at rest. Leave empty to use AES256."
  type        = string
  default     = ""
}
