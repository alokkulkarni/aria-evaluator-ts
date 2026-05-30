variable "app_name" {
  description = "Application name used as a prefix for resource names"
  type        = string
}

variable "environment" {
  description = "Deployment environment"
  type        = string
}

variable "aws_region" {
  description = "AWS region for CloudWatch log group"
  type        = string
}

variable "app_image_uri" {
  description = "Full ECR image URI including tag (e.g. 123456789012.dkr.ecr.eu-west-2.amazonaws.com/repo:latest)"
  type        = string
}

variable "container_port" {
  description = "Port the container listens on"
  type        = number
  default     = 3001
}

variable "cpu" {
  description = "Fargate task CPU units (256, 512, 1024, 2048, 4096)"
  type        = number
  default     = 256

  validation {
    condition     = contains([256, 512, 1024, 2048, 4096], var.cpu)
    error_message = "CPU must be one of: 256, 512, 1024, 2048, 4096."
  }
}

variable "memory" {
  description = "Fargate task memory in MiB (must be compatible with cpu)"
  type        = number
  default     = 512
}

variable "desired_count" {
  description = "Number of ECS tasks to run (0 = stopped, 1 = always-on)"
  type        = number
  default     = 1
}

variable "task_execution_role_arn" {
  description = "ARN of the ECS task execution role"
  type        = string
}

variable "task_role_arn" {
  description = "ARN of the ECS task role (application permissions)"
  type        = string
}

variable "public_subnet_ids" {
  description = "Subnet IDs for the ECS service (public subnets with ENABLED public IP)"
  type        = list(string)
}

variable "ecs_service_security_group_id" {
  description = "Security group ID for the ECS service"
  type        = string
}

variable "target_group_arn" {
  description = "ARN of the ALB target group to register tasks with"
  type        = string
}

variable "alb_listener_arn" {
  description = "ARN of the ALB listener (used as a dependency to ensure listener exists before service)"
  type        = string
}

variable "state_bucket_name" {
  description = "Name of the S3 state bucket passed to the container as an environment variable"
  type        = string
}

variable "s3_state_prefix" {
  description = "S3 key prefix for state files"
  type        = string
  default     = "aria-evaluator"
}

variable "s3_sync_interval_seconds" {
  description = "Interval in seconds between S3 state sync operations"
  type        = number
  default     = 30
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days"
  type        = number
  default     = 7
}

variable "deployment_minimum_healthy_percent" {
  description = "Minimum healthy task percentage during deployment"
  type        = number
  default     = 0
}

variable "deployment_maximum_percent" {
  description = "Maximum task percentage during deployment"
  type        = number
  default     = 100
}

variable "extra_environment_vars" {
  description = "Additional environment variables to inject into the container"
  type = list(object({
    name  = string
    value = string
  }))
  default = []
}

variable "tags" {
  description = "Additional tags to apply to all resources"
  type        = map(string)
  default     = {}
}
