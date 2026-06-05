variable "app_name" {
  description = "Application name - used as the ECR repository name"
  type        = string
}

variable "environment" {
  description = "Deployment environment"
  type        = string
}

variable "image_tag_mutability" {
  description = "Image tag mutability setting (MUTABLE or IMMUTABLE)"
  type        = string
  default     = "MUTABLE"

  validation {
    condition     = contains(["MUTABLE", "IMMUTABLE"], var.image_tag_mutability)
    error_message = "Must be MUTABLE or IMMUTABLE."
  }
}

variable "scan_on_push" {
  description = "Enable image scanning on push"
  type        = bool
  default     = true
}

variable "lifecycle_untagged_days" {
  description = "Days after which untagged images are expired"
  type        = number
  default     = 14
}

variable "lifecycle_keep_tagged_count" {
  description = "Number of tagged images to keep per prefix"
  type        = number
  default     = 10
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
