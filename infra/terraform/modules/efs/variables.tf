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

variable "vpc_id" {
  description = "VPC ID for the EFS mount targets"
  type        = string
}

variable "private_subnet_ids" {
  description = "Private subnet IDs where EFS mount targets should be created"
  type        = list(string)
}

variable "ecs_security_group_id" {
  description = "Security group ID of the ECS service allowed to mount EFS"
  type        = string
}

variable "kms_key_arn" {
  description = "KMS key ARN used to encrypt the file system"
  type        = string
}

variable "tags" {
  description = "Additional tags applied to all EFS resources"
  type        = map(string)
  default     = {}
}
