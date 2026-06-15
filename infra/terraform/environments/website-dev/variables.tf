variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "eu-west-2"
}

variable "force_destroy" {
  description = "Teardown switch. When true, S3 buckets (static site, ALB logs, CloudTrail) are emptied on destroy and the ECR repo force-deletes. Defaults true in dev so the stack is always trivially destroyable."
  type        = bool
  default     = true
}

variable "auth_backend_image_tag" {
  description = "Docker image tag for the auth backend container"
  type        = string
  default     = "latest"
}

variable "control_plane_url" {
  description = "Control plane API URL"
  type        = string
  default     = ""
}

variable "tags" {
  description = "Additional tags"
  type        = map(string)
  default     = {}
}

variable "cloudtrail_bucket_suffix" {
  description = "Short unique suffix for the CloudTrail S3 bucket"
  type        = string
  default     = "dev"
}
