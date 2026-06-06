variable "app_name" {
  type    = string
  default = "aria-control-plane"
}

variable "environment" {
  type    = string
  default = "local"
}

variable "app_image_name" {
  type    = string
  default = "aria-control-plane:local"
}

variable "app_dockerfile" {
  type    = string
  default = "Dockerfile.control-plane"
}

variable "app_dockerfile_context" {
  description = "Leave empty to auto-detect the repo root."
  type        = string
  default     = ""
}

variable "force_rebuild" {
  type    = string
  default = "1"
}

variable "container_port" {
  type    = number
  default = 4000
}

variable "host_port" {
  type    = number
  default = 4000
}
