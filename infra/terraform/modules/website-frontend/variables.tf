# ── Required ──────────────────────────────────────────────────────────────────

variable "app_name" {
  type    = string
  default = "aria"
}

variable "environment" {
  type = string
}

variable "force_destroy" {
  type        = bool
  default     = false
  description = "Allow Terraform to empty and destroy the versioned static-site bucket. Keep false in prod; set true for teardown."
}

# ── Domain & TLS ──────────────────────────────────────────────────────────────

variable "domain_name" {
  type        = string
  default     = ""
  description = "Custom domain name (e.g. ariaeval.io). Empty = use CloudFront URL."
}

variable "route53_zone_id" {
  type        = string
  default     = ""
  description = "Route53 hosted zone ID for the custom domain."
}

variable "acm_certificate_arn_cloudfront" {
  type        = string
  default     = ""
  description = "ACM cert ARN in us-east-1 for CloudFront."
}

# ── WAF ───────────────────────────────────────────────────────────────────────

variable "waf_rate_limit" {
  type        = number
  default     = 2000
  description = "Rate limit (requests per 5 min) per IP."
}

# ── Tags ──────────────────────────────────────────────────────────────────────

variable "tags" {
  type    = map(string)
  default = {}
}
