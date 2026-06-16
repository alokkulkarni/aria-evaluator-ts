variable "environment" {
  description = "Environment name (e.g. dev, prod) — used in resource names."
  type        = string
}

variable "vpc_id" {
  description = "VPC the Aurora cluster lives in."
  type        = string
}

variable "subnet_ids" {
  description = "Subnet ids for the DB subnet group (use private subnets in prod)."
  type        = list(string)
}

variable "allowed_security_group_ids" {
  description = "Security groups allowed to reach Postgres on 5432 (e.g. the ECS service SG)."
  type        = list(string)
  default     = []
}

variable "engine_version" {
  description = "Aurora PostgreSQL engine version (Serverless v2 requires PG 13+)."
  type        = string
  default     = "16.4"
}

variable "database_name" {
  description = "Initial database name."
  type        = string
  default     = "aria"
}

variable "master_username" {
  description = "Master username."
  type        = string
  default     = "aria_admin"
}

variable "min_acu" {
  description = "Serverless v2 minimum Aurora Capacity Units."
  type        = number
  default     = 0.5
}

variable "max_acu" {
  description = "Serverless v2 maximum Aurora Capacity Units."
  type        = number
  default     = 4
}

variable "instance_count" {
  description = "Number of cluster instances (1 = single writer; 2+ adds readers/HA)."
  type        = number
  default     = 1
}

variable "enable_proxy" {
  description = "Provision an RDS Proxy in front of the cluster (connection pooling)."
  type        = bool
  default     = true
}

variable "app_connection_limit" {
  description = "Prisma connection_limit appended to the app DATABASE_URL."
  type        = number
  default     = 5
}

variable "deletion_protection" {
  description = "Block accidental cluster deletion (enable in prod)."
  type        = bool
  default     = false
}

variable "skip_final_snapshot" {
  description = "Skip the final snapshot on destroy (true for ephemeral dev)."
  type        = bool
  default     = true
}

variable "backup_retention_days" {
  description = "Automated backup retention in days."
  type        = number
  default     = 7
}

variable "apply_immediately" {
  description = "Apply changes immediately instead of in the maintenance window."
  type        = bool
  default     = true
}

variable "tags" {
  description = "Tags applied to all resources."
  type        = map(string)
  default     = {}
}
