data "aws_caller_identity" "current" {}

data "archive_file" "suspend_check" {
  type        = "zip"
  output_path = "${path.module}/lambda/suspend_check.zip"

  source {
    content  = file("${path.module}/lambda/suspend_check.py")
    filename = "suspend_check.py"
  }
}

data "archive_file" "resume_trigger" {
  type        = "zip"
  output_path = "${path.module}/lambda/resume_trigger.zip"

  source {
    content  = file("${path.module}/lambda/resume_trigger.py")
    filename = "resume_trigger.py"
  }
}

locals {
  name_prefix     = "${var.app_name}-${var.environment}-${var.tenant_id}"
  ecs_service_arn = "arn:aws:ecs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:service/${var.ecs_cluster_name}/${var.ecs_service_name}"
  common_tags = merge(
    var.tags,
    {
      ManagedBy            = "terraform"
      Project              = "aria-evaluator"
      Environment          = var.environment
      AppName              = var.app_name
      "aria:tenant_id"     = var.tenant_id
      "aria:pricing_tier"  = var.pricing_tier
      "aria:resource_type" = "serverless"
    },
  )
}

resource "aws_sqs_queue" "suspend_dlq" {
  name                       = "aria-${var.tenant_id}-suspend-dlq"
  message_retention_seconds  = 345600
  sqs_managed_sse_enabled    = true
  visibility_timeout_seconds = 60

  tags = merge(local.common_tags, {
    Name = "aria-${var.tenant_id}-suspend-dlq"
  })
}

data "aws_iam_policy_document" "lambda_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "suspend_check" {
  name               = "aria-${var.tenant_id}-suspend-check"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json

  tags = local.common_tags
}

