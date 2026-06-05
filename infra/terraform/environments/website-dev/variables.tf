variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "eu-west-2"
}

variable "container_image" {
  description = "Full URI of the Next.js container image (e.g. <account>.dkr.ecr.eu-west-2.amazonaws.com/aria-website-dev:latest)"
  type        = string
  default     = "public.ecr.aws/nginx/nginx:1.25-alpine" # placeholder until first build
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

variable "tags" {
  description = "Additional tags"
  type        = map(string)
  default     = {}
}
