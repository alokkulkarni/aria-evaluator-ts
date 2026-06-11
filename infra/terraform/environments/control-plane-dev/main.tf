data "aws_caller_identity" "current" {}
data "aws_region" "current" {}
data "aws_availability_zones" "available" { state = "available" }

locals {
  availability_zones = slice(data.aws_availability_zones.available.names, 0, 2)

  common_tags = merge(
    {
      ManagedBy            = "terraform"
      Project              = "aria-evaluator"
      Environment          = var.environment
      AppName              = var.app_name
      "aria:resource_type" = "platform"
    },
    {
      "aria:tenant_id"    = var.tenant_id
      "aria:pricing_tier" = var.pricing_tier
    },
  )
}

module "networking" {
  source = "../../modules/networking"

  app_name                = var.app_name
  environment             = var.environment
  vpc_cidr                = var.vpc_cidr
  public_subnet_cidrs     = var.public_subnet_cidrs
  private_subnets_enabled = true
  private_subnet_cidrs    = var.private_subnet_cidrs
  availability_zones      = local.availability_zones
  container_port          = var.container_port
  tenant_id               = var.tenant_id
  pricing_tier            = var.pricing_tier
  tags                    = local.common_tags
}

module "s3" {
  source = "../../modules/s3"

  app_name      = var.app_name
  environment   = var.environment
  bucket_suffix = var.bucket_suffix
  force_destroy = true
  tenant_id     = var.tenant_id
  pricing_tier  = var.pricing_tier
  tags          = local.common_tags
}

module "iam" {
  source = "../../modules/iam"

  app_name            = var.app_name
  environment         = var.environment
  state_bucket_arn    = module.s3.bucket_arn
  aws_region          = var.aws_region
  aws_account_id      = data.aws_caller_identity.current.account_id
  connect_instance_id = "*"
  tenant_id           = var.tenant_id
  pricing_tier        = var.pricing_tier
  tags                = local.common_tags
}

module "efs" {
  source = "../../modules/efs"

  app_name              = var.app_name
  environment           = var.environment
  tenant_id             = var.tenant_id
  pricing_tier          = var.pricing_tier
  vpc_id                = module.networking.vpc_id
  private_subnet_ids    = module.networking.private_subnet_ids
  ecs_security_group_id = module.networking.ecs_service_security_group_id
  kms_key_arn           = var.kms_key_arn
  tags                  = local.common_tags
}

module "alb" {
  source = "../../modules/alb"

  app_name                 = var.app_name
  environment              = var.environment
  vpc_id                   = module.networking.vpc_id
  public_subnet_ids        = module.networking.public_subnet_ids
  alb_security_group_id    = module.networking.alb_security_group_id
  container_port           = var.container_port
  internal                 = true
  log_bucket_suffix        = var.bucket_suffix
  acm_certificate_arn      = ""
  cloudfront_origin_secret = ""
  tenant_id                = var.tenant_id
  pricing_tier             = var.pricing_tier
  tags                     = local.common_tags
}

# ── SSM: publish internal URL ─────────────────────────────────────────────────
resource "aws_ssm_parameter" "control_plane_internal_url" {
  name  = "/aria/control-plane/${var.environment}/internal-url"
  type  = "String"
  value = "http://${module.alb.alb_dns_name}"

  tags = local.common_tags
}

# ── Secrets Manager: auto-generate internal shared secret ─────────────────────
resource "aws_secretsmanager_secret" "control_plane_internal_secret" {
  name                    = "/aria/control-plane/${var.environment}/internal-secret"
  description             = "Shared secret for CodeBuild → control-plane callback auth"
  recovery_window_in_days = 7

  tags = local.common_tags
}

resource "aws_secretsmanager_secret_version" "control_plane_internal_secret" {
  secret_id     = aws_secretsmanager_secret.control_plane_internal_secret.id
  secret_string = var.control_plane_internal_secret != "" ? var.control_plane_internal_secret : random_password.internal_secret.result
}

resource "random_password" "internal_secret" {
  length  = 48
  special = false
}

resource "aws_ssm_parameter" "control_plane_internal_secret_arn" {
  name  = "/aria/control-plane/${var.environment}/internal-secret-arn"
  type  = "String"
  value = aws_secretsmanager_secret.control_plane_internal_secret.arn

  tags = local.common_tags
}

module "ecs" {
  source = "../../modules/ecs"

