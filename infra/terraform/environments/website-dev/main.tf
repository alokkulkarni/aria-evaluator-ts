data "aws_caller_identity" "current" {}
data "aws_region" "current" {}
data "aws_availability_zones" "available" { state = "available" }

locals {
  availability_zones = slice(data.aws_availability_zones.available.names, 0, 2)
  public_url         = "https://${module.frontend.cloudfront_domain_name}"

  common_tags = merge(
    var.tags,
    {
      "aria:region"        = data.aws_region.current.region
      "aria:pricing_track" = "platform"
    },
  )
}

# ── Auth Backend (ECS Fargate behind ALB) ─────────────────────────────────────

module "auth_backend" {
  source = "../../modules/website-auth"

  app_name    = "aria"
  environment = "dev"
  public_url  = local.public_url

  # Separate VPC for auth backend
  vpc_cidr            = "10.51.0.0/16"
  public_subnet_cidrs = ["10.51.1.0/24", "10.51.2.0/24"]
  availability_zones  = local.availability_zones

  # Dev: minimal sizing
  cpu           = 256
  memory        = 512
  desired_count = 1
  image_tag     = var.auth_backend_image_tag

  # OAuth credentials are NOT passed through Terraform.
  # Run: infra/scripts/bootstrap-oauth-secrets.sh dev
  # after the first terraform apply to populate credentials in Secrets Manager.

  control_plane_url  = var.control_plane_url
  log_retention_days = 14

  tags = local.common_tags
}

# ── Static Frontend (S3 + CloudFront) ─────────────────────────────────────────

module "frontend" {
  source = "../../modules/website-frontend"

  providers = {
    aws = aws.us_east_1
  }

  app_name    = "aria"
  environment = "dev"

  # No custom domain in dev — use CloudFront default URL
  domain_name     = ""
  route53_zone_id = ""

  # Wire auth backend ALB as second CloudFront origin
  auth_backend_alb_dns       = module.auth_backend.alb_dns_name
  auth_backend_origin_secret = module.auth_backend.origin_secret

  tags = local.common_tags
}

# ── CloudTrail ────────────────────────────────────────────────────────────────
# Records all management API calls for the website dev environment.
# Dev: single-region, no Insights, 90-day retention.

module "cloudtrail" {
  source = "../../modules/cloudtrail"

  app_name       = "aria-website"
  environment    = "dev"
  aws_region     = var.aws_region
  aws_account_id = data.aws_caller_identity.current.account_id
  bucket_suffix  = var.cloudtrail_bucket_suffix

  is_multi_region               = false
  include_global_service_events = true
  enable_log_file_validation    = true
  enable_s3_data_events         = true
  enable_lambda_data_events     = false
  enable_insight_events         = false
  enable_cloudwatch_logs        = true
  cloudwatch_log_retention_days = 14
  s3_log_retention_days         = 90
  kms_key_arn                   = ""
  alert_sns_topic_arn           = ""

  tags = local.common_tags
}
