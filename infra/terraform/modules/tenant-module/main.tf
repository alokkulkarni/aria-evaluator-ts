provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}

data "aws_caller_identity" "current" {}

data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  tier_config = {
    free                 = { cpu = 512, memory = 1024, log_retention = 30, private_subnets = false, efs = false, xray = false, xray_rate = 0.0, suspend_h = 1 }
    individual           = { cpu = 512, memory = 1024, log_retention = 30, private_subnets = false, efs = false, xray = false, xray_rate = 0.0, suspend_h = 3 }
    enterprise_starter   = { cpu = 1024, memory = 2048, log_retention = 90, private_subnets = true, efs = false, xray = true, xray_rate = 0.05, suspend_h = 3 }
    enterprise_pro       = { cpu = 2048, memory = 4096, log_retention = 180, private_subnets = true, efs = true, xray = true, xray_rate = 0.1, suspend_h = 3 }
    enterprise_unlimited = { cpu = 4096, memory = 8192, log_retention = 365, private_subnets = true, efs = true, xray = true, xray_rate = 0.1, suspend_h = 3 }
  }
  config                  = local.tier_config[var.pricing_tier]
  suspend_threshold       = var.suspend_threshold_hours_override > 0 ? var.suspend_threshold_hours_override : local.config.suspend_h
  log_retention_days      = var.log_retention_days_override > 0 ? var.log_retention_days_override : local.config.log_retention
  name_prefix             = "${var.app_name}-${var.environment}-${var.tenant_id}"
  availability_zones      = slice(data.aws_availability_zones.available.names, 0, length(var.public_subnet_cidrs))
  ecs_cluster_name        = "${local.name_prefix}-cluster"
  ecs_service_name        = "${local.name_prefix}-svc"
  composite_bucket_suffix = lower("${var.tenant_id}-${var.bucket_suffix}")
  common_tags = merge(
    var.tags,
    {
      ManagedBy            = "terraform"
      Project              = "aria-evaluator"
      Environment          = var.environment
      AppName              = var.app_name
      "aria:region"        = var.aws_region
      "aria:tenant_id"     = var.tenant_id
      "aria:pricing_tier"  = var.pricing_tier
      "aria:pricing_track" = var.pricing_track
    },
  )
}

resource "random_password" "cf_secret" {
  count = var.cloudfront_enabled ? 1 : 0

  length  = 32
  special = false
}

resource "aws_secretsmanager_secret" "cf_origin_secret" {
  count = var.cloudfront_enabled ? 1 : 0

  name       = "aria/${var.tenant_id}/cf-origin-secret"
  kms_key_id = var.kms_key_arn

  tags = merge(local.common_tags, {
    Name                 = "aria-${var.tenant_id}-cf-origin-secret"
    "aria:resource_type" = "security"
  })
}

resource "aws_secretsmanager_secret_version" "cf_origin_secret" {
  count = var.cloudfront_enabled ? 1 : 0

  secret_id     = aws_secretsmanager_secret.cf_origin_secret[0].id
  secret_string = random_password.cf_secret[0].result
}

module "networking" {
  source = "../networking"

  app_name                = var.app_name
  environment             = var.environment
  vpc_cidr                = var.vpc_cidr
  public_subnet_cidrs     = var.public_subnet_cidrs
  private_subnets_enabled = local.config.private_subnets
  private_subnet_cidrs    = var.private_subnet_cidrs
  availability_zones      = local.availability_zones
  tenant_id               = var.tenant_id
  pricing_tier            = var.pricing_tier
  tags                    = local.common_tags
}

module "s3" {
  source = "../s3"

  app_name           = var.app_name
  environment        = var.environment
  bucket_suffix      = local.composite_bucket_suffix
  force_destroy      = var.s3_force_destroy
  versioning_enabled = true
  tags = merge(local.common_tags, {
    "aria:resource_type" = "storage"
  })
}

module "iam" {
  source = "../iam"

  app_name            = var.app_name
  environment         = var.environment
  state_bucket_arn    = module.s3.bucket_arn
  aws_region          = var.aws_region
  aws_account_id      = data.aws_caller_identity.current.account_id
  connect_instance_id = var.connect_instance_id
  heartbeat_table_arn = var.heartbeat_table_arn
  secrets_arns        = compact(var.god_mode_secret_arn != "" ? [var.god_mode_secret_arn] : [])
  god_mode_secret_arn = var.god_mode_secret_arn
  tenant_id           = var.tenant_id
  pricing_tier        = var.pricing_tier
  tags = merge(local.common_tags, {
    "aria:resource_type" = "security"
  })
}

module "alb" {
  source = "../alb"

  app_name                   = var.app_name
  environment                = var.environment
  vpc_id                     = module.networking.vpc_id
  public_subnet_ids          = module.networking.public_subnet_ids
  alb_security_group_id      = module.networking.alb_security_group_id
  container_port             = 3001
  acm_certificate_arn        = var.acm_certificate_arn
  cloudfront_origin_secret   = var.cloudfront_enabled ? random_password.cf_secret[0].result : ""
  log_bucket_suffix          = local.composite_bucket_suffix
  log_bucket_force_destroy   = var.s3_force_destroy
  enable_deletion_protection = var.alb_enable_deletion_protection
  tenant_id                  = var.tenant_id
  pricing_tier               = var.pricing_tier
  tags = merge(local.common_tags, {
    "aria:resource_type" = "network"
  })
}

module "efs" {
  count  = local.config.efs ? 1 : 0
  source = "../efs"