  app_name                      = var.app_name
  environment                   = var.environment
  aws_region                    = var.aws_region
  app_image_uri                 = var.control_plane_image_uri
  container_port                = var.container_port
  cpu                           = var.cpu
  memory                        = var.memory
  desired_count                 = var.desired_count
  enable_autoscaling            = var.enable_autoscaling
  min_capacity                  = var.min_capacity
  max_capacity                  = var.max_capacity
  cpu_scale_target              = var.cpu_scale_target
  task_execution_role_arn       = module.iam.task_execution_role_arn
  task_role_arn                 = module.iam.task_role_arn
  public_subnet_ids             = module.networking.public_subnet_ids
  private_subnet_ids            = module.networking.private_subnet_ids
  ecs_service_security_group_id = module.networking.ecs_service_security_group_id
  target_group_arn              = module.alb.target_group_arn
  alb_listener_arn              = module.alb.listener_arn
  state_bucket_name             = module.s3.bucket_name
  s3_state_prefix               = var.s3_state_prefix
  s3_sync_interval_seconds      = 30
  log_retention_days            = var.log_retention_days
  extra_environment_vars = concat(
    [
      { name = "CONTROL_PLANE_PORT", value = tostring(var.container_port) },
      { name = "CONTROL_PLANE_STATE_DIR", value = "/app/state/control-plane" },
      { name = "CONTROL_PLANE_INTERNAL_URL", value = aws_ssm_parameter.control_plane_internal_url.value },
      { name = "CODEBUILD_AWS_REGION", value = var.aws_region },
      { name = "CONTROL_PLANE_SECRET_ARN", value = aws_secretsmanager_secret.control_plane_internal_secret.arn },
      { name = "CONTROL_PLANE_CORS_ORIGINS", value = join(",", var.allowed_origins) },
      { name = "USER_INSTANCE_TABLE", value = aws_dynamodb_table.user_instances.name },
    ],
    # Prefer the module-managed project name; fall back to the manual override variable
    local.codebuild_enabled ? [
      { name = "CODEBUILD_PROJECT_NAME", value = module.provisioning_codebuild[0].codebuild_project_name },
    ] : (var.codebuild_project_name != "" ? [{ name = "CODEBUILD_PROJECT_NAME", value = var.codebuild_project_name }] : []),
    var.instance_base_url != "" ? [
      { name = "CONTROL_PLANE_INSTANCE_BASE_URL", value = var.instance_base_url },
    ] : [],
  )
  extra_secrets = [
    {
      name      = "CONTROL_PLANE_INTERNAL_SECRET"
      valueFrom = aws_secretsmanager_secret.control_plane_internal_secret.arn
    },
  ]
  saas_mode    = false
  tenant_id    = var.tenant_id
  pricing_tier = var.pricing_tier
  tags         = local.common_tags
}

# ── Optional: per-tenant provisioning via CodeBuild ──────────────────────────
# Enabled when terraform_state_bucket is set. In plain dev the control plane
# uses instant-provisioning (no CodeBuild). Set these vars in terraform.tfvars
# when you want to exercise the full provisioning pipeline in dev.

locals {
  codebuild_enabled = var.terraform_state_bucket != "" && var.ecr_repository_url != ""
}

# Lightweight DynamoDB table for tracking provisioned instances (mirrors prod).
# Created unconditionally so the control-plane ECS task always has a table to write to.
resource "aws_dynamodb_table" "user_instances" {
  name         = "${var.app_name}-user-instances"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "userId"
  range_key    = "instanceId"

  attribute {
    name = "userId"
    type = "S"
  }

  attribute {
    name = "instanceId"
    type = "S"
  }

  tags = local.common_tags
}

module "provisioning_codebuild" {
  count  = local.codebuild_enabled ? 1 : 0
  source = "../../modules/provisioning-codebuild"

  app_name                    = var.app_name
  aws_region                  = var.aws_region
  aws_account_id              = data.aws_caller_identity.current.account_id
  terraform_state_bucket      = var.terraform_state_bucket
  terraform_state_bucket_arn  = "arn:aws:s3:::${var.terraform_state_bucket}"
  terraform_state_kms_key_arn = var.terraform_state_kms_key_arn
  terraform_state_lock_table  = var.terraform_state_lock_table
  user_instance_table_arn     = aws_dynamodb_table.user_instances.arn
  user_instance_table_name    = aws_dynamodb_table.user_instances.name
  ecr_repository_arn          = "arn:aws:ecr:${var.aws_region}:${data.aws_caller_identity.current.account_id}:repository/${var.app_name}"
  github_repo_url             = var.github_repo_url
  github_branch               = var.github_branch
  alert_email                 = var.alert_email

  tags = local.common_tags
}

# ── CloudTrail ────────────────────────────────────────────────────────────────
# Records all management API calls and S3 data events across the account.
# Dev: single-region trail, no Lambda data events, no Insights (cost savings).

module "cloudtrail" {
  source = "../../modules/cloudtrail"

  app_name       = var.app_name
  environment    = var.environment
  aws_region     = var.aws_region
  aws_account_id = data.aws_caller_identity.current.account_id
  bucket_suffix  = var.bucket_suffix
  kms_key_arn    = var.kms_key_arn

  is_multi_region               = false # dev: home region only
  include_global_service_events = true
  enable_log_file_validation    = true
  enable_s3_data_events         = true
  enable_lambda_data_events     = false
  enable_insight_events         = false

  enable_cloudwatch_logs        = true
  cloudwatch_log_retention_days = var.log_retention_days
  s3_log_retention_days         = 90 # dev: 3 months

  # No alarm SNS topic in dev — set var.cloudtrail_alert_sns_topic_arn to enable
  alert_sns_topic_arn = var.cloudtrail_alert_sns_topic_arn

  tags = local.common_tags
}
