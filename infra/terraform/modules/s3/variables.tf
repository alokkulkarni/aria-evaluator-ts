variable "app_name" {
  description = "Application name used as a prefix for the bucket name"
  type        = string
}

variable "environment" {
  description = "Deployment environment"
  type        = string
}

variable "bucket_suffix" {
  description = "Optional suffix appended to the bucket name to ensure global uniqueness"
  type        = string
  default     = ""
}

variable "force_destroy" {
  description = "Allow Terraform to destroy the bucket even if it contains objects"
  type        = bool
  default     = false
}

variable "versioning_enabled" {
  description = "Enable S3 object versioning"
  type        = bool
  default     = false
}

variable "lifecycle_abort_incomplete_days" {
  description = "Days after which incomplete multipart uploads are aborted"
  type        = number
  default     = 7
}

variable "tenant_id" {
  description = "Tenant identifier for multi-tenant tagging. Leave empty for standalone deployments."
  type        = string
  default     = ""
}

variable "pricing_tier" {
  description = "Pricing tier for tagging. Leave empty for standalone deployments."
  type        = string
  default     = ""
}

variable "tags" {
  description = "Additional tags to apply to all resources"
  type        = map(string)
  default     = {}
}
