# CodeBuild project for on-demand evaluator instance provisioning
# Triggered by Lambda when user clicks "Configure Instance"
# Clones repo and runs: terraform apply -var user_id=<uuid> -var plan_type=<plan>

locals {
  codebuild_name = "${var.app_name}-provisioner"
  codebuild_environment_variables = [
    {
      name = "TERRAFORM_VERSION"
      # 1.9+ is required for cross-variable validation blocks
      # (var.pricing_track condition reads var.pricing_tier).
      #
      # AVOID 1.9.x — it has a regression where `dynamic` block `for_each`
      # rejects every iterable type with "An iterable collection is required":
      #   - list of number  → "Cannot use a list of number value"
      #   - set of string   → "Cannot use a set of string value"
      #   - map of bool     → "Cannot use a map of bool value"
      # The bug is fixed from 1.10 onward. We pin a recent stable to stay
      # close to what's used for local development (1.15 family).
      value = "1.13.4"
      type  = "PLAINTEXT"
    },
    {
      name  = "AWS_REGION"
      value = var.aws_region
      type  = "PLAINTEXT"
    },
    {
      name  = "AWS_ACCOUNT_ID"
      value = var.aws_account_id
      type  = "PLAINTEXT"
    },
    {
      name  = "TERRAFORM_STATE_BUCKET"
      value = var.terraform_state_bucket
      type  = "PLAINTEXT"
    },
    {
      name  = "TERRAFORM_STATE_LOCK_TABLE"
      value = var.terraform_state_lock_table
      type  = "PLAINTEXT"
    },
    {
      name  = "TERRAFORM_STATE_KMS_KEY_ARN"
      value = var.terraform_state_kms_key_arn
      type  = "PLAINTEXT"
    },
    {
      name  = "USER_INSTANCE_TABLE"
      value = var.user_instance_table_name
      type  = "PLAINTEXT"
    },
    {
      name  = "GITHUB_REPO"
      value = var.github_repo_url
      type  = "PLAINTEXT"
    },
    {
      name  = "GITHUB_BRANCH"
      value = var.github_branch
      type  = "PLAINTEXT"
    }
  ]
}

# ── IAM role for CodeBuild ────────────────────────────────────────────────────

resource "aws_iam_role" "codebuild_role" {
  name = "${local.codebuild_name}-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "codebuild.amazonaws.com"
        }
      }
    ]
  })

  tags = var.tags
}

# CloudWatch Logs permission
resource "aws_iam_role_policy" "codebuild_logs" {
  name = "${local.codebuild_name}-logs"
  role = aws_iam_role.codebuild_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:${var.aws_region}:${var.aws_account_id}:log-group:/aws/codebuild/${local.codebuild_name}*"
      }
    ]
  })
}

# S3 permission for terraform state and artifacts
resource "aws_iam_role_policy" "codebuild_s3" {
  name = "${local.codebuild_name}-s3"
  role = aws_iam_role.codebuild_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:ListBucket"
        ]
        Resource = [
          "${var.terraform_state_bucket_arn}",
          "${var.terraform_state_bucket_arn}/*"
        ]
      }
    ]
  })
}

# KMS permission for terraform state encryption
resource "aws_iam_role_policy" "codebuild_kms" {
  name = "${local.codebuild_name}-kms"
  role = aws_iam_role.codebuild_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:Encrypt",
          "kms:GenerateDataKey",
          "kms:DescribeKey"
        ]
        Resource = var.terraform_state_kms_key_arn
      }
    ]
  })
}

# DynamoDB permission for user instance tracking
resource "aws_iam_role_policy" "codebuild_dynamodb" {
  name = "${local.codebuild_name}-dynamodb"
  role = aws_iam_role.codebuild_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:GetItem",
          "dynamodb:Query"
        ]
        Resource = var.user_instance_table_arn
      }
    ]
  })
}

