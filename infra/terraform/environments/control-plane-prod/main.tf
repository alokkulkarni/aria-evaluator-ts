data "aws_caller_identity" "current" {}
data "aws_region" "current" {}
data "aws_availability_zones" "available" { state = "available" }

locals {
  availability_zones = slice(data.aws_availability_zones.available.names, 0, 2)
  repo_root          = abspath("${path.module}/../../../..")
  use_prebuilt       = var.image_uri != ""

  # Content-hash-derived image tag. The old behaviour pinned image_tag to
  # "latest", which meant:
  #   1. terraform pushed a new image to the same ECR tag on every rebuild
  #   2. aws_ecs_task_definition.image stayed "...:latest" — same string
  #   3. terraform saw no change → no new task-def revision → ECS service
  #      kept running the old container even though new bits were in ECR
  #
  # That's the bug that left the close-account flow running stale code and
  # the broken /api/launch-instance route alive in the auth-backend for 8h.
  # Deriving a deterministic content-hash tag means every meaningful change
  # produces a new URI, terraform registers a new revision, and ECS rolls
  # the service automatically. Force_rebuild stays as an escape-hatch input
  # so a manual bump still rotates the tag even when source bytes are
  # unchanged.
  default_local_image_tag = format(
    "tf-%s",
    substr(
      sha1(join("|", [
        filesha1("${local.repo_root}/Dockerfile.control-plane"),
        fileexists("${local.repo_root}/package-lock.json") ? filesha1("${local.repo_root}/package-lock.json") : "none",
        tostring(var.force_rebuild),
      ])),
      0,
      12,
    ),
  )
  effective_image_tag = var.image_tag == "latest" ? local.default_local_image_tag : var.image_tag

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
  image_tag          = local.effective_image_tag
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

  # ECS execution role needs read access to the internal-secret because the
  # task definition's `secrets` block (extra_secrets below) makes ECS fetch
  # the value at container startup before the task role is active.
  execution_secret_arns = [aws_secretsmanager_secret.control_plane_internal_secret.arn]
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

# ── SSM: publish internal URL so CodeBuild and other services can discover it ──
resource "aws_ssm_parameter" "control_plane_internal_url" {
  name  = "/aria/control-plane/${var.environment}/internal-url"
  type  = "String"
  value = "http://${module.alb.alb_dns_name}"

  tags = local.common_tags
}

# ── Secrets Manager: auto-generate the internal shared secret ─────────────────
# The secret is created once and rotated via Secrets Manager. CodeBuild reads it
# at build time via IAM; the ECS task reads it via the `secrets` array (never
# appears in plaintext environment variables).
resource "aws_secretsmanager_secret" "control_plane_internal_secret" {
  name                    = "/aria/control-plane/${var.environment}/internal-secret"
  description             = "Shared secret for CodeBuild → control-plane callback auth"
  recovery_window_in_days = 7

  tags = local.common_tags
}

resource "aws_secretsmanager_secret_version" "control_plane_internal_secret" {
  secret_id = aws_secretsmanager_secret.control_plane_internal_secret.id
  # Auto-generated on first apply; update manually or via rotation Lambda.
  secret_string = var.control_plane_internal_secret != "" ? var.control_plane_internal_secret : random_password.internal_secret.result
}

resource "random_password" "internal_secret" {
  length  = 48
  special = false
}

# ── SSM: also publish the secret ARN so CodeBuild can locate it without hardcoding ──
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
  app_image_uri                 = local.resolved_image_uri
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
      # Internal URL is read from SSM at startup — injected as plain env var since it is not secret
      { name = "CONTROL_PLANE_INTERNAL_URL", value = aws_ssm_parameter.control_plane_internal_url.value },
      { name = "CODEBUILD_AWS_REGION", value = var.aws_region },
      # Pass secret ARN as plaintext — CodeBuild uses it to fetch the actual secret value
      { name = "CONTROL_PLANE_SECRET_ARN", value = aws_secretsmanager_secret.control_plane_internal_secret.arn },
      { name = "CONTROL_PLANE_CORS_ORIGINS", value = join(",", var.allowed_origins) },
      { name = "CONTROL_PLANE_INSTANCE_BASE_URL", value = var.instance_base_url },
      { name = "USER_INSTANCE_TABLE", value = aws_dynamodb_table.user_instances.name },
      { name = "CODEBUILD_PROJECT_NAME", value = module.provisioning_codebuild.codebuild_project_name },
      # When set, control-plane persists state to DynamoDB with CAS instead of
      # local file. Required for prod (multi-task, survives restart).
      { name = "CONTROL_PLANE_STATE_TABLE", value = aws_dynamodb_table.control_plane_state.name },
      { name = "AWS_REGION", value = var.aws_region },
    ],
    # SES sender for the account-closure confirmation email. Skipped silently
    # by sendAccountClosedEmail when the address isn't set.
    var.ses_from_address != "" ? [{ name = "SES_FROM_ADDRESS", value = var.ses_from_address }] : [],
  )
  # Internal secret injected via ECS secrets (Secrets Manager valueFrom) — never plaintext
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

