variable "app_name" {
  description = "Application name"
  type        = string
}

variable "aws_region" {
  description = "AWS region"
  type        = string
}

variable "codebuild_project_name" {
  description = "Name of CodeBuild project"
  type        = string
}

variable "codebuild_project_arn" {
  description = "ARN of CodeBuild project"
  type        = string
}

variable "user_instance_table_name" {
  description = "DynamoDB table for user instance tracking"
  type        = string
}

variable "user_instance_table_arn" {
  description = "ARN of user instance tracking table"
  type        = string
}

variable "allowed_origins" {
  description = "CORS allowed origins"
  type        = list(string)
  default     = ["*"]
}

# ── Security Configuration ──────────────────────────────────────────────────

variable "cognito_user_pool_id" {
  description = "Cognito User Pool ID for JWT validation"
  type        = string
}

variable "jwt_audience" {
  description = "JWT audience claim value"
  type        = string
}

variable "dynamodb_kms_key_arn" {
  description = "KMS key ARN for DynamoDB encryption"
  type        = string
}

variable "cloudtrail_s3_bucket" {
  description = "S3 bucket for CloudTrail logs"
  type        = string
}

variable "alarm_sns_topic_arn" {
  description = "SNS topic ARN for alarm notifications"
  type        = string
}

variable "max_instances_per_user" {
  description = "Maximum number of instances per user"
  type        = number
  default     = 2
}

variable "max_monthly_spend_per_user" {
  description = "Maximum monthly spend per user in USD"
  type        = number
  default     = 1000
}

variable "cost_per_instance_hour" {
  description = "Cost per instance per hour in USD"
  type        = number
  default     = 0.25
}

variable "tags" {
  description = "Common tags"
  type        = map(string)
  default     = {}
}
