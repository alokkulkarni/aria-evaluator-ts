variable "aws_region" {
  description = "AWS region for the bootstrap resources"
  type        = string
  default     = "eu-west-2"
}

variable "bucket_suffix" {
  description = "Globally unique suffix appended to the Terraform state bucket"
  type        = string
}

variable "tags" {
  description = "Additional tags applied to bootstrap resources"
  type        = map(string)
  default     = {}
}
