variable "app_name" {
  description = "Application name used as a prefix for IAM role names"
  type        = string
}

variable "environment" {
  description = "Deployment environment"
  type        = string
}

variable "state_bucket_arn" {
  description = "ARN of the S3 state bucket the task role needs access to"
  type        = string
}

variable "aws_region" {
  description = "AWS region (used to scope Bedrock/Transcribe resource ARNs)"
  type        = string
}

variable "aws_account_id" {
  description = "AWS account ID (used to scope resource ARNs)"
  type        = string
}

variable "connect_instance_id" {
  description = "Amazon Connect instance ID. Set to '*' to allow all instances."
  type        = string
  default     = "*"
}

variable "secrets_arns" {
  description = "Secrets Manager ARNs that the ECS task role may read"
  type        = list(string)
  default     = []
}

variable "heartbeat_table_arn" {
  description = "ARN of the shared heartbeat DynamoDB table"
  type        = string
  default     = ""
}

variable "god_mode_secret_arn" {
  description = "Secrets Manager ARN containing the ARIA god mode token"
  type        = string
  default     = ""
  sensitive   = true
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
