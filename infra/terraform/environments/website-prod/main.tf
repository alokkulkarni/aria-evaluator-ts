data "aws_caller_identity" "current" {}
data "aws_region" "current" {}
data "aws_availability_zones" "available" { state = "available" }

locals {
  availability_zones = slice(data.aws_availability_zones.available.names, 0, 3)
  public_url         = var.domain_name != "" ? "https://${var.domain_name}" : "https://${module.frontend.cloudfront_domain_name}"

  common_tags = merge(
    var.tags,
    {
      "aria:region"        = data.aws_region.current.name
      "aria:pricing_track" = "platform"
    },
  )
}

# ── Auth Backend (ECS Fargate behind ALB) ─────────────────────────────────────

module "auth_backend" {
  source = "../../modules/website-auth"

  app_name    = "aria"
  environment = "prod"
  public_url  = local.public_url

  # Separate VPC for auth backend
  vpc_cidr            = "10.61.0.0/16"
  public_subnet_cidrs = ["10.61.1.0/24", "10.61.2.0/24", "10.61.3.0/24"]
  availability_zones  = local.availability_zones

  # Auth backend is lightweight — 0.25 vCPU, 512 MiB, 2 replicas for HA
  cpu           = 256
  memory        = 512
  desired_count = 2
  image_tag     = var.auth_backend_image_tag

  # Auth secrets
  nextauth_secret      = var.nextauth_secret
  google_client_id     = var.google_client_id
  google_client_secret = var.google_client_secret
  github_client_id     = var.github_client_id
  github_client_secret = var.github_client_secret

  control_plane_url         = var.control_plane_url
  log_retention_days        = 90
  enable_container_insights = true

  tags = local.common_tags
}

# ── Static Frontend (S3 + CloudFront) ─────────────────────────────────────────

module "frontend" {
  source = "../../modules/website-frontend"

  providers = {
    aws = aws.us_east_1
  }

  app_name    = "aria"
  environment = "prod"

  # Domain & TLS
  domain_name                    = var.domain_name
  route53_zone_id                = var.route53_zone_id
  acm_certificate_arn_cloudfront = var.acm_certificate_arn_us_east_1

  # Wire auth backend ALB as second CloudFront origin
  auth_backend_alb_dns       = module.auth_backend.alb_dns_name
  auth_backend_origin_secret = module.auth_backend.origin_secret

  waf_rate_limit = 2000

  tags = local.common_tags
}

# ── CloudTrail ────────────────────────────────────────────────────────────────
# Records all management API calls and data events across ALL AWS regions.
# Prod: multi-region, Insights, 1-year retention, full CIS alarms.

module "cloudtrail" {
  source = "../../modules/cloudtrail"

  app_name       = "aria-website"
  environment    = "prod"
  aws_region     = var.aws_region
  aws_account_id = data.aws_caller_identity.current.account_id
  bucket_suffix  = var.cloudtrail_bucket_suffix

  is_multi_region               = true
  include_global_service_events = true
  enable_log_file_validation    = true
  enable_s3_data_events         = true
  enable_lambda_data_events     = true
  enable_insight_events         = true
  enable_cloudwatch_logs        = true
  cloudwatch_log_retention_days = 90
  s3_log_retention_days         = 365
  kms_key_arn                   = var.cloudtrail_kms_key_arn

  # Re-use the existing alarm SNS topic already declared in this environment
  alert_sns_topic_arn = var.alarm_sns_topic_arn

  tags = local.common_tags
}
