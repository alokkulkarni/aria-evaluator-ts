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

variable "extra_environment_vars" {
  type = list(object({
    name  = string
    value = string
  }))
  default = []
}
