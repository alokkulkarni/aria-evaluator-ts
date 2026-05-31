variable "app_name" {
  description = "Application name used as a prefix for Docker resources"
  type        = string
  default     = "aria-evaluator"
}

variable "environment" {
  description = "Deployment environment label"
  type        = string
  default     = "local"
}

# ── Application image ──────────────────────────────────────────────────────────

variable "app_image_name" {
  description = "Docker image name:tag for the application. Used as-is when app_dockerfile_context is empty."
  type        = string
  default     = "aria-evaluator:local"
}

variable "app_dockerfile_context" {
  description = <<-EOT
    Absolute path to the directory containing the Dockerfile (the repo root).
    Terraform always builds the image locally — it never pulls from a registry.
    Leave empty (default) to let the module auto-detect the repo root from its
    own path (four levels up from modules/docker-local/).
    Set explicitly when the module is used from a non-standard location.
  EOT
  type        = string
  default     = ""
}

variable "app_dockerfile" {
  description = <<-EOT
    Dockerfile filename (relative to app_dockerfile_context / repo root) to use
    for building the application image.
    Defaults to "Dockerfile.local" — the local dev Dockerfile that has no
    --platform pin, ensuring native arm64 binaries on Apple Silicon and
    avoiding the esbuild linux-arm64 vs linux-x64 mismatch.
    Set to "Dockerfile" only for ECS/production cross-platform builds.
  EOT
  type    = string
  default = "Dockerfile.local"
}

# ── Ports ──────────────────────────────────────────────────────────────────────

variable "container_port" {
  description = "Port the application listens on inside the container"
  type        = number
  default     = 3001
}

variable "host_port" {
  description = "Host port mapped to container_port — application accessible at http://localhost:<host_port>"
  type        = number
  default     = 3001
}

# ── Extra environment variables ────────────────────────────────────────────────

variable "extra_environment_vars" {
  description = "Additional environment variables injected into the application container"
  type = list(object({
    name  = string
    value = string
  }))
  default = []
}

# ── External Bedrock proxy URL ─────────────────────────────────────────────────
# The Bedrock proxy now runs as a completely separate Terraform-managed service
# in its own Docker network (infra/terraform/environments/bedrock-proxy-local).
# Pass its host-accessible URL here so the evaluator can reach it across network
# boundaries without requiring both services to share a Docker network.
#
# Typical value:  "http://host.docker.internal:8765"
# (Docker Desktop resolves host.docker.internal on macOS / Windows.
#  On Linux native Docker, the bedrock-proxy module sets extra_hosts automatically.)
#
# Leave empty (default) to omit BEDROCK_LAMBDA_ENDPOINT entirely — useful when
# pointing at a deployed AWS API Gateway via extra_environment_vars instead.

variable "bedrock_proxy_url" {
  description = <<-EOT
    URL of the separately-deployed local Bedrock proxy.
    Set to "http://host.docker.internal:<port>" when the proxy runs in its own
    Docker network on the same machine.
    Leave empty to omit BEDROCK_LAMBDA_ENDPOINT (use extra_environment_vars to
    point at an AWS API Gateway endpoint instead).
  EOT
  type    = string
  default = ""
}

# ── Scenarios bind-mount ───────────────────────────────────────────────────────

variable "local_scenarios_dir" {
  description = <<-EOT
    Absolute path to a host directory containing scenario YAML files.
    When set, this directory is bind-mounted read-only into the container at
    /app/state/scenarios so pre-built scenarios are always available on startup.
    Leave empty (default) to use only the named state volume (scenarios created
    via the UI are stored there instead).
    Example: abspath("../../../../scenarios")
  EOT
  type    = string
  default = ""
}

# ── Local DB bind-mount (optional) ────────────────────────────────────────────

variable "local_db_path" {
  description = <<-EOT
    Absolute path to an existing host SQLite database file to mount into the
    container at /app/state/data/aria-evaluator.db.  Use this to preserve run
    history across container re-creation (e.g. terraform destroy / apply).
    Leave empty (default) to let the container create a fresh database in the
    named state volume on first start.
  EOT
  type    = string
  default = ""
}
