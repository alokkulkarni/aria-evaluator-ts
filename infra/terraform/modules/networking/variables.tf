variable "app_name" {
  description = "Application name used as a prefix for all resource names"
  type        = string
}

variable "environment" {
  description = "Deployment environment"
  type        = string

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Must be dev, staging, or prod."
  }
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.42.0.0/16"
}

variable "public_subnet_cidrs" {
  description = "List of CIDR blocks for public subnets (one per AZ)"
  type        = list(string)
  default     = ["10.42.1.0/24", "10.42.2.0/24"]
}

variable "private_subnets_enabled" {
  description = "Whether to create private subnets and VPC endpoints"
  type        = bool
  default     = false
}

variable "private_subnet_cidrs" {
  description = "List of CIDR blocks for private subnets (one per AZ)"
  type        = list(string)
  default     = ["10.42.3.0/24", "10.42.4.0/24"]
}

variable "availability_zones" {
  description = "List of availability zones to deploy subnets into"
  type        = list(string)
}

variable "container_port" {
  description = "Port the ECS container listens on"
  type        = number
  default     = 3001
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
