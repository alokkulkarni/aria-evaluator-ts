variable "app_name" {
  description = "Application name"
  type        = string
}

variable "aws_region" {
  description = "AWS region"
  type        = string
}

variable "aws_account_id" {
  description = "AWS account ID"
  type        = string
}

variable "terraform_state_bucket" {
  description = "S3 bucket for terraform state"
  type        = string
}

variable "terraform_state_bucket_arn" {
  description = "ARN of S3 bucket for terraform state"
  type        = string
}

variable "terraform_state_kms_key_arn" {
  description = "KMS key ARN for terraform state encryption"
  type        = string
}

variable "terraform_state_lock_table" {
  description = "DynamoDB lock table for terraform state"
  type        = string
}

variable "user_instance_table_arn" {
  description = "ARN of DynamoDB table tracking user instances"
  type        = string
}

variable "user_instance_table_name" {
  description = "Name of DynamoDB table tracking user instances"
  type        = string
}

variable "ecr_repository_arn" {
  description = "ARN of ECR repository for evaluator image"
  type        = string
}

variable "github_repo_url" {
  description = "GitHub repository URL (HTTPS or SSH)"
  type        = string
}

variable "github_branch" {
  description = "GitHub branch to clone from"
  type        = string
  default     = "main"
}

variable "alert_email" {
  description = <<-EOT
    Email address that receives provisioning failure notifications.
    When set, creates an SNS topic + subscription and wires EventBridge + CloudWatch alarms to it.
    Leave empty to skip all notification infrastructure.
  EOT
  type        = string
  default     = ""
}

variable "tags" {
  description = "Common tags for all resources"
  type        = map(string)
  default     = {}
}
