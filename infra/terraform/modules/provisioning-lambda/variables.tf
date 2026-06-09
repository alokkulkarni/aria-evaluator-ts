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

variable "tags" {
  description = "Common tags"
  type        = map(string)
  default     = {}
}
