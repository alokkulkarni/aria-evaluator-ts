# ── evaluator-prod ────────────────────────────────────────────────────────────
# Pooled multi-tenant evaluator (single shared deployment; row-level tenantId
# isolation via TENANT_SCOPING_MODE=enforce). Mirrors `dev` with prod hardening
# and auto-wiring to control-plane-prod over SSM (no manual config).
#
# APPLY ORDER: control-plane-prod FIRST (publishes /aria/control-plane/prod/
# internal-url + internal-secret-arn to SSM, which the data sources below read),
# THEN evaluator-prod. evaluator-prod publishes /aria/evaluator/prod/instance-url
# which control-plane-prod consumes for its tenant SSO redirect base URL.
# The evaluator↔control-plane network path (the SSO verify call to the internal
# control-plane ALB) is established by the connectivity-prod stack (applied last).

# ── Data sources ──────────────────────────────────────────────────────────────

data "aws_caller_identity" "current" {}

data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_region" "current" {}

# Control-plane discovery (published by control-plane-prod). Requires that stack
# to be applied first — one-directional, no cycle.
data "aws_ssm_parameter" "control_plane_internal_url" {
  name = "/aria/control-plane/${var.environment}/internal-url"
}

data "aws_ssm_parameter" "control_plane_internal_secret_arn" {
  name = "/aria/control-plane/${var.environment}/internal-secret-arn"
}

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

  # The control-plane shared-secret ARN (a Secrets Manager ARN, published as an
  # SSM String param by control-plane-prod). Injected into the evaluator task as
  # an ECS secret so /auth/sso → /auth/verify-sso-token can authenticate.
  control_plane_internal_secret_arn = data.aws_ssm_parameter.control_plane_internal_secret_arn.value

  # ── Multi-judge committee / calibration config (Phase 1–5) ──────────────────
  # All optional — empty values are omitted, so the app's committee/calibration
  # defaults apply unless explicitly overridden here.
  judge_environment_vars = concat(
    var.judge_committee != "" ? [{ name = "JUDGE_COMMITTEE", value = var.judge_committee }] : [],
    var.judge_disagreement_threshold != "" ? [{ name = "JUDGE_DISAGREEMENT_THRESHOLD", value = var.judge_disagreement_threshold }] : [],
    var.judge_weighting_enabled != "" ? [{ name = "JUDGE_WEIGHTING_ENABLED", value = var.judge_weighting_enabled }] : [],
    var.judge_kappa_trusted != "" ? [{ name = "JUDGE_KAPPA_TRUSTED", value = var.judge_kappa_trusted }] : [],
    var.judge_kappa_min != "" ? [{ name = "JUDGE_KAPPA_MIN", value = var.judge_kappa_min }] : [],
    var.judge_calibration_min_samples != "" ? [{ name = "JUDGE_CALIBRATION_MIN_SAMPLES", value = var.judge_calibration_min_samples }] : [],
    var.max_judges != "" ? [{ name = "MAX_JUDGES", value = var.max_judges }] : [],
    var.openai_base_url != "" ? [{ name = "OPENAI_BASE_URL", value = var.openai_base_url }] : [],
    var.azure_openai_endpoint != "" ? [{ name = "AZURE_OPENAI_ENDPOINT", value = var.azure_openai_endpoint }] : [],
    var.azure_openai_api_version != "" ? [{ name = "AZURE_OPENAI_API_VERSION", value = var.azure_openai_api_version }] : [],
  )

  # Cross-vendor judge provider API keys from Secrets Manager (values never enter
  # TF state). Injected as container secrets at task start.
  judge_secrets = concat(
    var.openai_api_key_secret_arn != "" ? [{ name = "OPENAI_API_KEY", valueFrom = var.openai_api_key_secret_arn }] : [],
    var.azure_openai_api_key_secret_arn != "" ? [{ name = "AZURE_OPENAI_API_KEY", valueFrom = var.azure_openai_api_key_secret_arn }] : [],
    var.anthropic_api_key_secret_arn != "" ? [{ name = "ANTHROPIC_API_KEY", valueFrom = var.anthropic_api_key_secret_arn }] : [],
    var.gemini_api_key_secret_arn != "" ? [{ name = "GEMINI_API_KEY", valueFrom = var.gemini_api_key_secret_arn }] : [],
  )
  judge_secret_arns = [for s in local.judge_secrets : s.valueFrom]
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

