data "aws_caller_identity" "current" {}
data "aws_region" "current" {}
data "aws_availability_zones" "available" { state = "available" }

locals {
  availability_zones = slice(data.aws_availability_zones.available.names, 0, 2)
  repo_root          = abspath("${path.module}/../../../..")
  use_prebuilt       = var.image_uri != ""
  resolved_image_uri = local.use_prebuilt ? var.image_uri : module.docker_build[0].image_uri

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

# ── Build & push control-plane Docker image to ECR ────────────────────────────
# Skipped when image_uri is provided (CI/CD pre-built image)

module "docker_build" {
  count  = local.use_prebuilt ? 0 : 1
  source = "../../modules/docker-build-push"

  ecr_repository_url = var.ecr_repository_url
  image_tag          = var.image_tag
  dockerfile         = "Dockerfile.control-plane"
  build_context      = local.repo_root
  aws_region         = var.aws_region
  force_rebuild      = var.force_rebuild
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
  force_destroy = false
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

module "ecs" {
  source = "../../modules/ecs"

  app_name                      = var.app_name
  environment                   = var.environment
  aws_region                    = var.aws_region
  app_image_uri                 = local.resolved_image_uri
  container_port                = var.container_port
  cpu                           = var.cpu
  memory                        = var.memory
  desired_count                 = var.desired_count
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
  extra_environment_vars = [
    { name = "CONTROL_PLANE_PORT", value = tostring(var.container_port) },
    { name = "CONTROL_PLANE_STATE_DIR", value = "/app/state/control-plane" },
  ]
  saas_mode    = false
  tenant_id    = var.tenant_id
  pricing_tier = var.pricing_tier
  tags         = local.common_tags
}

# ── CloudTrail ────────────────────────────────────────────────────────────────
# Records all management API calls and S3 data events across ALL AWS regions.
# Prod: multi-region, Insights enabled, 1-year S3 retention, full CIS alarms.

module "cloudtrail" {
  source = "../../modules/cloudtrail"

  app_name       = var.app_name
  environment    = var.environment
  aws_region     = var.aws_region
  aws_account_id = data.aws_caller_identity.current.account_id
  bucket_suffix  = var.bucket_suffix
  kms_key_arn    = var.cloudtrail_kms_key_arn

  is_multi_region               = true # prod: capture all regions
  include_global_service_events = true
  enable_log_file_validation    = true
  enable_s3_data_events         = true
  enable_lambda_data_events     = true # prod: record Lambda invocations
  enable_insight_events         = true # prod: detect unusual API patterns

  enable_cloudwatch_logs        = true
  cloudwatch_log_retention_days = var.log_retention_days
  s3_log_retention_days         = 365 # prod: 1 year retention

  alert_sns_topic_arn = var.cloudtrail_alert_sns_topic_arn

  tags = local.common_tags
}

# ── DynamoDB for user instance tracking ────────────────────────────────────────

resource "aws_dynamodb_table" "user_instances" {
  name         = "${var.app_name}-user-instances"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "user_id"

  attribute {
    name = "user_id"
    type = "S"
  }

  attribute {
    name = "status"
    type = "S"
  }

  global_secondary_index {
    name            = "user_id-status-index"
    hash_key        = "user_id"
    range_key       = "status"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = true
  }

  ttl {
    attribute_name = "expiration_time"
    enabled        = true
  }

  # Enable encryption at rest
  server_side_encryption {
    enabled     = true
    kms_key_arn = aws_kms_key.dynamodb.arn
  }

  # Enable streams for audit logging
  stream_enabled   = true
  stream_view_type = "NEW_AND_OLD_IMAGES"

  tags = local.common_tags
}

# ── KMS Key for DynamoDB Encryption ──────────────────────────────────────────

resource "aws_kms_key" "dynamodb" {
  description             = "KMS key for DynamoDB encryption"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  tags = local.common_tags
}

resource "aws_kms_alias" "dynamodb" {
  name          = "alias/${var.app_name}-dynamodb"
  target_key_id = aws_kms_key.dynamodb.key_id
}

# ── S3 Bucket for CloudTrail Logs ────────────────────────────────────────────

resource "aws_s3_bucket" "cloudtrail_logs" {
  bucket        = "${var.app_name}-cloudtrail-logs-${data.aws_caller_identity.current.account_id}"
  force_destroy = false

  tags = local.common_tags
}

resource "aws_s3_bucket_versioning" "cloudtrail_logs" {
  bucket = aws_s3_bucket.cloudtrail_logs.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "cloudtrail_logs" {
  bucket = aws_s3_bucket.cloudtrail_logs.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "cloudtrail_logs" {
  bucket = aws_s3_bucket.cloudtrail_logs.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ── SNS Topic for Alarms ─────────────────────────────────────────────────────

resource "aws_sns_topic" "provisioning_alarms" {
  name              = "${var.app_name}-provisioning-alarms"
  kms_master_key_id = "alias/aws/sns"

  tags = local.common_tags
}

# ── CodeBuild project for provisioning ────────────────────────────────────────

module "provisioning_codebuild" {
  source = "../../modules/provisioning-codebuild"

  app_name                    = var.app_name
  aws_region                  = data.aws_region.current.name
  aws_account_id              = data.aws_caller_identity.current.account_id
  terraform_state_bucket      = var.terraform_state_bucket
  terraform_state_bucket_arn  = "arn:aws:s3:::${var.terraform_state_bucket}"
  terraform_state_kms_key_arn = var.terraform_state_kms_key_arn
  terraform_state_lock_table  = var.terraform_state_lock_table
  user_instance_table_arn     = aws_dynamodb_table.user_instances.arn
  user_instance_table_name    = aws_dynamodb_table.user_instances.name
  ecr_repository_arn          = "arn:aws:ecr:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:repository/${var.app_name}"
  github_repo_url             = var.github_repo_url
  github_branch               = var.github_branch

  tags = local.common_tags
}

# ── Lambda provisioning function ───────────────────────────────────────────────

module "provisioning_lambda" {
  source = "../../modules/provisioning-lambda"

  app_name                 = var.app_name
  environment              = var.environment
  aws_region               = data.aws_region.current.name
  codebuild_project_name   = module.provisioning_codebuild.codebuild_project_name
  codebuild_project_arn    = module.provisioning_codebuild.codebuild_project_arn
  user_instance_table_name = aws_dynamodb_table.user_instances.name
  user_instance_table_arn  = aws_dynamodb_table.user_instances.arn
  allowed_origins          = var.allowed_origins

  # ── Security Configuration ────────────────────────────────────────────────
  cognito_user_pool_id = var.cognito_user_pool_id
  jwt_audience         = var.jwt_audience
  dynamodb_kms_key_arn = aws_kms_key.dynamodb.arn
  cloudtrail_s3_bucket = aws_s3_bucket.cloudtrail_logs.id
  alarm_sns_topic_arn  = aws_sns_topic.provisioning_alarms.arn

  # ── Cost Guardrails ───────────────────────────────────────────────────────
  max_instances_per_user     = var.max_instances_per_user
  max_monthly_spend_per_user = var.max_monthly_spend_per_user
  cost_per_instance_hour     = var.cost_per_instance_hour

  tags = local.common_tags

  depends_on = [
    aws_kms_key.dynamodb,
    aws_s3_bucket.cloudtrail_logs,
    aws_sns_topic.provisioning_alarms,
  ]
}

# ── Email subscription for provisioning alarms ────────────────────────────────

resource "aws_sns_topic_subscription" "provisioning_alarms_email" {
  topic_arn = aws_sns_topic.provisioning_alarms.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

# ── EventBridge rule: CodeBuild failure → SNS ─────────────────────────────────

resource "aws_cloudwatch_event_rule" "codebuild_failure" {
  name        = "${var.app_name}-codebuild-failure"
  description = "Fires when a provisioning CodeBuild build fails or is stopped"

  event_pattern = jsonencode({
    source      = ["aws.codebuild"]
    detail-type = ["CodeBuild Build State Change"]
    detail = {
      "build-status" = ["FAILED", "STOPPED"]
      "project-name" = [module.provisioning_codebuild.codebuild_project_name]
    }
  })

  tags = local.common_tags
}

resource "aws_cloudwatch_event_target" "codebuild_failure_sns" {
  rule      = aws_cloudwatch_event_rule.codebuild_failure.name
  target_id = "codebuild-failure-to-sns"
  arn       = aws_sns_topic.provisioning_alarms.arn

  input_transformer {
    input_paths = {
      build_id = "$.detail.build-id"
      project  = "$.detail.project-name"
      status   = "$.detail.build-status"
      account  = "$.account"
      region   = "$.region"
      time     = "$.time"
    }
    input_template = "\"ARIA Evaluator Provisioning FAILED\\n\\nProject: <project>\\nBuild ID: <build_id>\\nStatus: <status>\\nTime: <time>\\nAccount: <account>\\nRegion: <region>\\n\\nCheck CloudWatch Logs: /aws/codebuild/<project>\\nTo re-run: POST /retry-build with the build_id via the provisioning API.\""
  }
}

resource "aws_sns_topic_policy" "provisioning_alarms_eventbridge" {
  arn = aws_sns_topic.provisioning_alarms.arn

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "CloudWatchAlarms"
        Effect = "Allow"
        Principal = {
          Service = "cloudwatch.amazonaws.com"
        }
        Action   = "SNS:Publish"
        Resource = aws_sns_topic.provisioning_alarms.arn
      },
      {
        Sid    = "EventBridgePublish"
        Effect = "Allow"
        Principal = {
          Service = "events.amazonaws.com"
        }
        Action   = "SNS:Publish"
        Resource = aws_sns_topic.provisioning_alarms.arn
      }
    ]
  })
}

# ── CloudWatch metric filter for Terraform errors in CodeBuild logs ───────────

resource "aws_cloudwatch_log_metric_filter" "terraform_errors" {
  name           = "${var.app_name}-terraform-errors"
  log_group_name = "/aws/codebuild/${module.provisioning_codebuild.codebuild_project_name}"
  pattern        = "?\"Error:\" ?\"error:\" ?\"FAILED\" ?\"terraform plan\" ?\"terraform apply\" ?\"Provisioning failed\""

  metric_transformation {
    name          = "TerraformErrors"
    namespace     = "ARIA/Provisioning"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_metric_alarm" "terraform_errors" {
  alarm_name          = "${var.app_name}-terraform-errors"
  alarm_description   = "Terraform errors detected in CodeBuild provisioning logs"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "TerraformErrors"
  namespace           = "ARIA/Provisioning"
  period              = 300
  statistic           = "Sum"
  threshold           = 0
  treat_missing_data  = "notBreaching"

  alarm_actions = [aws_sns_topic.provisioning_alarms.arn]
  ok_actions    = [aws_sns_topic.provisioning_alarms.arn]

  tags = local.common_tags
}
