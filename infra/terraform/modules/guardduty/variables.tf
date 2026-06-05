variable "app_name" {
  description = "Application name used for naming and tagging"
  type        = string
  default     = "aria-evaluator"
}

variable "environment" {
  description = "Deployment environment"
  type        = string
}

variable "aws_region" {
  description = "AWS region where GuardDuty and Security Hub are enabled"
  type        = string
}

variable "alert_email" {
  description = "Email address to receive GuardDuty HIGH/CRITICAL and Security Hub HIGH/CRITICAL findings alerts. Leave empty to skip email subscription."
  type        = string
  default     = ""
}

variable "findings_retention_days" {
  description = "Number of days to retain GuardDuty findings in S3"
  type        = number
  default     = 90
}

# true  = run ALL enabled standards checks (slower apply but complete)
# false = subscribe but don't block apply on standard activation
variable "enable_securityhub_fsbp" {
  description = "Subscribe to AWS Foundational Security Best Practices standard"
  type        = bool
  default     = true
}

variable "enable_securityhub_cis" {
  description = "Subscribe to CIS AWS Foundations Benchmark v1.4.0"
  type        = bool
  default     = true
}

variable "tags" {
  description = "Additional tags applied to all resources"
  type        = map(string)
  default     = {}
}
