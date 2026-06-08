# ── Required ──────────────────────────────────────────────────────────────────

variable "app_name" {
  type    = string
  default = "aria"
}

variable "environment" {
  type = string
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

# ── Auth Backend (ALB origin) ─────────────────────────────────────────────────

variable "auth_backend_alb_dns" {
  type        = string
  default     = ""
  description = "DNS name of the auth backend ALB. When empty, /api/* routes are not proxied."
}

variable "auth_backend_alb_https" {
  type        = bool
  default     = false
  description = "Whether the auth backend ALB uses HTTPS."
}

variable "auth_backend_origin_secret" {
  type        = string
  default     = ""
  sensitive   = true
  description = "Shared secret for X-CF-Origin-Secret header to prevent direct ALB access."
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
