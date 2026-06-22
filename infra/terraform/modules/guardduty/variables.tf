variable "app_name" {
  description = "Application name used for naming and tagging"
  type        = string
  default     = "aria-evaluator"
}

variable "environment" {
  description = "Deployment environment"
  type        = string
}

variable "aws_region" {
  description = "AWS region where GuardDuty and Security Hub are enabled"
  type        = string
}

variable "alert_email" {
  description = "Email address to receive GuardDuty HIGH/CRITICAL and Security Hub HIGH/CRITICAL findings alerts. Leave empty to skip email subscription."
  type        = string
  default     = ""
}

variable "findings_retention_days" {
  description = "Number of days to retain GuardDuty findings in S3"
  type        = number
  default     = 90
}

# true  = run ALL enabled standards checks (slower apply but complete)
# false = subscribe but don't block apply on standard activation
variable "enable_securityhub_fsbp" {
  description = "Subscribe to AWS Foundational Security Best Practices standard"
  type        = bool
  default     = true
}

variable "enable_securityhub_cis" {
  description = "Subscribe to CIS AWS Foundations Benchmark v1.4.0"
  type        = bool
  default     = true
}

# AWS Config is an account/region singleton, so it lives in this account-level
# security module rather than any app stack. It powers the Security Hub FSBP/CIS
# controls (which cannot evaluate without it) and adds explicit drift rules for
# 0.0.0.0/0 SG ingress and auto-assigned ECS public IPs, routed to the alerts
# SNS topic. Recorder scope is kept narrow (SG + ECS service) to keep cost low.
variable "enable_aws_config" {
  description = "Enable AWS Config (recorder + delivery channel + drift rules + alerts). Account/region singleton — enable in exactly one stack per account+region."
  type        = bool
  default     = false
}

variable "config_authorized_public_tcp_ports" {
  description = "TCP ports allowed to be open to 0.0.0.0/0 without flagging the SG drift rule (e.g. the public ALB's 80/443). Any other port open to the world is reported NON_COMPLIANT."
  type        = string
  default     = "80,443"
}

variable "tags" {
  description = "Additional tags applied to all resources"
  type        = map(string)
  default     = {}
}
