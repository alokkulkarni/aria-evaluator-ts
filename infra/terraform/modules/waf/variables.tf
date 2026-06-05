variable "app_name" {
  description = "Application name used for naming and tagging"
  type        = string
}

variable "environment" {
  description = "Deployment environment"
  type        = string
}

variable "tenant_id" {
  description = "Tenant identifier for the WebACL"
  type        = string
}

variable "pricing_tier" {
  description = "Tenant pricing tier"
  type        = string
}

variable "rate_limit_requests" {
  description = "Maximum requests per 5-minute window per IP before the rate rule blocks traffic"
  type        = number
  default     = 1000
}

variable "log_retention_days" {
  description = "Retention period in days for WAF logs"
  type        = number
}

variable "tags" {
  description = "Additional tags applied to WAF resources"
  type        = map(string)
  default     = {}
}
