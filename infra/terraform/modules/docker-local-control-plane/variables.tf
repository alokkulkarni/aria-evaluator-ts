variable "app_name" {
  description = "Application name used as a prefix for Docker resources"
  type        = string
  default     = "aria-control-plane"
}

variable "environment" {
  description = "Deployment environment label"
  type        = string
  default     = "local"
}

variable "app_image_name" {
  description = "Docker image name:tag to use for the built control-plane image"
  type        = string
  default     = "aria-control-plane:local"
}

variable "app_dockerfile" {
  description = "Dockerfile filename used to build the control-plane image"
  type        = string
  default     = "Dockerfile.control-plane"
}

variable "app_dockerfile_context" {
  description = "Absolute path to the repo root build context. Leave empty to auto-detect."
  type        = string
  default     = ""
}

variable "container_port" {
  description = "Port the control plane listens on inside the container"
  type        = number
  default     = 4000
}

variable "host_port" {
  description = "Host port mapped to container_port"
  type        = number
  default     = 4000
}

variable "force_rebuild" {
  description = "Change this value to force an unconditional image rebuild"
  type        = string
  default     = "1"
}

variable "extra_environment_vars" {
  description = "Additional environment variables injected into the control-plane container"
  type = list(object({
    name  = string
    value = string
  }))
  default = []
}
