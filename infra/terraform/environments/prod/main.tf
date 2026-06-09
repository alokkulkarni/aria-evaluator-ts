data "aws_caller_identity" "current" {}

locals {
  repo_root = abspath("${path.module}/../../../..")
  # Use pre-built image URI from CI/CD if provided, otherwise build locally
  use_prebuilt = var.image_uri != ""
  resolved_image_uri = local.use_prebuilt ? var.image_uri : module.docker_build[0].image_uri
}

# ── Build & push evaluator Docker image to ECR ────────────────────────────────
# Skipped when image_uri is provided (CI/CD pre-built image)

module "docker_build" {
  count  = local.use_prebuilt ? 0 : 1
  source = "../../modules/docker-build-push"

  ecr_repository_url = var.ecr_repository_url
  image_tag          = var.image_tag
  dockerfile         = "Dockerfile"
  build_context      = local.repo_root
  aws_region         = var.aws_region
  force_rebuild      = var.force_rebuild
}

module "tenant" {
  source = "../../modules/tenant-module"

  app_name                         = var.app_name
  environment                      = var.environment
  tenant_id                        = var.tenant_id
  pricing_tier                     = var.pricing_tier
  pricing_track                    = var.pricing_track
  aws_region                       = var.aws_region
  app_image_uri                    = local.resolved_image_uri
  acm_certificate_arn              = var.acm_certificate_arn
  cloudfront_acm_certificate_arn   = var.cloudfront_acm_certificate_arn
  vpc_cidr                         = var.vpc_cidr
  public_subnet_cidrs              = var.public_subnet_cidrs
  private_subnet_cidrs             = var.private_subnet_cidrs
  bucket_suffix                    = var.bucket_suffix
  heartbeat_table_arn              = var.heartbeat_table_arn
  heartbeat_table_name             = var.heartbeat_table_name
  kms_key_arn                      = var.kms_key_arn
  god_mode_enabled                 = var.god_mode_enabled
  god_mode_secret_arn              = var.god_mode_secret_arn
  alert_email                      = var.alert_email
  control_plane_role_arn           = var.control_plane_role_arn
  suspend_threshold_hours_override = var.suspend_threshold_hours_override
  connect_instance_id              = var.connect_instance_id
  cloudfront_enabled               = var.cloudfront_enabled
  waf_enabled                      = var.waf_enabled
  log_retention_days_override      = var.log_retention_days_override
  control_plane_internal_url       = var.control_plane_internal_url
  control_plane_internal_secret    = var.control_plane_internal_secret
  website_url                      = var.website_url
  tags                             = var.tags
}

# ── CloudTrail ────────────────────────────────────────────────────────────────
# Records evaluator management API calls and data events across all regions.
# Use a tenant-qualified app name so per-tenant prod stacks do not collide.

module "cloudtrail" {
  source = "../../modules/cloudtrail"

  app_name       = "${var.app_name}-${var.tenant_id}"
  environment    = var.environment
  aws_region     = var.aws_region
  aws_account_id = data.aws_caller_identity.current.account_id
  bucket_suffix  = var.bucket_suffix
  kms_key_arn    = var.kms_key_arn

  is_multi_region               = true
  include_global_service_events = true
  enable_log_file_validation    = true
  enable_s3_data_events         = true
  enable_lambda_data_events     = true
  enable_insight_events         = true
  enable_cloudwatch_logs        = true
  cloudwatch_log_retention_days = 90
  s3_log_retention_days         = 365
  alert_sns_topic_arn           = module.tenant.sns_topic_arn

  tags = var.tags
}