# ── S3 Gateway VPC Endpoint (free egress hardening) ───────────────────────────
# Routes the VPC's S3 traffic — which includes ECR image-layer blob downloads,
# since ECR stores layers in S3 — through a private gateway endpoint instead of
# the Fargate task's public IP + IGW. Gateway endpoints are free and shrink the
# public-internet egress surface even while tasks stay in public subnets
# (Option A). The genuinely-external LLM traffic (OpenAI/Anthropic/Gemini) and
# the ECR API / Secrets Manager / Bedrock interface endpoints are the *paid*
# next step, deferred to Option B/C (see docs/ARCHITECTURE.md → egress roadmap).
# Defined here (not via the networking module's private-subnet endpoints) so it
# applies without flipping the env to private subnets / NAT.
resource "aws_vpc_endpoint" "s3" {
  vpc_id            = module.networking.vpc_id
  service_name      = "com.amazonaws.${data.aws_region.current.region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = [module.networking.public_route_table_id]

  tags = merge(local.common_tags, {
    Name = "${var.app_name}-${var.environment}-s3-endpoint"
  })
}

# ── Aurora Serverless v2 (PostgreSQL) ─────────────────────────────────────────
# Shared pooled DB — row-level tenantId isolation is the multi-tenant model.
module "aurora" {
  source = "../../modules/aurora"

  environment                = var.environment
  vpc_id                     = module.networking.vpc_id
  subnet_ids                 = module.networking.public_subnet_ids
  allowed_security_group_ids = [module.networking.ecs_service_security_group_id]
  min_acu                    = var.aurora_min_acu
  max_acu                    = var.aurora_max_acu
  enable_proxy               = false # connect direct; revisit RDS Proxy if connection count grows
  deletion_protection        = true  # prod: guard against accidental DB deletion
  skip_final_snapshot        = false # prod: always take a final snapshot on destroy
  tags                       = local.common_tags
}

# ── ECR ───────────────────────────────────────────────────────────────────────

module "ecr" {
  source = "../../modules/ecr"

  app_name     = var.app_name
  environment  = var.environment
  scan_on_push = true # prod: scan images for vulnerabilities on push
  force_delete = var.force_destroy
  tags         = local.common_tags
}

# ── S3 State Bucket ───────────────────────────────────────────────────────────

module "s3" {
  source = "../../modules/s3"

  app_name      = var.app_name
  environment   = var.environment
  bucket_suffix = var.bucket_suffix
  force_destroy = var.force_destroy
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
  # Execution role reads (at task start): judge API keys, the Aurora DATABASE_URL
  # secret, and the control-plane shared secret (for SSO verify).
  secrets_arns = local.judge_secret_arns
  execution_secret_arns = concat(
    local.judge_secret_arns,
    [module.aurora.database_url_secret_arn, local.control_plane_internal_secret_arn],
  )
  tags = local.common_tags
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
  # TLS is terminated at CloudFront (default *.cloudfront.net cert). The ALB is the
  # CloudFront origin and is locked to it via the shared origin secret header.
  log_bucket_force_destroy = var.force_destroy
  acm_certificate_arn      = ""
  cloudfront_origin_secret = random_password.cloudfront_origin_secret.result
  tenant_id                = var.tenant_id
  pricing_tier             = var.pricing_tier
  tags                     = local.common_tags
}

# Shared secret header so only CloudFront (not the public ALB DNS directly) can
# reach the origin. Generated here, passed to both the ALB listener rule and the
# CloudFront origin custom header — no manual configuration.
resource "random_password" "cloudfront_origin_secret" {
  length  = 48
  special = false
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
  enable_autoscaling            = var.enable_autoscaling
  min_capacity                  = var.min_capacity
  max_capacity                  = var.max_capacity
  cpu_scale_target              = var.cpu_scale_target
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
      # Multi-tenant: enforce row-level tenantId scoping on every tenant-scoped query.
      {
        name  = "TENANT_SCOPING_MODE"
        value = "enforce"
      },
    ],
    var.extra_environment_vars,
    var.max_runs_per_month != "" ? [{ name = "MAX_RUNS_PER_MONTH", value = var.max_runs_per_month }] : [],
    var.max_scenarios_per_run != "" ? [{ name = "MAX_SCENARIOS_PER_RUN", value = var.max_scenarios_per_run }] : [],
    var.max_models != "" ? [{ name = "MAX_MODELS", value = var.max_models }] : [],
    var.max_users != "" ? [{ name = "MAX_USERS", value = var.max_users }] : [],
    local.judge_environment_vars,
  )

  # Postgres connection string + the control-plane shared secret come from Secrets
  # Manager (injected at task start); never appear as plaintext env vars.
  database_url = ""
  extra_secrets = concat(
    local.judge_secrets,
    [
      { name = "DATABASE_URL", valueFrom = module.aurora.database_url_secret_arn },
      { name = "CONTROL_PLANE_INTERNAL_SECRET", valueFrom = local.control_plane_internal_secret_arn },
    ],
  )

  saas_mode = false
  tenant_id = var.tenant_id
  # CONTROL_PLANE_INTERNAL_URL auto-discovered from SSM (published by control-plane-prod).
  # The secret is injected via extra_secrets above (never plaintext) — leave the plain var empty.
  control_plane_internal_url    = data.aws_ssm_parameter.control_plane_internal_url.value
  control_plane_internal_secret = ""
  website_url                   = var.website_url
  tags                          = local.common_tags
}