data "aws_iam_policy_document" "suspend_check" {
  statement {
    sid    = "CloudWatchLogs"
    effect = "Allow"
    actions = [
      "logs:CreateLogGroup",
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]
    resources = ["arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:*"]
  }

  statement {
    sid    = "EcsControl"
    effect = "Allow"
    actions = [
      "ecs:DescribeServices",
      "ecs:UpdateService",
    ]
    resources = [var.ecs_cluster_arn, local.ecs_service_arn]
  }

  statement {
    sid    = "HeartbeatTable"
    effect = "Allow"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
    ]
    resources = [var.heartbeat_table_arn]
  }

  statement {
    sid     = "SqsDlqSendMessage"
    effect  = "Allow"
    actions = ["sqs:SendMessage"]
    resources = [
      aws_sqs_queue.suspend_dlq.arn,
    ]
  }

  dynamic "statement" {
    for_each = var.alert_email != "" ? toset(["enabled"]) : toset([])

    content {
      sid       = "SendWarningEmail"
      effect    = "Allow"
      actions   = ["ses:SendEmail"]
      resources = ["*"]
    }
  }

  statement {
    sid       = "PutMetrics"
    effect    = "Allow"
    actions   = ["cloudwatch:PutMetricData"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "suspend_check" {
  name   = "aria-${var.tenant_id}-suspend-check"
  role   = aws_iam_role.suspend_check.id
  policy = data.aws_iam_policy_document.suspend_check.json
}

resource "aws_cloudwatch_log_group" "suspend_check" {
  name              = "/aws/lambda/aria-${var.tenant_id}-suspend-check"
  retention_in_days = 30

  tags = merge(local.common_tags, {
    Name = "aria-${var.tenant_id}-suspend-check-logs"
  })
}

resource "aws_lambda_function" "suspend_check" {
  function_name = "aria-${var.tenant_id}-suspend-check"
  role          = aws_iam_role.suspend_check.arn
  filename      = data.archive_file.suspend_check.output_path
  handler       = "suspend_check.lambda_handler"
  runtime       = "python3.12"
  timeout       = 60
  memory_size   = 256

  source_code_hash               = data.archive_file.suspend_check.output_base64sha256
  reserved_concurrent_executions = 1

  dead_letter_config {
    target_arn = aws_sqs_queue.suspend_dlq.arn
  }

  environment {
    variables = {
      TENANT_ID               = var.tenant_id
      HEARTBEAT_TABLE         = var.heartbeat_table_name
      ECS_CLUSTER             = var.ecs_cluster_name
      ECS_SERVICE             = var.ecs_service_name
      SUSPEND_THRESHOLD_HOURS = tostring(var.suspend_threshold_hours)
      ALERT_EMAIL             = var.alert_email
      PRICING_TIER            = var.pricing_tier
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.suspend_check,
    aws_iam_role_policy.suspend_check,
  ]

  tags = local.common_tags
}

resource "aws_iam_role" "resume" {
  name               = "aria-${var.tenant_id}-resume"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json

  tags = local.common_tags
}

data "aws_iam_policy_document" "resume" {
  statement {
    sid    = "CloudWatchLogs"
    effect = "Allow"
    actions = [
      "logs:CreateLogGroup",
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]
    resources = ["arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:*"]
  }

  statement {
    sid    = "EcsControl"
    effect = "Allow"
    actions = [
      "ecs:DescribeServices",
      "ecs:UpdateService",
    ]
    resources = [var.ecs_cluster_arn, local.ecs_service_arn]
  }

  statement {
    sid    = "HeartbeatTable"
    effect = "Allow"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
    ]
    resources = [var.heartbeat_table_arn]
  }

  statement {
    sid       = "PutMetrics"
    effect    = "Allow"
    actions   = ["cloudwatch:PutMetricData"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "resume" {
  name   = "aria-${var.tenant_id}-resume"
  role   = aws_iam_role.resume.id
  policy = data.aws_iam_policy_document.resume.json
}

resource "aws_cloudwatch_log_group" "resume" {
  name              = "/aws/lambda/aria-${var.tenant_id}-resume"
  retention_in_days = 30

  tags = merge(local.common_tags, {
    Name = "aria-${var.tenant_id}-resume-logs"
  })
}

resource "aws_lambda_function" "resume" {
  function_name = "aria-${var.tenant_id}-resume"
  role          = aws_iam_role.resume.arn
  filename      = data.archive_file.resume_trigger.output_path
  handler       = "resume_trigger.lambda_handler"
  runtime       = "python3.12"
  timeout       = 30
  memory_size   = 256

  source_code_hash               = data.archive_file.resume_trigger.output_base64sha256
  reserved_concurrent_executions = 1

  environment {
    variables = {
      TENANT_ID       = var.tenant_id
      HEARTBEAT_TABLE = var.heartbeat_table_name
      ECS_CLUSTER     = var.ecs_cluster_name
      ECS_SERVICE     = var.ecs_service_name
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.resume,
    aws_iam_role_policy.resume,
  ]

  tags = local.common_tags
}

data "aws_iam_policy_document" "eventbridge_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["events.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "eventbridge_invoke" {
  name               = "aria-${var.tenant_id}-suspend-events"
  assume_role_policy = data.aws_iam_policy_document.eventbridge_assume.json

  tags = local.common_tags
}

data "aws_iam_policy_document" "eventbridge_invoke" {
  statement {
    effect    = "Allow"
    actions   = ["lambda:InvokeFunction"]
    resources = [aws_lambda_function.suspend_check.arn]
  }
}

resource "aws_iam_role_policy" "eventbridge_invoke" {
  name   = "aria-${var.tenant_id}-suspend-events"
  role   = aws_iam_role.eventbridge_invoke.id
  policy = data.aws_iam_policy_document.eventbridge_invoke.json
}

resource "aws_cloudwatch_event_rule" "suspend_check" {
  name                = "aria-${var.tenant_id}-suspend-check"
  schedule_expression = "rate(15 minutes)"
  state               = "ENABLED"

  tags = merge(local.common_tags, {
    Name = "aria-${var.tenant_id}-suspend-check"
  })
}

resource "aws_cloudwatch_event_target" "suspend_check" {
  rule      = aws_cloudwatch_event_rule.suspend_check.name
  arn       = aws_lambda_function.suspend_check.arn
  role_arn  = aws_iam_role.eventbridge_invoke.arn
  target_id = "SuspendCheckLambda"
}

resource "aws_lambda_permission" "eventbridge" {
  statement_id  = "AllowEventBridgeInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.suspend_check.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.suspend_check.arn
}

resource "aws_lambda_permission" "control_plane" {
  count = var.control_plane_role_arn != "" ? 1 : 0

  statement_id  = "AllowControlPlaneInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.resume.function_name
  principal     = var.control_plane_role_arn
}
