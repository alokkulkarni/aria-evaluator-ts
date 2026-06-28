# Guardrail Advisor — RAG doc crawler infrastructure.
#
# Weekly EventBridge schedule → Lambda that refreshes the platform-doc RAG corpus
# (PlatformDocChunk) and marks affected configs stale. The Lambda needs:
#   - Bedrock InvokeModel for Titan Text Embeddings v2
#   - VPC access + the DB connection secret to reach the (Aurora/RDS) database
#
# Self-contained component (own variables + provider) so it can be validated and
# applied on its own, or wired into an environment. See docs/GUARDRAIL_ADVISOR_PHASE1.md.

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = ">= 2.4"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

# ── Variables ─────────────────────────────────────────────────────────────────

variable "app_name" {
  type    = string
  default = "aria-evaluator"
}

variable "environment" {
  type = string
}

variable "aws_region" {
  type    = string
  default = "eu-west-2"
}

variable "bedrock_region" {
  description = "Region used for Titan embeddings (BEDROCK_REGION env)."
  type        = string
  default     = "eu-west-2"
}

variable "database_url_secret_arn" {
  description = "Secrets Manager ARN holding the Prisma DATABASE_URL the crawler upserts into."
  type        = string
}

variable "subnet_ids" {
  description = "Private subnet IDs the Lambda runs in (must reach the database)."
  type        = list(string)
}

variable "security_group_ids" {
  description = "Security groups granting the Lambda egress to the database."
  type        = list(string)
}

variable "schedule_expression" {
  description = "EventBridge schedule. Default: weekly, Sunday 02:00 UTC."
  type        = string
  default     = "cron(0 2 ? * SUN *)"
}

variable "log_retention_days" {
  type    = number
  default = 30
}

variable "lambda_memory_size" {
  type    = number
  default = 512
}

variable "lambda_timeout" {
  description = "Crawl can be slow (fetch + embed many chunks)."
  type        = number
  default     = 300
}

variable "tags" {
  type    = map(string)
  default = {}
}

# ── Locals ────────────────────────────────────────────────────────────────────

locals {
  name_prefix   = "${var.app_name}-${var.environment}"
  function_name = "${local.name_prefix}-guardrail-doc-crawler"

  common_tags = merge(var.tags, {
    ManagedBy   = "terraform"
    Project     = "aria-evaluator"
    Environment = var.environment
    AppName     = var.app_name
  })
}

# ── Deployment package ────────────────────────────────────────────────────────
# The TS handler is bundled (e.g. esbuild + Prisma engine) into a build dir before
# apply; this zips that output. Path resolved relative to the calling root module.

data "archive_file" "crawler_zip" {
  type        = "zip"
  source_dir  = "${path.root}/../../lambda/guardrail-doc-crawler/dist"
  output_path = "${path.module}/.build/guardrail_doc_crawler_${var.environment}.zip"
}

# ── IAM ───────────────────────────────────────────────────────────────────────

data "aws_iam_policy_document" "assume_role" {
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
  name               = "${local.name_prefix}-guardrail-crawler"
  assume_role_policy = data.aws_iam_policy_document.assume_role.json

  tags = merge(local.common_tags, {
    Name                 = "${local.name_prefix}-guardrail-crawler"
    "aria:resource_type" = "security"
  })
}

# CloudWatch Logs.
resource "aws_iam_role_policy_attachment" "basic_execution" {
  role       = aws_iam_role.crawler.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# ENI management so the Lambda can run in the VPC and reach the database.
resource "aws_iam_role_policy_attachment" "vpc_access" {
  role       = aws_iam_role.crawler.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

# Bedrock InvokeModel — scoped to the Titan embeddings model + inference profiles.
data "aws_iam_policy_document" "bedrock_embed" {
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
  name   = "bedrock-titan-embed"
  role   = aws_iam_role.crawler.id
  policy = data.aws_iam_policy_document.bedrock_embed.json
}

# Read the DATABASE_URL secret.
data "aws_iam_policy_document" "secret_read" {
  statement {
    sid       = "ReadDatabaseUrlSecret"
    effect    = "Allow"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [var.database_url_secret_arn]
  }
}

resource "aws_iam_role_policy" "secret_read" {
  name   = "read-database-url-secret"
  role   = aws_iam_role.crawler.id
  policy = data.aws_iam_policy_document.secret_read.json
}

# ── CloudWatch log group ──────────────────────────────────────────────────────

resource "aws_cloudwatch_log_group" "crawler" {
  name              = "/aws/lambda/${local.function_name}"
  retention_in_days = var.log_retention_days

  tags = merge(local.common_tags, {
    Name                 = "/aws/lambda/${local.function_name}"
    "aria:resource_type" = "observability"
  })
}

# ── Lambda function ───────────────────────────────────────────────────────────

resource "aws_lambda_function" "crawler" {
  function_name = local.function_name
  description   = "Guardrail Advisor — crawls platform docs, refreshes the RAG corpus"
  role          = aws_iam_role.crawler.arn

  filename         = data.archive_file.crawler_zip.output_path
  source_code_hash = data.archive_file.crawler_zip.output_base64sha256
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
  name                = "${local.name_prefix}-guardrail-crawl"
  description         = "Weekly Guardrail Advisor documentation crawl"
  schedule_expression = var.schedule_expression

  tags = merge(local.common_tags, {
    Name                 = "${local.name_prefix}-guardrail-crawl"
    "aria:resource_type" = "scheduler"
  })
}

resource "aws_cloudwatch_event_target" "crawler" {
  rule      = aws_cloudwatch_event_rule.weekly_crawl.name
  target_id = "guardrail-doc-crawler"
  arn       = aws_lambda_function.crawler.arn
}

resource "aws_lambda_permission" "allow_eventbridge" {
  statement_id  = "AllowEventBridgeInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.crawler.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.weekly_crawl.arn
}

# ── Outputs ───────────────────────────────────────────────────────────────────

output "guardrail_crawler_function_name" {
  value = aws_lambda_function.crawler.function_name
}

output "guardrail_crawler_function_arn" {
  value = aws_lambda_function.crawler.arn
}

output "guardrail_crawler_role_arn" {
  value = aws_iam_role.crawler.arn
}
