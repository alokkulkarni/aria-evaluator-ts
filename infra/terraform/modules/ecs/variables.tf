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
  description = "Full ECR image URI including tag"
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

  validation {
    condition = contains(
      lookup(
        {
          "256"  = [512, 1024, 2048]
          "512"  = range(1024, 4097, 1024)
          "1024" = range(2048, 8193, 1024)
          "2048" = range(4096, 16385, 1024)
          "4096" = range(8192, 30721, 1024)
        },
        tostring(var.cpu),
        [],
      ),
      var.memory,
    )
    error_message = "Memory must be valid for the selected Fargate CPU value."
  }
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
  description = "Public subnet IDs for the ECS service"
  type        = list(string)
}

variable "private_subnet_ids" {
  description = "Private subnet IDs for the ECS service"
  type        = list(string)
  default     = []
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
  description = "ARN of the ALB listener"
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

variable "app_log_group_name" {
  description = "Optional externally managed CloudWatch log group name for the application container"
  type        = string
  default     = ""
}

variable "app_log_group_arn" {
  description = "Optional externally managed CloudWatch log group ARN for the application container"
  type        = string
  default     = ""
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

variable "efs_file_system_id" {
  description = "Optional EFS file system ID mounted into the task"
  type        = string
  default     = ""
}

variable "efs_access_point_id" {
  description = "Optional EFS access point ID mounted into the task"
  type        = string
  default     = ""
}

variable "heartbeat_table_name" {
  description = "Optional heartbeat table name injected into the container"
  type        = string
  default     = ""
}

variable "god_mode_enabled" {
  description = "Whether ARIA god mode should be enabled in the container"
  type        = bool
  default     = false
}

variable "god_mode_secret_arn" {
  description = "Secrets Manager ARN containing the ARIA god mode token"
  type        = string
  default     = ""
  sensitive   = true
}

variable "saas_mode" {
  description = "Whether SAAS_MODE is enabled in the container. Set false for standalone/dev deployments."
  type        = bool
  default     = false
}

variable "tags" {
  description = "Additional tags to apply to all resources"
  type        = map(string)
  default     = {}
}