# ECR permission for pulling evaluator image
resource "aws_iam_role_policy" "codebuild_ecr" {
  name = "${local.codebuild_name}-ecr"
  role = aws_iam_role.codebuild_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage",
          "ecr:PutImage",
          "ecr:InitiateLayerUpload",
          "ecr:UploadLayerPart",
          "ecr:CompleteLayerUpload",
          "ecr:DescribeRepositories",
          "ecr:DescribeImages",
          "ecr:ListImages"
        ]
        Resource = var.ecr_repository_arn
      }
    ]
  })
}

# Full AWS permissions for terraform (provisioning evaluator instances)
resource "aws_iam_role_policy" "codebuild_terraform" {
  name = "${local.codebuild_name}-terraform"
  role = aws_iam_role.codebuild_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ec2:*",
          "ecs:*",
          "iam:*",
          "rds:*",
          "elasticache:*",
          "s3:*",
          "dynamodb:*",
          "lambda:*",
          "apigateway:*",
          "cloudwatch:*",
          "logs:*",
          "sns:*",
          "sqs:*",
          "acm:*",
          "route53:*",
          "elasticloadbalancing:*",
          "kms:*",
          "secretsmanager:*",
          "ssm:*",
          # CloudFront — tenant cloudfront module creates cache policies,
          # origin-request policies, functions, distributions, and the
          # associated tagging. Without these the apply hits AccessDenied
          # on the first cache-policy create.
          "cloudfront:*",
          # WAF for CloudFront protection
          "wafv2:*",
          # Application Auto Scaling for ECS service scaling
          "application-autoscaling:*",
          # EFS for tenants that opt into persistent storage
          "elasticfilesystem:*",
          # X-Ray / observability
          "xray:*",
          # EventBridge rules for suspend/resume lambdas
          "events:*",
          "scheduler:*",
        ]
        Resource = "*"
      }
    ]
  })
}

# Secrets Manager: read provisioner secrets and the control-plane internal secret
resource "aws_iam_role_policy" "codebuild_secrets" {
  name = "${local.codebuild_name}-secrets"
  role = aws_iam_role.codebuild_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret"
        ]
        Resource = [
          "arn:aws:secretsmanager:${var.aws_region}:${var.aws_account_id}:secret:${var.app_name}-provisioner-*",
          # Control-plane internal secret — path matches what control-plane-{env} creates
          "arn:aws:secretsmanager:${var.aws_region}:${var.aws_account_id}:secret:/aria/control-plane/*"
        ]
      }
    ]
  })
}

# SSM: read control-plane service-discovery parameters (internal URL, secret ARN)
resource "aws_iam_role_policy" "codebuild_ssm" {
  name = "${local.codebuild_name}-ssm"
  role = aws_iam_role.codebuild_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ssm:GetParameter",
          "ssm:GetParameters"
        ]
        Resource = [
          "arn:aws:ssm:${var.aws_region}:${var.aws_account_id}:parameter/aria/control-plane/*",
          # Shared platform-resource overrides read by the buildspec
          # (ecr_repository_url, bucket_suffix, heartbeat_table_*, kms_key_arn,
          # alarm_sns_topic_arn). The buildspec has sensible fallbacks if the
          # params don't exist — these IAM grants are for the case where a
          # deployment chooses to set them in SSM.
          "arn:aws:ssm:${var.aws_region}:${var.aws_account_id}:parameter/aria/shared/*",
        ]
      }
    ]
  })
}

# ── CodeBuild Project ────────────────────────────────────────────────────────

