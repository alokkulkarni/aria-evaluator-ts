variable "app_name" {
  description = "Application name — used as a prefix for all resource names"
  type        = string
}

variable "environment" {
  description = "Deployment environment (dev, prod, etc.)"
  type        = string
}

variable "aws_region" {
  description = "AWS region where the trail is deployed"
  type        = string
}

variable "aws_account_id" {
  description = "AWS account ID — used to scope bucket and KMS policies"
  type        = string
}

variable "bucket_suffix" {
  description = "Short unique suffix for the CloudTrail S3 bucket name (e.g. last 6 digits of account ID)"
  type        = string
}

# ── Trail scope ───────────────────────────────────────────────────────────────

variable "is_multi_region" {
  description = <<-EOT
    When true the trail captures events from all AWS regions.
    Set to true for prod (full audit coverage) and false for dev (cost savings).
  EOT
  type        = bool
  default     = true
}

variable "include_global_service_events" {
  description = "Capture IAM, STS, and other global service API calls (always recommended)"
  type        = bool
  default     = true
}

variable "enable_log_file_validation" {
  description = "Enable CloudTrail log file integrity validation (SHA-256 digest files)"
  type        = bool
  default     = true
}

# ── Data events ───────────────────────────────────────────────────────────────

variable "enable_s3_data_events" {
  description = "Record S3 object-level API calls (GetObject, PutObject, DeleteObject) for all buckets"
  type        = bool
  default     = true
}

variable "enable_lambda_data_events" {
  description = "Record Lambda function invocations"
  type        = bool
  default     = false
}

# ── Insight events ────────────────────────────────────────────────────────────

variable "enable_insight_events" {
  description = "Enable CloudTrail Insights to detect unusual API activity patterns"
  type        = bool
  default     = false
}

# ── Encryption ────────────────────────────────────────────────────────────────

variable "kms_key_arn" {
  description = "KMS key ARN for encrypting CloudTrail logs at rest. Leave empty to use SSE-S3 (AES256)."
  type        = string
  default     = ""
}

# ── Log retention ─────────────────────────────────────────────────────────────

variable "s3_log_retention_days" {
  description = "Days after which CloudTrail log files are expired from S3 (0 = never expire)"
  type        = number
  default     = 365
}

variable "cloudwatch_log_retention_days" {
  description = "Days to retain CloudTrail logs in the CloudWatch log group (for alerting)"
  type        = number
  default     = 90
}

# ── CloudWatch integration ────────────────────────────────────────────────────

variable "enable_cloudwatch_logs" {
  description = "Deliver CloudTrail events to a CloudWatch Logs group (enables metric filters and alarms)"
  type        = bool
  default     = true
}

# ── Alerting ──────────────────────────────────────────────────────────────────

variable "alert_sns_topic_arn" {
  description = "SNS topic ARN for security alarms. Leave empty to skip alarm creation."
  type        = string
  default     = ""
}

variable "enable_cis_alarms" {
  description = "Create CIS CloudWatch metric filters and alarms. Must be set to true explicitly (known at plan time) alongside a non-empty alert_sns_topic_arn."
  type        = bool
  default     = false
}

variable "tags" {
  description = "Additional tags applied to all resources"
  type        = map(string)
  default     = {}
}
