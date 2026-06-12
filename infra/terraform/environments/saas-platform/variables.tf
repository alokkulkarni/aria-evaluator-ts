variable "app_name" {
  description = "Application name"
  type        = string
  default     = "aria-evaluator"
}

variable "environment" {
  description = "Deployment environment (saas-platform)"
  type        = string
  default     = "saas-platform"
}

variable "aws_region" {
  description = "AWS region for the control plane (primary security monitoring region)"
  type        = string
  default     = "eu-west-2"
}

variable "alert_email" {
  description = "Email address to receive HIGH/CRITICAL security alerts. Leave empty to skip."
  type        = string
  default     = "kulkarni.alok@gmail.com"
}

variable "findings_retention_days" {
  description = "Days to retain GuardDuty findings in S3"
  type        = number
  default     = 90
}

variable "tags" {
  description = "Additional tags applied to all resources"
  type        = map(string)
  default     = {}
}