resource "aws_codebuild_project" "provisioner" {
  name          = local.codebuild_name
  service_role  = aws_iam_role.codebuild_role.arn
  build_timeout = 30 # 30 minutes for terraform apply + infrastructure setup

  environment {
    compute_type                = "BUILD_GENERAL1_LARGE"
    image                       = "aws/codebuild/standard:7.0"
    type                        = "LINUX_CONTAINER"
    image_pull_credentials_type = "CODEBUILD"
    dynamic "environment_variable" {
      for_each = local.codebuild_environment_variables
      content {
        name  = environment_variable.value.name
        value = environment_variable.value.value
        type  = environment_variable.value.type
      }
    }
  }

  source {
    type      = "NO_SOURCE"
    buildspec = file("${path.module}/buildspec.yaml")
  }

  artifacts {
    type = "NO_ARTIFACTS"
  }

  logs_config {
    cloudwatch_logs {
      group_name  = "/aws/codebuild/${local.codebuild_name}"
      stream_name = "provisioning"
    }
  }

  tags = var.tags
}

# CloudWatch Log Group
resource "aws_cloudwatch_log_group" "codebuild_logs" {
  name              = "/aws/codebuild/${local.codebuild_name}"
  retention_in_days = 30

  tags = var.tags
}

# ── Failure notifications (created only when alert_email is provided) ─────────

locals {
  notifications_enabled = var.alert_email != ""
  log_group_name        = "/aws/codebuild/${local.codebuild_name}"
  # Direct CloudWatch Logs URL — links to the log group filtered to the specific build stream.
  # The stream name in CodeBuild matches the last segment of the build ARN (after the final colon).
  cw_console_base = "https://console.aws.amazon.com/cloudwatch/home?region=${var.aws_region}#logsV2:log-groups/log-group"
}

resource "aws_sns_topic" "provisioning_failures" {
  count             = local.notifications_enabled ? 1 : 0
  name              = "${local.codebuild_name}-failures"
  kms_master_key_id = "alias/aws/sns"
  tags              = var.tags
}

resource "aws_sns_topic_subscription" "support_email" {
  count     = local.notifications_enabled ? 1 : 0
  topic_arn = aws_sns_topic.provisioning_failures[0].arn
  protocol  = "email"
  endpoint  = var.alert_email
}

# Allow EventBridge and CloudWatch to publish to the topic
resource "aws_sns_topic_policy" "provisioning_failures" {
  count = local.notifications_enabled ? 1 : 0
  arn   = aws_sns_topic.provisioning_failures[0].arn

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowEventBridge"
        Effect    = "Allow"
        Principal = { Service = "events.amazonaws.com" }
        Action    = "SNS:Publish"
        Resource  = aws_sns_topic.provisioning_failures[0].arn
      },
      {
        Sid       = "AllowCloudWatch"
        Effect    = "Allow"
        Principal = { Service = "cloudwatch.amazonaws.com" }
        Action    = "SNS:Publish"
        Resource  = aws_sns_topic.provisioning_failures[0].arn
      }
    ]
  })
}

# ── EventBridge: CodeBuild FAILED / STOPPED → rich email ─────────────────────

resource "aws_cloudwatch_event_rule" "codebuild_failure" {
  count       = local.notifications_enabled ? 1 : 0
  name        = "${local.codebuild_name}-failure"
  description = "Fires when a tenant provisioning CodeBuild build fails or is stopped"

  event_pattern = jsonencode({
    source        = ["aws.codebuild"]
    "detail-type" = ["CodeBuild Build State Change"]
    detail = {
      "build-status" = ["FAILED", "STOPPED"]
      "project-name" = [local.codebuild_name]
    }
  })

  tags = var.tags
}

