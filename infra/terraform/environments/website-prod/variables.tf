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

variable "skip_website_build" {
  description = "Set to true when deploying via CI/CD (website is already built and synced to S3 separately)"
  type        = bool
  default     = false
}

variable "force_rebuild" {
  description = "Increment to force a website redeploy"
  type        = number
  default     = 1
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

variable "google_dkim_txt" {
  description = "Full DKIM public key value for the google._domainkey TXT record (Google Workspace). Created out-of-band; adopted via `terraform import`. Rotate via Google Admin → Apps → Gmail → Authenticate email, then update this value and re-apply."
  type        = string
  default     = "v=DKIM1;k=rsa;p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAvRo5h7niw5r6LXsiKv0cCRaxWKRSYyInPV1la76Egwk02xaRNX6vo712/IxaAR0A8CamXBsQ4imxgqvk6u0egPAgo8Rx1exjZwvr8IfnKoCBINJgh7U3LD+inFFebk/pU1Sf2iTL2h6jZrHH/Vs6Q6AoOmB/O2UGd1dUy9p/uPxn8Jz89O1k4f9faULyMdYbSzuBAoD2J86EhCh18/rhuzd8TWVMv4YMwKQveiglS8JkxDtGL0o5GXcW5SCPCsetcWQNTW+nzQi0FDo8MLX3BH8dqUh+5QGuHzwBwvNRhWygEqo50jPJ/WmYE77d8VJKva2vJAnzBq75PcNO76+tMQIDAQAB"
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
