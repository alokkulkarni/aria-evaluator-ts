variable "app_name" {
  description = "Application name used as a prefix for Docker resources"
  type        = string
  default     = "aria-website"
}

variable "environment" {
  description = "Deployment environment label"
  type        = string
  default     = "local"
}

# ── Application image ──────────────────────────────────────────────────────────

variable "app_image_name" {
  description = "Docker image name:tag to use for the built website image"
  type        = string
  default     = "aria-website:local"
}

variable "app_dockerfile" {
  description = <<-EOT
    Dockerfile filename (relative to website_dir) used to build the image.
    Defaults to "Dockerfile.local" — the local dev Dockerfile with BuildKit cache
    mounts and no --platform pin (avoids Rosetta overhead on Apple Silicon).
    Set to "Dockerfile" only for production cross-platform builds.
  EOT
  type        = string
  default     = "Dockerfile.local"
}

variable "website_dir" {
  description = <<-EOT
    Absolute path to the website/ directory (the Docker build context).
    Leave empty to auto-detect: four levels above this module then into website/.
    Override only for non-standard repository layouts.
  EOT
  type        = string
  default     = ""
}

variable "force_rebuild" {
  description = <<-EOT
    Arbitrary string; change this value to force an unconditional image rebuild
    without modifying the Dockerfile or package-lock.json.
    Usage:  terraform apply -var='force_rebuild=2'
  EOT
  type        = string
  default     = "1"
}

# ── Ports ──────────────────────────────────────────────────────────────────────

variable "container_port" {
  description = "Port the Next.js server listens on inside the container"
  type        = number
  default     = 3000
}

variable "host_port" {
  description = "Host port mapped to container_port — website accessible at http://localhost:<host_port>"
  type        = number
  default     = 3000
}

# ── Extra environment variables ────────────────────────────────────────────────

variable "extra_environment_vars" {
  description = "Additional environment variables injected into the website container"
  type = list(object({
    name  = string
    value = string
  }))
  default = []
}
