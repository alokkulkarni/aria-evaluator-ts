variable "aws_region" {
  description = "AWS region (must match both app stacks)"
  type        = string
  default     = "eu-west-2"
}

variable "terraform_state_bucket" {
  description = "S3 bucket holding the website-prod and control-plane-prod remote state"
  type        = string
  default     = "aria-evaluator-tf-state-194296"
}

variable "website_state_key" {
  description = "Remote state key for the website-prod stack"
  type        = string
  default     = "website/prod/terraform.tfstate"
}

variable "control_plane_state_key" {
  description = "Remote state key for the control-plane-prod stack"
  type        = string
  default     = "control-plane/prod/terraform.tfstate"
}

# Backend-config inputs (consumed by init-backend.sh, not by resources).
variable "terraform_state_kms_key_arn" {
  description = "KMS key ARN encrypting the Terraform state bucket"
  type        = string
  default     = ""
}

variable "terraform_state_lock_table" {
  description = "DynamoDB table for Terraform state locking"
  type        = string
  default     = "aria-evaluator-tf-locks"
}

variable "tags" {
  description = "Additional tags applied to all resources"
  type        = map(string)
  default     = {}
}