resource "aws_cloudwatch_event_target" "codebuild_failure_sns" {
  count     = local.notifications_enabled ? 1 : 0
  rule      = aws_cloudwatch_event_rule.codebuild_failure[0].name
  target_id = "provisioning-failure-to-sns"
  arn       = aws_sns_topic.provisioning_failures[0].arn

  # The CodeBuild state-change event exposes:
  #   $.detail.additional-information.logs.deep-link  — direct CloudWatch Logs URL for this build
  #   $.detail.additional-information.logs.stream-name — log stream (= build UUID)
  # These are extracted via input_paths and embedded in the notification body.
  input_transformer {
    input_paths = {
      account    = "$.account"
      build_id   = "$.detail.build-id"
      deep_link  = "$.detail.additional-information.logs.deep-link"
      log_stream = "$.detail.additional-information.logs.stream-name"
      project    = "$.detail.project-name"
      region     = "$.region"
      status     = "$.detail.build-status"
      time       = "$.time"
    }

    # Plain-text body (SNS email protocol delivers the raw string).
    # EventBridge requires input_template to be a valid JSON-quoted string:
    # a single line with \n / \" escapes. jsonencode() produces exactly that
    # from a normal multiline Terraform string.
    input_template = jsonencode(<<-EOT
      ARIA Evaluator — Provisioning FAILED

      Status  : <status>
      Project : <project>
      Build   : <build_id>
      Time    : <time>

      ── CLOUDWATCH LOGS (open this first) ────────────────────────────────
      Direct link to this build's log stream:
      <deep_link>

      Log group : ${local.log_group_name}
      Stream    : <log_stream>

      Tip: search for "Error:", "Error running command", or "FAILED" near
      the bottom of the log to locate the Terraform / GitHub / shell error.

      ── GITHUB ───────────────────────────────────────────────────────────
      Repo   : ${var.github_repo_url}
      Branch : ${var.github_branch}

      Commit history : ${var.github_repo_url}/commits/${var.github_branch}
      To check recent changes that may have broken provisioning, open the
      commit history link above and compare against the build timestamp.

      ── TENANT CONTEXT ───────────────────────────────────────────────────
      The tenant ID (USER_ID) and plan (PLAN_TYPE) that triggered this build
      are visible at the top of the CloudWatch log stream under the heading
      "Environment variables". Search for USER_ID in the log.

      ── ACCOUNT ──────────────────────────────────────────────────────────
      AWS account : <account>
      Region      : <region>

      ── NEXT STEPS ───────────────────────────────────────────────────────
      1. Open the CloudWatch deep link above to read the full build log.
      2. Identify whether the failure is: Terraform error, GitHub clone
         failure, or AWS permission issue.
      3. Fix the root cause, then ask the user to re-provision from their
         dashboard (Settings → Re-provision instance).
      4. If urgent, trigger a new CodeBuild build manually from the AWS
         console with the same USER_ID and PLAN_TYPE env var overrides.
    EOT
    )
  }
}

# ── CloudWatch metric filter: catch Terraform / provisioning errors in logs ───

resource "aws_cloudwatch_log_metric_filter" "provisioning_errors" {
  count          = local.notifications_enabled ? 1 : 0
  name           = "${local.codebuild_name}-errors"
  log_group_name = local.log_group_name
  # Matches: Terraform plan/apply errors, shell errors, GitHub failures
  pattern = "?\"Error:\" ?\"error:\" ?\"FAILED\" ?\"Error running command\" ?\"exit status\" ?\"fatal:\" ?\"no such file\""

  metric_transformation {
    name          = "ProvisioningErrors"
    namespace     = "ARIA/Provisioning"
    value         = "1"
    default_value = "0"
  }

  depends_on = [aws_cloudwatch_log_group.codebuild_logs]
}

resource "aws_cloudwatch_metric_alarm" "provisioning_errors" {
  count               = local.notifications_enabled ? 1 : 0
  alarm_name          = "${local.codebuild_name}-errors"
  alarm_description   = <<-EOT
    One or more error lines were detected in the ${local.codebuild_name} CodeBuild log.
    CloudWatch Logs: ${local.log_group_name}
    GitHub repo: ${var.github_repo_url} (branch: ${var.github_branch})
    Open the log group above and filter by stream name to find the failing build.
  EOT
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ProvisioningErrors"
  namespace           = "ARIA/Provisioning"
  period              = 60
  statistic           = "Sum"
  threshold           = 0
  treat_missing_data  = "notBreaching"

  alarm_actions = [aws_sns_topic.provisioning_failures[0].arn]

  tags = var.tags

  depends_on = [aws_cloudwatch_log_metric_filter.provisioning_errors]
}
