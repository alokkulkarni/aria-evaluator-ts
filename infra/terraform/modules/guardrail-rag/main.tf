# Guardrail Advisor — RAG doc crawler module.
#
# Weekly EventBridge schedule → Lambda that refreshes the platform-doc RAG corpus
# (PlatformDocChunk) and marks affected configs stale. Gated by var.enabled
# (default off): when off, count = 0 on every resource, so the module — including
# the archive_file data source — is inert and `terraform plan/validate` passes
# without a built Lambda bundle. When enabling, build the bundle and ensure the
# Lambda's subnets have egress to Bedrock + the doc URLs (NAT or VPC endpoints).

locals {
  name_prefix   = "${var.app_name}-${var.environment}"
  function_name = "${local.name_prefix}-guardrail-doc-crawler"
  package_dir   = var.lambda_package_path != "" ? var.lambda_package_path : "${path.module}/../../../../lambda/guardrail-doc-crawler/dist"

  common_tags = merge(var.tags, {
    ManagedBy   = "terraform"
    Project     = "aria-evaluator"
    Environment = var.environment
    AppName     = var.app_name
  })
}

# ── Deployment package ────────────────────────────────────────────────────────
# The TS handler is bundled (esbuild + Prisma engine) into package_dir before apply.

data "archive_file" "crawler_zip" {
  count = var.enabled ? 1 : 0

  type        = "zip"
  source_dir  = local.package_dir
  output_path = "${path.module}/.build/guardrail_doc_crawler_${var.environment}.zip"
}

# ── IAM ───────────────────────────────────────────────────────────────────────

data "aws_iam_policy_document" "assume_role" {
  count = var.enabled ? 1 : 0

  statement {
    sid     = "LambdaAssumeRole"
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "crawler" {
  count = var.enabled ? 1 : 0

  name               = "${local.name_prefix}-guardrail-crawler"
  assume_role_policy = data.aws_iam_policy_document.assume_role[0].json

  tags = merge(local.common_tags, {
    Name                 = "${local.name_prefix}-guardrail-crawler"
    "aria:resource_type" = "security"
  })
}

# CloudWatch Logs.
resource "aws_iam_role_policy_attachment" "basic_execution" {
  count = var.enabled ? 1 : 0

  role       = aws_iam_role.crawler[0].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# ENI management so the Lambda can run in the VPC and reach the database.
resource "aws_iam_role_policy_attachment" "vpc_access" {
  count = var.enabled ? 1 : 0

  role       = aws_iam_role.crawler[0].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

# Bedrock InvokeModel — scoped to the Titan embeddings model + inference profiles.
data "aws_iam_policy_document" "bedrock_embed" {
  count = var.enabled ? 1 : 0

  statement {
    sid     = "BedrockInvokeTitanEmbeddings"
    effect  = "Allow"
    actions = ["bedrock:InvokeModel"]

    resources = [
      "arn:aws:bedrock:*::foundation-model/amazon.titan-embed-text-v2:0",
      "arn:aws:bedrock:*:*:inference-profile/*",
    ]
  }
}

resource "aws_iam_role_policy" "bedrock_embed" {
  count = var.enabled ? 1 : 0

  name   = "bedrock-titan-embed"
  role   = aws_iam_role.crawler[0].id
  policy = data.aws_iam_policy_document.bedrock_embed[0].json
}

# Read the DATABASE_URL secret.
data "aws_iam_policy_document" "secret_read" {
  count = var.enabled ? 1 : 0

  statement {
    sid       = "ReadDatabaseUrlSecret"
    effect    = "Allow"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [var.database_url_secret_arn]
  }
}

resource "aws_iam_role_policy" "secret_read" {
  count = var.enabled ? 1 : 0

  name   = "read-database-url-secret"
  role   = aws_iam_role.crawler[0].id
  policy = data.aws_iam_policy_document.secret_read[0].json
}

# ── CloudWatch log group ──────────────────────────────────────────────────────

resource "aws_cloudwatch_log_group" "crawler" {
  count = var.enabled ? 1 : 0

  name              = "/aws/lambda/${local.function_name}"
  retention_in_days = var.log_retention_days

  tags = merge(local.common_tags, {
    Name                 = "/aws/lambda/${local.function_name}"
    "aria:resource_type" = "observability"
  })
}

# ── Lambda function ───────────────────────────────────────────────────────────

resource "aws_lambda_function" "crawler" {
  count = var.enabled ? 1 : 0

  function_name = local.function_name
  description   = "Guardrail Advisor — crawls platform docs, refreshes the RAG corpus"
  role          = aws_iam_role.crawler[0].arn

  filename         = data.archive_file.crawler_zip[0].output_path
  source_code_hash = data.archive_file.crawler_zip[0].output_base64sha256
  handler          = "index.handler"
  runtime          = "nodejs20.x"

  memory_size = var.lambda_memory_size
  timeout     = var.lambda_timeout

  vpc_config {
    subnet_ids         = var.subnet_ids
    security_group_ids = var.security_group_ids
  }

  environment {
    variables = {
      BEDROCK_REGION          = var.bedrock_region
      DATABASE_URL_SECRET_ARN = var.database_url_secret_arn
      LOG_LEVEL               = "INFO"
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.crawler,
    aws_iam_role_policy_attachment.basic_execution,
    aws_iam_role_policy_attachment.vpc_access,
  ]

  tags = merge(local.common_tags, {
    Name                 = local.function_name
    "aria:resource_type" = "serverless"
  })
}

# ── EventBridge schedule ──────────────────────────────────────────────────────

resource "aws_cloudwatch_event_rule" "weekly_crawl" {
  count = var.enabled ? 1 : 0

  name                = "${local.name_prefix}-guardrail-crawl"
  description         = "Weekly Guardrail Advisor documentation crawl"
  schedule_expression = var.schedule_expression

  tags = merge(local.common_tags, {
    Name                 = "${local.name_prefix}-guardrail-crawl"
    "aria:resource_type" = "scheduler"
  })
}

resource "aws_cloudwatch_event_target" "crawler" {
  count = var.enabled ? 1 : 0

  rule      = aws_cloudwatch_event_rule.weekly_crawl[0].name
  target_id = "guardrail-doc-crawler"
  arn       = aws_lambda_function.crawler[0].arn
}

resource "aws_lambda_permission" "allow_eventbridge" {
  count = var.enabled ? 1 : 0

  statement_id  = "AllowEventBridgeInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.crawler[0].function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.weekly_crawl[0].arn
}
