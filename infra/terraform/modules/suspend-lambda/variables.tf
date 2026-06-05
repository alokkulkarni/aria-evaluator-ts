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

variable "heartbeat_table_arn" {
  description = "ARN of the shared heartbeat table"
  type        = string
}

variable "heartbeat_table_name" {
  description = "Name of the shared heartbeat table"
  type        = string
}

variable "ecs_cluster_arn" {
  description = "ARN of the ECS cluster managed by the suspend and resume Lambdas"
  type        = string
}

variable "ecs_cluster_name" {
  description = "Name of the ECS cluster managed by the suspend and resume Lambdas"
  type        = string
}

variable "ecs_service_name" {
  description = "Name of the ECS service managed by the suspend and resume Lambdas"
  type        = string
}

variable "suspend_threshold_hours" {
  description = "Idle threshold in hours before the service is suspended"
  type        = number
}

variable "alert_email" {
  description = "Alert email used for warning notifications"
  type        = string
  default     = ""
}

variable "control_plane_role_arn" {
  description = "IAM role ARN that may invoke the resume Lambda directly"
  type        = string
  default     = ""
}

variable "aws_region" {
  description = "AWS region where the tenant is deployed"
  type        = string
}

variable "kms_key_arn" {
  description = "KMS key ARN available for future encryption integrations"
  type        = string
}

variable "tags" {
  description = "Additional tags applied to suspend and resume infrastructure"
  type        = map(string)
  default     = {}
}