# ── SSM: publish the evaluator's public URL for control-plane-prod to consume ──
# control-plane-prod reads this for CONTROL_PLANE_INSTANCE_BASE_URL (the tenant
# SSO redirect base), so no instance URL is hand-configured anywhere.
resource "aws_ssm_parameter" "evaluator_instance_url" {
  name  = "/aria/evaluator/${var.environment}/instance-url"
  type  = "String"
  value = module.cloudfront.distribution_url

  tags = local.common_tags
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

# ── Guardrail Advisor doc crawler ─────────────────────────────────────────────
# Weekly EventBridge → Lambda that refreshes the platform-doc RAG corpus. Gated
# off by default; enable once a Lambda bundle is built and the private subnets
# have egress to Bedrock + the doc URLs. Uses the ECS service SG so Aurora admits it.
module "guardrail_crawler" {
  source = "../../modules/guardrail-rag"

  enabled     = var.guardrail_crawler_enabled
  app_name    = var.app_name
  environment = var.environment

  bedrock_region          = var.bedrock_region
  database_url_secret_arn = module.aurora.database_url_secret_arn
  subnet_ids              = module.networking.private_subnet_ids
  security_group_ids      = [module.networking.ecs_service_security_group_id]

  log_retention_days = var.log_retention_days
  tags               = local.common_tags
}

# ── WAF (CloudFront scope, us-east-1) ─────────────────────────────────────────
# WAFv2 web ACL for the public CloudFront distribution: AWS managed rule groups
# (IP reputation, OWASP common set, known-bad-inputs) + a per-IP rate limit.
# CLOUDFRONT-scope web ACLs must live in us-east-1, so the module is fed the
# aliased provider. Prod hardening: the evaluator's public edge previously had no
# WAF.
module "waf" {
  source = "../../modules/waf"

  providers = {
    aws.us_east_1 = aws.us_east_1
  }

  app_name           = var.app_name
  environment        = var.environment
  tenant_id          = var.tenant_id
  pricing_tier       = var.pricing_tier
  log_retention_days = var.log_retention_days
  tags               = local.common_tags
}

# ── CloudFront ────────────────────────────────────────────────────────────────
# Public HTTPS entry for the evaluator (default *.cloudfront.net cert — no custom
# domain/ACM/Route53 required). WAF + origin-secret lock are enabled for prod.

module "cloudfront" {
  source = "../../modules/cloudfront"

  app_name                 = var.app_name
  environment              = var.environment
  alb_dns_name             = module.alb.alb_dns_name
  price_class              = var.cloudfront_price_class
  acm_certificate_arn      = var.acm_certificate_arn
  aliases                  = var.cloudfront_aliases
  waf_web_acl_arn          = module.waf.web_acl_arn
  cloudfront_origin_secret = random_password.cloudfront_origin_secret.result
  tenant_id                = var.tenant_id
  pricing_tier             = var.pricing_tier
  tags                     = local.common_tags
}

# ── CloudTrail ────────────────────────────────────────────────────────────────
# Prod: multi-region, Insights enabled, 1-year S3 retention.

module "cloudtrail" {
  source = "../../modules/cloudtrail"

  app_name       = var.app_name
  environment    = var.environment
  aws_region     = var.aws_region
  aws_account_id = local.aws_account_id
  bucket_suffix  = var.bucket_suffix

  is_multi_region               = true
  include_global_service_events = true
  enable_log_file_validation    = true
  enable_s3_data_events         = true
  enable_lambda_data_events     = true
  enable_insight_events         = true
  enable_cloudwatch_logs        = true
  cloudwatch_log_retention_days = var.log_retention_days
  s3_log_retention_days         = 365
  alert_sns_topic_arn           = var.cloudtrail_alert_sns_topic_arn
  force_destroy                 = var.force_destroy

  tags = local.common_tags
}