# ── DynamoDB for control-plane shared state (users/sessions/tenants) ──────────
# Single-item table with optimistic concurrency. The control-plane server
# stores its entire ControlPlaneState as one JSON blob under id="state",
# guarded by a `version` attribute. Writes use ConditionExpression so two
# concurrent ECS tasks can't clobber each other.
#
# Single-blob is intentional — the data set is small (low thousands of users),
# the existing code already loads the whole state into memory, and CAS gives
# us multi-task safety without rewriting every handler. Migrate to per-entity
# tables later if size grows past a few MB.

resource "aws_dynamodb_table" "control_plane_state" {
  name         = "${var.app_name}-control-plane-state"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled     = true
    kms_key_arn = aws_kms_key.dynamodb.arn
  }

  tags = local.common_tags
}

# ── KMS Key for DynamoDB Encryption ──────────────────────────────────────────

resource "aws_kms_key" "dynamodb" {
  description             = "KMS key for DynamoDB encryption"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  tags = local.common_tags
}

# ── IAM policy: control-plane state table access for ECS task role ────────────

data "aws_iam_policy_document" "control_plane_state_access" {
  statement {
    sid    = "StateTableReadWrite"
    effect = "Allow"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:DescribeTable",
    ]
    resources = [aws_dynamodb_table.control_plane_state.arn]
  }

  statement {
    sid    = "StateTableKmsDecrypt"
    effect = "Allow"
    actions = [
      "kms:Decrypt",
      "kms:Encrypt",
      "kms:GenerateDataKey",
    ]
    resources = [aws_kms_key.dynamodb.arn]
  }
}

resource "aws_iam_policy" "control_plane_state_access" {
  name        = "${var.app_name}-${var.environment}-control-plane-state-access"
  description = "Allow ECS task role to read/write the control-plane state DynamoDB table"
  policy      = data.aws_iam_policy_document.control_plane_state_access.json

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "control_plane_state_access" {
  role       = module.iam.task_role_name
  policy_arn = aws_iam_policy.control_plane_state_access.arn
}

# ── IAM policy: SES send permission for account-closure confirmation emails ──
#
# Uses aws_iam_role_policy (INLINE) rather than aws_iam_policy +
# aws_iam_role_policy_attachment (managed). The task role already had 10
# managed policies attached (s3_state, connect, bedrock, polly, transcribe,
# xray, custom_metrics, heartbeat_table, state_access, codebuild_access),
# which is the AWS default per-role limit. Inline policies don't count
# against that limit.

resource "aws_iam_role_policy" "control_plane_ses_send" {
  name = "${var.app_name}-${var.environment}-control-plane-ses-send"
  role = module.iam.task_role_name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "SesSendAccountClosureEmail"
        Effect = "Allow"
        Action = [
          "ses:SendEmail",
          "ses:SendRawEmail",
        ]
        # SES is account-region scoped — sending requires the FROM identity
        # to be verified, but the IAM action itself is broad. Resource="*"
        # matches the convention used by the AWS-managed send-only patterns.
        Resource = "*"
      },
    ]
  })
}

# ── IAM policy: CodeBuild StartBuild + BatchGetBuilds for control-plane ──────
# The control-plane needs to:
#  - StartBuild on the provisioner project when a tenant signs up
#  - BatchGetBuilds to surface live build phase to the provisioning UI
#
# Scoped to the single provisioner project ARN — no broad codebuild:* perms.

data "aws_iam_policy_document" "control_plane_codebuild_access" {
  statement {
    sid    = "StartProvisioningBuilds"
    effect = "Allow"
    actions = [
      "codebuild:StartBuild",
      "codebuild:BatchGetBuilds",
    ]
    resources = [module.provisioning_codebuild.codebuild_project_arn]
  }
}

resource "aws_iam_policy" "control_plane_codebuild_access" {
  name        = "${var.app_name}-${var.environment}-control-plane-codebuild-access"
  description = "Allow ECS task role to start and inspect tenant provisioning CodeBuild jobs"
  policy      = data.aws_iam_policy_document.control_plane_codebuild_access.json

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "control_plane_codebuild_access" {
  role       = module.iam.task_role_name
  policy_arn = aws_iam_policy.control_plane_codebuild_access.arn
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
  alert_email                 = var.alert_email

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
  # Use the SNS topic created inside the module so Lambda alarms reach the same destination
  alarm_sns_topic_arn = module.provisioning_codebuild.sns_topic_arn

  # ── Cost Guardrails ───────────────────────────────────────────────────────
  max_instances_per_user     = var.max_instances_per_user
  max_monthly_spend_per_user = var.max_monthly_spend_per_user
  cost_per_instance_hour     = var.cost_per_instance_hour

  tags = local.common_tags

  depends_on = [
    aws_kms_key.dynamodb,
    aws_s3_bucket.cloudtrail_logs,
    module.provisioning_codebuild,
  ]
}
