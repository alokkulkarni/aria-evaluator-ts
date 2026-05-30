# ── Data sources ──────────────────────────────────────────────────────────────

data "aws_caller_identity" "current" {}

data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  aws_account_id     = data.aws_caller_identity.current.account_id
  availability_zones = slice(data.aws_availability_zones.available.names, 0, length(var.public_subnet_cidrs))
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
  tags                = var.tags
}

# ── ECR ───────────────────────────────────────────────────────────────────────

module "ecr" {
  source = "../../modules/ecr"

  app_name             = var.app_name
  environment          = var.environment
  scan_on_push         = true   # prod: always scan images on push
  image_tag_mutability = "IMMUTABLE"  # prod: prevent tag overwrites
  tags                 = var.tags
}

# ── S3 State Bucket ───────────────────────────────────────────────────────────

module "s3" {
  source = "../../modules/s3"

  app_name           = var.app_name
  environment        = var.environment
  bucket_suffix      = var.bucket_suffix
  force_destroy      = false  # prod: protect against accidental deletion
  versioning_enabled = true   # prod: keep object history
  tags               = var.tags
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
  tags                = var.tags
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
  tags                  = var.tags
}

# ── ECS ───────────────────────────────────────────────────────────────────────

module "ecs" {
  source = "../../modules/ecs"

  app_name                = var.app_name
  environment             = var.environment
  aws_region              = var.aws_region
  app_image_uri           = var.app_image_uri
  container_port          = var.container_port
  cpu                     = var.cpu
  memory                  = var.memory
  desired_count           = var.desired_count
  task_execution_role_arn = module.iam.task_execution_role_arn
  task_role_arn           = module.iam.task_role_arn
  public_subnet_ids       = module.networking.public_subnet_ids
  ecs_service_security_group_id = module.networking.ecs_service_security_group_id
  target_group_arn        = module.alb.target_group_arn
  alb_listener_arn        = module.alb.listener_arn
  state_bucket_name       = module.s3.bucket_name
  s3_state_prefix         = var.s3_state_prefix
  s3_sync_interval_seconds = var.s3_sync_interval_seconds
  log_retention_days      = var.log_retention_days

  # prod: keep tasks running during deployment (rolling update)
  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200

  extra_environment_vars = var.extra_environment_vars
  tags                   = var.tags
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
  tags                = var.tags
}
