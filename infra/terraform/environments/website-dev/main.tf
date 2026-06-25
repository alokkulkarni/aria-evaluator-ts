data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  common_tags = merge(
    var.tags,
    {
      "aria:region"        = data.aws_region.current.region
      "aria:pricing_track" = "platform"
    },
  )
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

  force_destroy = var.force_destroy

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
  force_destroy                 = var.force_destroy

  tags = local.common_tags
}
