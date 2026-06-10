variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "eu-west-2"
}

variable "auth_backend_image_tag" {
  description = "Docker image tag for the auth backend container"
  type        = string
  default     = "latest"
}

variable "auth_backend_image_uri" {
  description = "Pre-built auth backend image URI (e.g. from CI/CD). When set, skips local Docker build."
  type        = string
  default     = ""
}

variable "skip_website_build" {
  description = "Set to true when deploying via CI/CD (website is already built and synced to S3 separately)"
  type        = bool
  default     = false
}

variable "force_rebuild" {
  description = "Increment to force a Docker image rebuild and website redeploy"
  type        = number
  default     = 1
}

variable "signup_mode" {
  description = "Website signup mode: 'open' for all plans, 'waitlist' for free-only (prod)"
  type        = string
  default     = "waitlist"
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

# ── Notifications ──────────────────────────────────────────────────────────────

variable "alarm_sns_topic_arn" {
  description = "SNS topic ARN for CloudWatch alarms"
  type        = string
  default     = ""
}

# ── Control Plane ──────────────────────────────────────────────────────────────

variable "control_plane_url" {
  description = "Control plane API URL"
  type        = string
  default     = ""
}

variable "control_plane_url_ssm_param_name" {
  description = "SSM Parameter name used by auth-backend to resolve the control-plane URL at runtime."
  type        = string
  default     = "/aria/control-plane/prod/internal-url"
}

variable "tags" {
  description = "Additional tags"
  type        = map(string)
  default     = {}
}

variable "bucket_suffix" {
  description = "Unique suffix for the shared TF state bucket (from bootstrap output)"
  type        = string
  default     = ""
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
