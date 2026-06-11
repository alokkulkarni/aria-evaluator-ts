# infra/terraform/modules/redis/variables.tf
# Variables for Redis module

variable "environment" {
  description = "Environment name (local, dev, prod)"
  type        = string

  validation {
    condition     = contains(["local", "dev", "prod"], var.environment)
    error_message = "Environment must be local, dev, or prod."
  }
}

variable "engine_version" {
  description = "Redis engine version"
  type        = string
  default     = "7.0"
}

variable "node_type" {
  description = "ElastiCache node type (e.g., cache.t4g.micro, cache.t4g.small, cache.m6g.large)"
  type        = string
  default     = "cache.t4g.micro"
}

variable "num_cache_nodes" {
  description = "Number of cache nodes"
  type        = number
  default     = 1

  validation {
    condition     = var.num_cache_nodes >= 1 && var.num_cache_nodes <= 6
    error_message = "Number of nodes must be between 1 and 6."
  }
}

variable "parameter_group_name" {
  description = "Parameter group name"
  type        = string
  default     = "default.redis7"
}

variable "port" {
  description = "Redis port"
  type        = number
  default     = 6379

  validation {
    condition     = var.port >= 1024 && var.port <= 65535
    error_message = "Port must be between 1024 and 65535."
  }
}

variable "automatic_failover_enabled" {
  description = "Enable automatic failover for Multi-AZ"
  type        = bool
  default     = false
}

variable "at_rest_encryption_enabled" {
  description = "Enable encryption at rest"
  type        = bool
  default     = true
}

variable "transit_encryption_enabled" {
  description = "Enable encryption in transit"
  type        = bool
  default     = false
}

variable "auth_token" {
  description = "Auth token for Redis (if transit encryption enabled)"
  type        = string
  default     = ""
  sensitive   = true
}

variable "subnet_group_name" {
  description = "ElastiCache subnet group name"
  type        = string
}

variable "security_group_ids" {
  description = "Security group IDs"
  type        = list(string)
}

variable "snapshot_retention_limit" {
  description = "Number of days to retain snapshots"
  type        = number
  default     = 5
}

variable "snapshot_window" {
  description = "Daily time window for snapshots (UTC, e.g., 03:00-05:00)"
  type        = string
  default     = "03:00-05:00"
}

variable "maintenance_window" {
  description = "Weekly maintenance window (e.g., sun:05:00-sun:07:00)"
  type        = string
  default     = "sun:05:00-sun:07:00"
}

variable "skip_final_snapshot" {
  description = "Skip final snapshot on deletion (WARNING: data loss)"
  type        = bool
  default     = true
}

variable "create_alarms" {
  description = "Create CloudWatch alarms"
  type        = bool
  default     = true
}

variable "alarm_actions" {
  description = "SNS topic ARNs for alarm actions"
  type        = list(string)
  default     = []
}

variable "tags" {
  description = "Tags to apply to resources"
  type        = map(string)
  default     = {}
}
