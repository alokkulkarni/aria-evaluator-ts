variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "eu-west-2"
}

variable "auth_backend_image_tag" {
  description = "Docker image tag for the auth backend container"
  type        = string
  default     = "latest"
}

variable "nextauth_secret" {
  description = "NextAuth.js signing secret (32+ chars)"
  type        = string
  sensitive   = true
  default     = "dev-secret-replace-me-with-32-chars"
}

variable "google_client_id" {
  type      = string
  sensitive = true
  default   = ""
}

variable "google_client_secret" {
  type      = string
  sensitive = true
  default   = ""
}

variable "github_client_id" {
  type      = string
  sensitive = true
  default   = ""
}

variable "github_client_secret" {
  type      = string
  sensitive = true
  default   = ""
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
