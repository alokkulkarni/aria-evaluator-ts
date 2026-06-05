variable "app_name" {
  description = "Application name used for naming and tagging"
  type        = string
}

variable "environment" {
  description = "Deployment environment"
  type        = string
}

variable "tenant_id" {
  description = "Tenant identifier"
  type        = string
}

variable "pricing_tier" {
  description = "Tenant pricing tier"
  type        = string
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days"
  type        = number
}

variable "ecs_cluster_name" {
  description = "ECS cluster name for alarms and dashboards"
  type        = string
}

variable "ecs_service_name" {
  description = "ECS service name for alarms and dashboards"
  type        = string
}

variable "alb_arn_suffix" {
  description = "ALB ARN suffix used by CloudWatch Application Load Balancer metrics"
  type        = string
}

variable "alert_email" {
  description = "Email address subscribed to tenant alarms"
  type        = string
  default     = ""
}

variable "xray_enabled" {
  description = "Whether to create X-Ray resources for the tenant"
  type        = bool
  default     = false
}

variable "xray_sampling_rate" {
  description = "Fixed-rate sampling percentage for tenant traces"
  type        = number
  default     = 0.05
}

variable "aws_region" {
  description = "AWS region where the tenant is deployed"
  type        = string
}

variable "kms_key_arn" {
  description = "KMS key ARN used to encrypt the alert SNS topic"
  type        = string
}

variable "tags" {
  description = "Additional tags applied to observability resources"
  type        = map(string)
  default     = {}
}