  app_name              = var.app_name
  environment           = var.environment
  tenant_id             = var.tenant_id
  pricing_tier          = var.pricing_tier
  vpc_id                = module.networking.vpc_id
  private_subnet_ids    = module.networking.private_subnet_ids
  ecs_security_group_id = module.networking.ecs_service_security_group_id
  kms_key_arn           = var.kms_key_arn
  tags = merge(local.common_tags, {
    "aria:resource_type" = "storage"
  })
}

module "observability" {
  source = "../observability"

  app_name           = var.app_name
  environment        = var.environment
  tenant_id          = var.tenant_id
  pricing_tier       = var.pricing_tier
  log_retention_days = local.log_retention_days
  ecs_cluster_name   = local.ecs_cluster_name
  ecs_service_name   = local.ecs_service_name
  alb_arn_suffix     = module.alb.alb_arn_suffix
  alert_email        = var.alert_email
  xray_enabled       = local.config.xray
  xray_sampling_rate = local.config.xray_rate
  aws_region         = var.aws_region
  kms_key_arn        = var.kms_key_arn
  tags = merge(local.common_tags, {
    "aria:resource_type" = "observability"
  })
}

module "ecs" {
  source = "../ecs"

  app_name                           = var.app_name
  environment                        = var.environment
  aws_region                         = var.aws_region
  app_image_uri                      = var.app_image_uri
  container_port                     = 3001
  cpu                                = local.config.cpu
  memory                             = local.config.memory
  desired_count                      = 1
  enable_autoscaling                 = var.enable_autoscaling
  min_capacity                       = var.min_capacity
  max_capacity                       = var.max_capacity
  cpu_scale_target                   = var.cpu_scale_target
  task_execution_role_arn            = module.iam.task_execution_role_arn
  task_role_arn                      = module.iam.task_role_arn
  public_subnet_ids                  = module.networking.public_subnet_ids
  private_subnet_ids                 = module.networking.private_subnet_ids
  ecs_service_security_group_id      = module.networking.ecs_service_security_group_id
  target_group_arn                   = module.alb.target_group_arn
  alb_listener_arn                   = module.alb.listener_arn
  state_bucket_name                  = module.s3.bucket_name
  s3_state_prefix                    = var.tenant_id
  s3_sync_interval_seconds           = 30
  log_retention_days                 = local.log_retention_days
  app_log_group_name                 = module.observability.app_log_group_name
  app_log_group_arn                  = module.observability.app_log_group_arn
  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200
  tenant_id                          = var.tenant_id
  pricing_tier                       = var.pricing_tier
  efs_file_system_id                 = local.config.efs ? module.efs[0].file_system_id : ""
  efs_access_point_id                = local.config.efs ? module.efs[0].access_point_id : ""
  heartbeat_table_name               = var.heartbeat_table_name
  god_mode_enabled                   = var.god_mode_enabled
  god_mode_secret_arn                = var.god_mode_secret_arn
  control_plane_internal_url         = var.control_plane_internal_url
  control_plane_internal_secret      = var.control_plane_internal_secret
  website_url                        = var.website_url
  extra_environment_vars             = var.extra_environment_vars
  tags = merge(local.common_tags, {
    "aria:resource_type" = "compute"
  })
}

module "suspend_lambda" {
  source = "../suspend-lambda"

  app_name                = var.app_name
  environment             = var.environment
  tenant_id               = var.tenant_id
  pricing_tier            = var.pricing_tier
  heartbeat_table_arn     = var.heartbeat_table_arn
  heartbeat_table_name    = var.heartbeat_table_name
  ecs_cluster_arn         = module.ecs.cluster_arn
  ecs_cluster_name        = module.ecs.cluster_name
  ecs_service_name        = module.ecs.service_name
  suspend_threshold_hours = local.suspend_threshold
  alert_email             = var.alert_email
  control_plane_role_arn  = var.control_plane_role_arn
  aws_region              = var.aws_region
  kms_key_arn             = var.kms_key_arn
  tags = merge(local.common_tags, {
    "aria:resource_type" = "serverless"
  })
}

module "waf" {
  count  = var.cloudfront_enabled && var.waf_enabled ? 1 : 0
  source = "../waf"

  providers = {
    aws.us_east_1 = aws.us_east_1
  }

  app_name            = var.app_name
  environment         = var.environment
  tenant_id           = var.tenant_id
  pricing_tier        = var.pricing_tier
  rate_limit_requests = 1000
  log_retention_days  = contains(["enterprise_starter", "enterprise_pro", "enterprise_unlimited"], var.pricing_tier) ? 90 : 30
  tags = merge(local.common_tags, {
    "aria:resource_type" = "security"
  })
}

module "cloudfront" {
  count  = var.cloudfront_enabled ? 1 : 0
  source = "../cloudfront"

  app_name                 = var.app_name
  environment              = var.environment
  alb_dns_name             = module.alb.alb_dns_name
  price_class              = "PriceClass_100"
  acm_certificate_arn      = var.cloudfront_acm_certificate_arn
  aliases                  = []
  cloudfront_origin_secret = random_password.cf_secret[0].result
  waf_web_acl_arn          = var.waf_enabled ? module.waf[0].web_acl_arn : ""
  tenant_id                = var.tenant_id
  pricing_tier             = var.pricing_tier
  saas_mode                = true
  main_website_url         = var.main_website_url
  tags = merge(local.common_tags, {
    "aria:resource_type" = "network"
  })
}
