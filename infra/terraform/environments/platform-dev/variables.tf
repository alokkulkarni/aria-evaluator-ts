variable "aws_region" {
  description = "AWS region."
  type        = string
  default     = "eu-west-2"
}

variable "app_name" {
  description = "Application name prefix."
  type        = string
  default     = "aria-evaluator"
}

variable "environment" {
  description = "Environment label (dev/staging/prod)."
  type        = string
  default     = "dev"
}

variable "domain" {
  description = "Base domain for tenant subdomains (e.g. dev.aria-evaluator.app)."
  type        = string
}

variable "route53_zone_id" {
  description = "Route53 hosted zone id for the domain (empty to skip the wildcard record)."
  type        = string
  default     = ""
}

variable "acm_certificate_arn" {
  description = "Wildcard ACM certificate ARN (*.<domain>)."
  type        = string
}

variable "app_image_uri" {
  description = "ECR image URI for the evaluator app."
  type        = string
}

variable "control_plane_role_name" {
  description = "Control-plane task role name to grant wake permission (empty to skip)."
  type        = string
  default     = ""
}

variable "control_plane_internal_url" {
  description = "Internal control-plane URL for SSO verification."
  type        = string
  default     = ""
}

variable "website_url" {
  description = "Marketing website URL."
  type        = string
  default     = ""
}
