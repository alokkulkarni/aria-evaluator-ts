variable "aws_region" {
  description = "AWS region to deploy into"
  type        = string
  default     = "eu-west-2"
}

variable "app_name" {
  type    = string
  default = "aria-control-plane"
}

variable "environment" {
  type    = string
  default = "prod"
}

variable "tenant_id" {
  type    = string
  default = "control-plane"
}

variable "pricing_tier" {
  type    = string
  default = "platform"
}

variable "bucket_suffix" {
  type = string
}

variable "vpc_cidr" {
  type    = string
  default = "10.62.0.0/16"
}

variable "public_subnet_cidrs" {
  type    = list(string)
  default = ["10.62.1.0/24", "10.62.2.0/24"]
}

variable "private_subnet_cidrs" {
  type    = list(string)
  default = ["10.62.3.0/24", "10.62.4.0/24"]
}

variable "control_plane_image_uri" {
  type = string
}

variable "container_port" {
  type    = number
  default = 3002
}

variable "cpu" {
  type    = number
  default = 512
}

variable "memory" {
  type    = number
  default = 1024
}

variable "desired_count" {
  type    = number
  default = 2
}

variable "log_retention_days" {
  type    = number
  default = 30
}

variable "kms_key_arn" {
  type = string
}

variable "s3_state_prefix" {
  type    = string
  default = "aria-control-plane"
}

variable "cloudtrail_alert_sns_topic_arn" {
  description = "SNS topic ARN for CloudTrail CIS security alarms. Required in prod — set to your existing alerts topic or a dedicated security topic."
  type        = string
  default     = ""
}
