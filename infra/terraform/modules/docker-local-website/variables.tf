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
  type    = string
  default = "1"
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

# ── NextAuth ───────────────────────────────────────────────────────────────────

variable "nextauth_url" {
  description = "Full public URL of the website (NEXTAUTH_URL). Must match the host_port."
  type        = string
  default     = "http://localhost:3000"
}

variable "nextauth_secret" {
  description = <<-EOT
    Secret used by NextAuth to sign tokens.
    Generate with: openssl rand -base64 32
    Never commit to source control — pass via terraform.tfvars or TF_VAR_nextauth_secret.
  EOT
  type      = string
  sensitive = true
}

# ── OAuth providers (optional for local dev) ───────────────────────────────────

variable "google_client_id" {
  description = "Google OAuth client ID (optional — leave empty to disable Google sign-in)"
  type        = string
  default     = ""
}

variable "google_client_secret" {
  description = "Google OAuth client secret"
  type      = string
  default   = ""
  sensitive = true
}

variable "github_client_id" {
  description = "GitHub OAuth app client ID (optional — leave empty to disable GitHub sign-in)"
  type        = string
  default     = ""
}

variable "github_client_secret" {
  description = "GitHub OAuth app client secret"
  type      = string
  default   = ""
  sensitive = true
}

# ── Control plane ──────────────────────────────────────────────────────────────

variable "control_plane_url" {
  description = <<-EOT
    Base URL of the ARIA control plane API.
    Leave empty for local dev — all provisioning calls are stubbed in the website
    and no real control plane is needed for UI development.
  EOT
  type    = string
  default = ""
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
