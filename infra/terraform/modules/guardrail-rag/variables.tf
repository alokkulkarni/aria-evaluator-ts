variable "enabled" {
  description = "Create the crawler Lambda + schedule. Default off — flip on once a Lambda bundle exists and VPC egress (NAT or VPC endpoints) is in place."
  type        = bool
  default     = false
}

variable "app_name" {
  type    = string
  default = "aria-evaluator"
}

variable "environment" {
  type = string
}

variable "bedrock_region" {
  description = "Region used for Titan embeddings (BEDROCK_REGION env)."
  type        = string
  default     = "eu-west-2"
}

variable "database_url_secret_arn" {
  description = "Secrets Manager ARN holding the Prisma DATABASE_URL the crawler upserts into."
  type        = string
}

variable "subnet_ids" {
  description = "Private subnet IDs the Lambda runs in (must reach the database AND have egress to Bedrock + doc URLs via NAT/VPC endpoints)."
  type        = list(string)
}

variable "security_group_ids" {
  description = "Security groups for the Lambda — must be allowed into the database SG (use the ECS service SG)."
  type        = list(string)
}

variable "lambda_package_path" {
  description = "Path to the built Lambda bundle dir (zipped at apply). Defaults to lambda/guardrail-doc-crawler/dist relative to this module."
  type        = string
  default     = ""
}

variable "schedule_expression" {
  description = "EventBridge schedule. Default: weekly, Sunday 02:00 UTC."
  type        = string
  default     = "cron(0 2 ? * SUN *)"
}

variable "log_retention_days" {
  type    = number
  default = 30
}

variable "lambda_memory_size" {
  type    = number
  default = 512
}

variable "lambda_timeout" {
  description = "Crawl can be slow (fetch + embed many chunks)."
  type        = number
  default     = 300
}

variable "tags" {
  type    = map(string)
  default = {}
}
