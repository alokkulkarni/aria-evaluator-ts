# ── Data sources ──────────────────────────────────────────────────────────────

data "aws_caller_identity" "current" {}

data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_region" "current" {}

locals {
  aws_account_id     = data.aws_caller_identity.current.account_id
  availability_zones = slice(data.aws_availability_zones.available.names, 0, length(var.public_subnet_cidrs))
  # Enrich caller-supplied var.tags with region and pricing_track for every module call.
  common_tags = merge(
    var.tags,
    {
      "aria:region"        = data.aws_region.current.region
      "aria:pricing_track" = var.pricing_track
    },
  )
}

# ── Networking ────────────────────────────────────────────────────────────────

module "networking" {
  source = "../../modules/networking"

  app_name            = var.app_name
  environment         = var.environment
  vpc_cidr            = var.vpc_cidr
  public_subnet_cidrs = var.public_subnet_cidrs
  availability_zones  = local.availability_zones
  container_port      = var.container_port
  tenant_id           = var.tenant_id
  pricing_tier        = var.pricing_tier
  tags                = local.common_tags
}

# ── ECR ───────────────────────────────────────────────────────────────────────

module "ecr" {
  source = "../../modules/ecr"

  app_name     = var.app_name
  environment  = var.environment
  scan_on_push = false # dev: skip scanning to keep iteration fast
  tags         = local.common_tags
}

# ── S3 State Bucket ───────────────────────────────────────────────────────────

module "s3" {
  source = "../../modules/s3"

  app_name      = var.app_name
  environment   = var.environment
  bucket_suffix = var.bucket_suffix
  force_destroy = true # dev: allow clean teardown
  tenant_id     = var.tenant_id
  pricing_tier  = var.pricing_tier
  tags          = local.common_tags
}

# ── IAM ───────────────────────────────────────────────────────────────────────

module "iam" {
  source = "../../modules/iam"

  app_name            = var.app_name
  environment         = var.environment
  state_bucket_arn    = module.s3.bucket_arn
  aws_region          = var.aws_region
  aws_account_id      = local.aws_account_id
  connect_instance_id = var.connect_instance_id
  tenant_id           = var.tenant_id
  pricing_tier        = var.pricing_tier
  tags                = local.common_tags
}

# ── ALB ───────────────────────────────────────────────────────────────────────

module "alb" {
  source = "../../modules/alb"

  app_name              = var.app_name
  environment           = var.environment
  vpc_id                = module.networking.vpc_id
  public_subnet_ids     = module.networking.public_subnet_ids
  alb_security_group_id = module.networking.alb_security_group_id
  container_port        = var.container_port
  log_bucket_suffix     = var.bucket_suffix
  # No HTTPS cert or CloudFront origin protection in dev
  acm_certificate_arn      = ""
  cloudfront_origin_secret = ""
  tenant_id                = var.tenant_id
  pricing_tier             = var.pricing_tier
  tags                     = local.common_tags
}

# ── ECS ───────────────────────────────────────────────────────────────────────

module "ecs" {
  source = "../../modules/ecs"

  app_name                      = var.app_name
  environment                   = var.environment
  aws_region                    = var.aws_region
  app_image_uri                 = var.app_image_uri
  container_port                = var.container_port
  cpu                           = var.cpu
  memory                        = var.memory
  desired_count                 = var.desired_count
  task_execution_role_arn       = module.iam.task_execution_role_arn
  task_role_arn                 = module.iam.task_role_arn
  public_subnet_ids             = module.networking.public_subnet_ids
  ecs_service_security_group_id = module.networking.ecs_service_security_group_id
  target_group_arn              = module.alb.target_group_arn
  alb_listener_arn              = module.alb.listener_arn
  state_bucket_name             = module.s3.bucket_name
  s3_state_prefix               = var.s3_state_prefix
  s3_sync_interval_seconds      = var.s3_sync_interval_seconds
  log_retention_days            = var.log_retention_days
  extra_environment_vars        = var.extra_environment_vars
  saas_mode                     = false # dev is always standalone
  tenant_id                     = var.tenant_id
  pricing_tier                  = var.pricing_tier
  control_plane_internal_url    = var.control_plane_internal_url
  control_plane_internal_secret = var.control_plane_internal_secret
  website_url                   = var.website_url
  tags                          = local.common_tags
}

# ── Bedrock Lambda ────────────────────────────────────────────────────────────

module "bedrock_lambda" {
  source = "../../modules/bedrock-lambda"

  enabled     = var.bedrock_lambda_enabled
  app_name    = var.app_name
  environment = var.environment

  bedrock_model_id = var.bedrock_model_id
  bedrock_region   = var.bedrock_region
  system_prompt    = var.bedrock_system_prompt
  allowed_origins  = var.bedrock_allowed_origins

  lambda_memory_size = var.bedrock_lambda_memory_size
  lambda_timeout     = var.bedrock_lambda_timeout
  log_retention_days = var.log_retention_days

  tenant_id    = var.tenant_id
  pricing_tier = var.pricing_tier
  tags         = local.common_tags
}

# ── CloudFront ────────────────────────────────────────────────────────────────

module "cloudfront" {
  source = "../../modules/cloudfront"

  app_name            = var.app_name
  environment         = var.environment
  alb_dns_name        = module.alb.alb_dns_name
  price_class         = var.cloudfront_price_class
  acm_certificate_arn = var.acm_certificate_arn
  aliases             = var.cloudfront_aliases
  # No WAF or CloudFront origin protection in dev
  waf_web_acl_arn          = ""
  cloudfront_origin_secret = ""
  tenant_id                = var.tenant_id
  pricing_tier             = var.pricing_tier
  tags                     = local.common_tags
}

# ── CloudTrail ────────────────────────────────────────────────────────────────
# Records evaluator management API calls and S3 data events in the dev account.
# Dev stays single-region and skips Insights/Lambda data events to control cost.

module "cloudtrail" {
  source = "../../modules/cloudtrail"

  app_name       = var.app_name
  environment    = var.environment
  aws_region     = var.aws_region
  aws_account_id = local.aws_account_id
  bucket_suffix  = var.bucket_suffix

  is_multi_region               = false
  include_global_service_events = true
  enable_log_file_validation    = true
  enable_s3_data_events         = true
  enable_lambda_data_events     = false
  enable_insight_events         = false
  enable_cloudwatch_logs        = true
  cloudwatch_log_retention_days = var.log_retention_days
  s3_log_retention_days         = 90
  alert_sns_topic_arn           = ""

  tags = local.common_tags
}
