variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "eu-west-2"
}

variable "terraform_state_bucket" {
  description = "S3 bucket holding Terraform remote state. This stack's outputs are consumed by the connectivity-prod stack (VPC peering) via remote state."
  type        = string
  default     = "aria-evaluator-tf-state-194296"
}

variable "force_destroy" {
  description = "Teardown switch. When true, S3 buckets (static site, ALB logs, CloudTrail) are emptied on destroy and the ECR repo force-deletes, so `terraform destroy` removes everything cleanly. Keep false for normal prod operation."
  type        = bool
  default     = false
}

variable "auth_origin_domain" {
  description = "Custom hostname for the auth-backend ALB's HTTPS origin (regional ACM cert + Route 53 A-alias). CloudFront uses this as its /api/* origin over https-only, giving end-to-end TLS. Must be in the route53_zone_id zone."
  type        = string
  default     = "origin.ariaeval.io"
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

variable "enable_cognito" {
  description = "Enable Cognito as the OAuth broker for Google/Apple social sign-in."
  type        = bool
  default     = true
}

# ── Cognito Google identity provider ──────────────────────────────────────────
# These are needed at terraform apply time to configure aws_cognito_identity_provider.
# They end up in Terraform state as Cognito resource attributes — this is unavoidable
# for Cognito. They do NOT flow into the auth-backend Secrets Manager secret;
# NextAuth.js runtime credentials (GOOGLE_CLIENT_ID etc.) are populated separately
# by: infra/scripts/bootstrap-oauth-secrets.sh prod
variable "google_client_id" {
  description = "Google OAuth Client ID — used only for Cognito identity provider configuration."
  type        = string
  sensitive   = true
  default     = ""
}

variable "google_client_secret" {
  description = "Google OAuth Client Secret — used only for Cognito identity provider configuration."
  type        = string
  sensitive   = true
  default     = ""
}

variable "apple_client_id" {
  description = "Apple Services ID for Cognito Sign in with Apple."
  type        = string
  default     = ""
}

variable "apple_team_id" {
  description = "Apple developer team id."
  type        = string
  default     = ""
}

variable "apple_key_id" {
  description = "Apple Sign in with Apple key id."
  type        = string
  default     = ""
}

variable "apple_private_key" {
  description = "Apple Sign in with Apple private key PEM."
  type        = string
  sensitive   = true
  default     = ""
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

# ── SEO / Analytics ───────────────────────────────────────────────────────────
# Google Search Console domain verification + GA4 measurement. The verification
# token is public (it lives in DNS) so it's a plain default; GA4 only emits when
# the measurement id is set.

variable "google_site_verification_txt" {
  description = "Google Search Console domain-verification token (value of the apex google-site-verification TXT record). The TXT record was created out-of-band and is adopted via `terraform import`."
  type        = string
  default     = "nb9sd5DDMyx3ZnSxSXTZ0Z-5eZag-WaFPL9tbxFG6l8"
}

variable "ga4_measurement_id" {
  description = "GA4 Measurement ID injected into the static site at build time as NEXT_PUBLIC_GA4_MEASUREMENT_ID. Public value (embedded in page HTML). Empty disables analytics. Collection is gated by Consent Mode v2 until the user opts in via the cookie banner."
  type        = string
  default     = "G-3MJ8PK2F6Y"
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
