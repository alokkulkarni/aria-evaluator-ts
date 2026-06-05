variable "app_name" {
  description = "Application name used as a prefix for resource names"
  type        = string
}

variable "environment" {
  description = "Deployment environment"
  type        = string
}

variable "alb_dns_name" {
  description = "DNS name of the ALB used as the CloudFront origin"
  type        = string
}

variable "price_class" {
  description = "CloudFront price class (PriceClass_100 = US/EU only, cheapest)"
  type        = string
  default     = "PriceClass_100"

  validation {
    condition     = contains(["PriceClass_100", "PriceClass_200", "PriceClass_All"], var.price_class)
    error_message = "Must be PriceClass_100, PriceClass_200, or PriceClass_All."
  }
}

variable "default_root_object" {
  description = "Default root object served by CloudFront"
  type        = string
  default     = "index.html"
}

variable "static_cache_default_ttl" {
  description = "Default TTL in seconds for static asset caching"
  type        = number
  default     = 300
}

variable "static_cache_max_ttl" {
  description = "Maximum TTL in seconds for static asset caching"
  type        = number
  default     = 86400
}

variable "acm_certificate_arn" {
  description = "ACM certificate ARN for HTTPS (must be in us-east-1). Leave empty to use the default CloudFront certificate."
  type        = string
  default     = ""
}

variable "aliases" {
  description = "Custom domain aliases for the CloudFront distribution (requires acm_certificate_arn)"
  type        = list(string)
  default     = []
}

variable "cloudfront_origin_secret" {
  description = "Shared origin secret forwarded to the ALB in the X-CF-Origin-Secret header"
  type        = string
  default     = ""
  sensitive   = true
}

variable "waf_web_acl_arn" {
  description = "Optional WAF Web ACL ARN attached to the distribution"
  type        = string
  default     = ""
}

variable "tenant_id" {
  description = "Tenant identifier used for naming and tagging"
  type        = string
  default     = ""
}

variable "pricing_tier" {
  description = "Pricing tier used for tagging"
  type        = string
  default     = ""
}

variable "tags" {
  description = "Additional tags to apply to all resources"
  type        = map(string)
  default     = {}
}
