# modules/platform — shared multi-tenant platform stack: one VPC, one ALB (wildcard
# cert + host-header routing), one Aurora Serverless v2, one ECS cluster, one Redis.
# Per-tenant compute attaches via modules/tenant-service. See docs/MULTI_TENANT_SPEC.md.

variable "app_name" {
  description = "Application name prefix."
  type        = string
  default     = "aria-evaluator"
}

variable "environment" {
  description = "Deployment environment label (dev/staging/prod)."
  type        = string
}

variable "domain" {
  description = "Base domain for tenant subdomains (e.g. aria-evaluator.app); tenants get <tenant>.<domain>."
  type        = string
}

variable "route53_zone_id" {
  description = "Route53 hosted zone id for the domain. Empty skips the wildcard DNS record (e.g. for validate-only)."
  type        = string
  default     = ""
}

variable "acm_certificate_arn" {
  description = "ARN of the wildcard ACM certificate (*.<domain>) for the ALB HTTPS listener."
  type        = string
}

# ── Networking ─────────────────────────────────────────────────────────────────
variable "vpc_cidr" {
  description = "VPC CIDR."
  type        = string
  default     = "10.50.0.0/16"
}

variable "public_subnet_cidrs" {
  description = "Public subnet CIDRs (one per AZ)."
  type        = list(string)
  default     = ["10.50.1.0/24", "10.50.2.0/24"]
}

variable "private_subnet_cidrs" {
  description = "Private subnet CIDRs (one per AZ) — tenant tasks, Aurora, Redis."
  type        = list(string)
  default     = ["10.50.11.0/24", "10.50.12.0/24"]
}

variable "availability_zones" {
  description = "AZs to span. Empty = first two available in the region."
  type        = list(string)
  default     = []
}

variable "container_port" {
  description = "App container port."
  type        = number
  default     = 3001
}

# ── Aurora ─────────────────────────────────────────────────────────────────────
variable "aurora_engine_version" {
  description = "Aurora PostgreSQL engine version."
  type        = string
  default     = "16.4"
}

variable "aurora_min_acu" {
  description = "Aurora Serverless v2 minimum ACUs."
  type        = number
  default     = 0.5
}

variable "aurora_max_acu" {
  description = "Aurora Serverless v2 maximum ACUs."
  type        = number
  default     = 8
}

variable "aurora_deletion_protection" {
  description = "Protect the Aurora cluster from deletion."
  type        = bool
  default     = true
}

# ── Redis ──────────────────────────────────────────────────────────────────────
variable "redis_node_type" {
  description = "ElastiCache Redis node type."
  type        = string
  default     = "cache.t4g.micro"
}

variable "redis_engine_version" {
  description = "ElastiCache Redis engine version."
  type        = string
  default     = "7.1"
}

# ── State bucket ───────────────────────────────────────────────────────────────
variable "state_bucket_name" {
  description = "Override for the shared S3 state bucket name. Empty = derived from app/env/account."
  type        = string
  default     = ""
}

variable "state_bucket_force_destroy" {
  description = "Allow destroying the state bucket with objects present (non-prod convenience)."
  type        = bool
  default     = false
}

variable "alb_enable_deletion_protection" {
  description = "Protect the shared ALB from deletion."
  type        = bool
  default     = true
}

# ── Control-plane wake hook ────────────────────────────────────────────────────
variable "control_plane_role_name" {
  description = "Name of the control-plane task role to grant tenant provisioning + purge permissions (Phase 6). Empty skips."
  type        = string
  default     = ""
}

variable "control_plane_security_group_id" {
  description = "Control-plane task security group, allowed Aurora ingress so it can purge tenant DB rows on delete. Empty skips."
  type        = string
  default     = ""
}

variable "tags" {
  description = "Tags applied to all resources."
  type        = map(string)
  default     = {}
}
