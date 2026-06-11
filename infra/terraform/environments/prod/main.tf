data "aws_caller_identity" "current" {}

locals {
  repo_root = abspath("${path.module}/../../../..")
  # Use pre-built image URI from CI/CD if provided, otherwise build locally
  use_prebuilt = var.image_uri != ""

  # ECR repository enforces immutable tags. If the default "latest" tag is left
  # in tfvars, derive a deterministic content tag to avoid overwrite failures.
  default_local_image_tag = format(
    "tf-%s",
    substr(
      sha1(join("|", [
        filesha1("${local.repo_root}/Dockerfile"),
        fileexists("${local.repo_root}/package-lock.json") ? filesha1("${local.repo_root}/package-lock.json") : "none",
        tostring(var.force_rebuild),
      ])),
      0,
      12,
    ),
  )
  effective_image_tag = var.image_tag == "latest" ? local.default_local_image_tag : var.image_tag

  resolved_image_uri = local.use_prebuilt ? var.image_uri : module.docker_build[0].image_uri
}

# ── Build & push evaluator Docker image to ECR ────────────────────────────────
# Skipped when image_uri is provided (CI/CD pre-built image)

module "docker_build" {
  count  = local.use_prebuilt ? 0 : 1
  source = "../../modules/docker-build-push"

  ecr_repository_url = var.ecr_repository_url
  image_tag          = local.effective_image_tag
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
  s3_force_destroy                 = var.s3_force_destroy
  alb_enable_deletion_protection   = var.alb_enable_deletion_protection
  log_retention_days_override      = var.log_retention_days_override
  control_plane_internal_url       = var.control_plane_internal_url
  control_plane_internal_secret    = var.control_plane_internal_secret
  website_url                      = var.website_url
  enable_autoscaling               = var.enable_autoscaling
  min_capacity                     = var.min_capacity
  max_capacity                     = var.max_capacity
  cpu_scale_target                 = var.cpu_scale_target

  # Pass Redis connection info from redis.tf and optional plan limit overrides
  extra_environment_vars = concat(
    [
      {
        name  = "REDIS_HOST"
        value = module.redis.endpoint_address
      },
      {
        name  = "REDIS_PORT"
        value = tostring(module.redis.endpoint_port)
      },
      {
        name  = "REDIS_DB"
        value = "0"
      },
    ],
    var.max_runs_per_month != "" ? [{ name = "MAX_RUNS_PER_MONTH", value = var.max_runs_per_month }] : [],
    var.max_scenarios_per_run != "" ? [{ name = "MAX_SCENARIOS_PER_RUN", value = var.max_scenarios_per_run }] : [],
    var.max_models != "" ? [{ name = "MAX_MODELS", value = var.max_models }] : [],
    var.max_users != "" ? [{ name = "MAX_USERS", value = var.max_users }] : [],
  )

  tags = var.tags
}

# ── CloudTrail ────────────────────────────────────────────────────────────────
# Records evaluator management API calls and data events across all regions.
# Use a tenant-qualified app name so per-tenant prod stacks do not collide.

module "cloudtrail" {
  count  = var.cloudtrail_enabled ? 1 : 0
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
  enable_cis_alarms             = var.alert_email != ""

  tags = var.tags
}
