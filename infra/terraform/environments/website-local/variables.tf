variable "app_name" {
  type    = string
  default = "aria-website"
}

variable "environment" {
  type    = string
  default = "local"
}

variable "app_image_name" {
  type    = string
  default = "aria-website:local"
}

variable "app_dockerfile" {
  type    = string
  default = "Dockerfile.local"
}

variable "website_dir" {
  description = "Leave empty to auto-detect. Set to an absolute path to override."
  type        = string
  default     = ""
}

variable "force_rebuild" {
  description = "Change to any new value to trigger an unconditional image rebuild."
  type        = string
  default     = "1"
}

variable "container_port" {
  type    = number
  default = 3000
}

variable "host_port" {
  type    = number
  default = 3000
}

variable "nextauth_secret" {
  description = "NextAuth secret — generate with: openssl rand -base64 32"
  type        = string
  sensitive   = true
}

variable "google_client_id" {
  type    = string
  default = ""
}

variable "google_client_secret" {
  type      = string
  default   = ""
  sensitive = true
}

variable "github_client_id" {
  type    = string
  default = ""
}

variable "github_client_secret" {
  type      = string
  default   = ""
  sensitive = true
}

variable "control_plane_url" {
  type    = string
  default = "http://host.docker.internal:4000"
}

variable "extra_environment_vars" {
  type = list(object({
    name  = string
    value = string
  }))
  default = []
}
