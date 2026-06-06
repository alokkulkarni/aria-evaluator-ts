variable "app_name" {
  description = "Application name used as a prefix for resource names"
  type        = string
}

variable "environment" {
  description = "Deployment environment"
  type        = string
}

variable "internal" {
  description = "Whether the load balancer should be internal-only"
  type        = bool
  default     = false
}

variable "vpc_id" {
  description = "VPC ID where the ALB is deployed"
  type        = string
}

variable "public_subnet_ids" {
  description = "List of public subnet IDs for the ALB"
  type        = list(string)
}

variable "alb_security_group_id" {
  description = "Security group ID to attach to the ALB"
  type        = string
}

variable "container_port" {
  description = "Port the ECS container listens on (used for target group)"
  type        = number
  default     = 3001
}

variable "health_check_path" {
  description = "HTTP path for ALB health checks"
  type        = string
  default     = "/health"
}

variable "health_check_interval" {
  description = "Seconds between ALB health checks"
  type        = number
  default     = 30
}

variable "healthy_threshold" {
  description = "Number of consecutive successful health checks before marking healthy"
  type        = number
  default     = 2
}

variable "unhealthy_threshold" {
  description = "Number of consecutive failed health checks before marking unhealthy"
  type        = number
  default     = 3
}

variable "deregistration_delay" {
  description = "Seconds to wait before deregistering a target (draining)"
  type        = number
  default     = 30
}

variable "acm_certificate_arn" {
  description = "ACM certificate ARN for the HTTPS listener in the deployment region"
  type        = string
  default     = ""
}

variable "cloudfront_origin_secret" {
  description = "Shared origin secret that CloudFront injects into ALB requests"
  type        = string
  default     = ""
  sensitive   = true
}

variable "log_bucket_suffix" {
  description = "Unique suffix appended to the ALB access log bucket"
  type        = string
  default     = "logs"
}

variable "enable_deletion_protection" {
  description = "Whether deletion protection should be enabled for the ALB"
  type        = bool
  default     = true
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
