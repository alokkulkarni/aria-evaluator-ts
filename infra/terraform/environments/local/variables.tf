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

# ── Image / build ──────────────────────────────────────────────────────────────

variable "app_image_name" {
  description = "Docker image name:tag for the application"
  type        = string
  default     = "aria-evaluator:local"
}

variable "docker_pull_trigger" {
  description = "Trigger value to force Docker image pull (e.g., current date to update Redis)"
  type        = string
  default     = "redis:7-alpine"
}

variable "app_dockerfile_context" {
  description = <<-EOT
    Absolute path to the repo root (where the main Dockerfile lives).
    When set, Terraform builds the image automatically on `apply`.
    Leave empty to use a pre-built image.
  EOT
  type        = string
  default     = ""
}

# ── Ports ──────────────────────────────────────────────────────────────────────

variable "host_port" {
  description = "Host port the application is exposed on (http://localhost:<host_port>)"
  type        = number
  default     = 3001
}

# ── Extra environment variables ────────────────────────────────────────────────
# Use this to pass provider-specific configuration (Amazon Connect instance ID,
# judge model, default eval provider, etc.) without modifying module code.
#
# Example for connecting to a live AWS Bedrock Lambda endpoint:
#   extra_environment_vars = [
#     { name = "BEDROCK_LAMBDA_ENDPOINT", value = "https://<api-gw-id>.execute-api.<region>.amazonaws.com" }
#   ]

variable "extra_environment_vars" {
  description = "Additional environment variables injected into the application container"
  type = list(object({
    name  = string
    value = string
  }))
  default = []
}

# ── External Bedrock proxy URL ─────────────────────────────────────────────────
# Deploy the proxy first with:
#   cd infra/terraform/environments/bedrock-proxy-local && terraform apply
# Then set this to "http://host.docker.internal:<port>" so the evaluator can
# reach the proxy across separate Docker networks.

variable "bedrock_proxy_url" {
  description = <<-EOT
    URL of the separately-deployed local Bedrock proxy.
    Set to "http://host.docker.internal:8765" after deploying bedrock-proxy-local.
    Leave empty to omit BEDROCK_LAMBDA_ENDPOINT and use extra_environment_vars
    to point at an AWS API Gateway endpoint instead.
  EOT
  type        = string
  default     = ""
}

# ── Scenarios bind-mount ───────────────────────────────────────────────────────

variable "local_scenarios_dir" {
  description = <<-EOT
    Absolute path to a host directory containing scenario YAML files.
    When set, this directory is bind-mounted into the container at
    /app/state/scenarios so pre-built scenarios are always available.
    Leave empty to use only the named state volume.
  EOT
  type        = string
  default     = ""
}

# ── Local DB bind-mount (optional) ────────────────────────────────────────────

variable "local_db_path" {
  description = <<-EOT
    Absolute path to an existing host SQLite database file.
    When set, mounted into the container at /app/state/data/aria-evaluator.db
    to preserve run history across terraform destroy / apply cycles.
    Leave empty to let the container create a fresh database.
  EOT
  type        = string
  default     = ""
}

# ── Control plane SSO ─────────────────────────────────────────────────────────

variable "control_plane_internal_url" {
  description = "URL of the local control-plane container, e.g. http://host.docker.internal:4000"
  type        = string
  default     = "http://host.docker.internal:4000"
}

variable "control_plane_internal_secret" {
  description = "Shared secret for evaluator → control plane SSO verification (leave empty for local)"
  type        = string
  default     = ""
  sensitive   = true
}

variable "website_url" {
  description = <<-EOT
    Base URL of the ARIA marketing website, injected as ARIA_WEBSITE_URL.
    Used for sign-out redirect and other links that return the user to the
    main website.  Defaults to http://localhost:3000 for local development.
  EOT
  type        = string
  default     = "http://localhost:3000"
}

# ── Phase 1: JWT Secrets ───────────────────────────────────────────────────────

variable "access_token_secret" {
  description = "JWT access token secret (generate with: openssl rand -base64 32)"
  type        = string
  default     = "local-dev-access-token-secret-do-not-use-in-prod"
  sensitive   = true
}

variable "refresh_token_secret" {
  description = "JWT refresh token secret (generate with: openssl rand -base64 32)"
  type        = string
  default     = "local-dev-refresh-token-secret-do-not-use-in-prod"
  sensitive   = true
}

# ── Phase 1: OAuth Credentials ─────────────────────────────────────────────────

variable "google_client_id" {
  description = "Google OAuth client ID (from Google Cloud Console)"
  type        = string
  default     = "local-google-client-id"
  sensitive   = true
}

variable "google_client_secret" {
  description = "Google OAuth client secret (from Google Cloud Console)"
  type        = string
  default     = "local-google-client-secret"
  sensitive   = true
}

variable "github_client_id" {
  description = "GitHub OAuth client ID (from GitHub Settings > Developers)"
  type        = string
  default     = "local-github-client-id"
  sensitive   = true
}

variable "github_client_secret" {
  description = "GitHub OAuth client secret (from GitHub Settings > Developers)"
  type        = string
  default     = "local-github-client-secret"
  sensitive   = true
}

variable "max_runs_per_month" {
  description = "Override MAX_RUNS_PER_MONTH for this instance (empty = use tier default)"
  type        = string
  default     = ""
}

variable "max_scenarios_per_run" {
  description = "Override MAX_SCENARIOS_PER_RUN for this instance (empty = use tier default)"
  type        = string
  default     = ""
}

variable "max_models" {
  description = "Override MAX_MODELS for this instance (empty = use tier default)"
  type        = string
  default     = ""
}

variable "max_users" {
  description = "Override MAX_USERS for this instance (empty = use tier default)"
  type        = string
  default     = ""
}
