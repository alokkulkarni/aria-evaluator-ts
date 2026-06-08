# ── Required ──────────────────────────────────────────────────────────────────

variable "app_name" {
  type    = string
  default = "aria"
}

variable "environment" {
  type = string
}

variable "public_url" {
  type        = string
  description = "Public URL of the website (e.g. https://ariaeval.io). Used as NEXTAUTH_URL."
}

# ── Networking ────────────────────────────────────────────────────────────────

variable "vpc_cidr" {
  type    = string
  default = "10.1.0.0/16"
}

variable "public_subnet_cidrs" {
  type    = list(string)
  default = ["10.1.1.0/24", "10.1.2.0/24"]
}

variable "availability_zones" {
  type    = list(string)
  default = ["eu-west-2a", "eu-west-2b"]
}

# ── Container ─────────────────────────────────────────────────────────────────

variable "container_port" {
  type    = number
  default = 3001
}

variable "cpu" {
  type        = number
  default     = 256
  description = "CPU units for Fargate task (256 = 0.25 vCPU)"
}

variable "memory" {
  type        = number
  default     = 512
  description = "Memory MiB for Fargate task"
}

variable "desired_count" {
  type    = number
  default = 1
}

variable "image_tag" {
  type    = string
  default = "latest"
}

# ── Auth secrets ──────────────────────────────────────────────────────────────

variable "nextauth_secret" {
  type      = string
  sensitive = true
  default   = ""
}

variable "google_client_id" {
  type    = string
  default = ""
}

variable "google_client_secret" {
  type      = string
  sensitive = true
  default   = ""
}

variable "github_client_id" {
  type    = string
  default = ""
}

variable "github_client_secret" {
  type      = string
  sensitive = true
  default   = ""
}

# ── Control plane ─────────────────────────────────────────────────────────────

variable "control_plane_url" {
  type        = string
  default     = "http://localhost:3002"
  description = "Internal URL of the ARIA control plane API."
}

# ── Observability ─────────────────────────────────────────────────────────────

variable "log_retention_days" {
  type    = number
  default = 30
}

variable "enable_container_insights" {
  type    = bool
  default = true
}

# ── Tags ──────────────────────────────────────────────────────────────────────

variable "tags" {
  type    = map(string)
  default = {}
}
