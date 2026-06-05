locals {
  name_prefix = "${var.app_name}-${var.environment}"
  common_tags = merge(
    var.tags,
    {
      ManagedBy   = "terraform"
      Project     = "aria-evaluator"
      Environment = var.environment
      AppName     = var.app_name
    },
    var.tenant_id != "" ? { "aria:tenant_id" = var.tenant_id } : {},
    var.pricing_tier != "" ? { "aria:pricing_tier" = var.pricing_tier } : {},
  )

  # Parse CORS origins into a list for the HTTP API cors_configuration block.
  # The Lambda handler also receives the raw comma-separated string for its own
  # response-header logic (covers cases where API GW passes the request through).
  allowed_origins_list = [for o in split(",", var.allowed_origins) : trimspace(o)]
}

# ── Lambda deployment package ─────────────────────────────────────────────────

data "archive_file" "lambda_zip" {
  count = var.enabled ? 1 : 0

  type = "zip"

  # source_dir is resolved relative to the environment root (path.root) so the
  # path is correct regardless of which environment calls this module.
  # Repo layout:  environments/<env>/  →  ../../lambda/bedrock_proxy
  source_dir = "${path.root}/../../lambda/bedrock_proxy"

  # Write the zip alongside the module — path.module always exists and is
  # writable during plan/apply. The file is excluded from git via .gitignore.
  output_path = "${path.module}/.build/bedrock_proxy_${var.environment}.zip"
}

# ── IAM role ──────────────────────────────────────────────────────────────────

data "aws_iam_policy_document" "lambda_assume_role" {
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

resource "aws_iam_role" "bedrock_lambda" {
  count = var.enabled ? 1 : 0

  name               = "${local.name_prefix}-bedrock-lambda"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role[0].json

  tags = merge(local.common_tags, {
    Name                 = "${local.name_prefix}-bedrock-lambda"
    "aria:resource_type" = "security"
  })
}

# Basic execution (CloudWatch Logs)
resource "aws_iam_role_policy_attachment" "basic_execution" {
  count = var.enabled ? 1 : 0

  role       = aws_iam_role.bedrock_lambda[0].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# Bedrock invocation — intentionally broad across regions and model types so that
# the same Lambda can route to any model ID, ARN, or cross-region inference profile
# passed via the BEDROCK_MODEL_ID environment variable.
data "aws_iam_policy_document" "bedrock_invoke" {
  count = var.enabled ? 1 : 0

  statement {
    sid    = "BedrockInvokeFoundationModels"
    effect = "Allow"

    actions = [
      "bedrock:InvokeModel",
      "bedrock:InvokeModelWithResponseStream",
    ]

    resources = [
      "arn:aws:bedrock:*::foundation-model/*",
      "arn:aws:bedrock:*:*:inference-profile/*",
      "arn:aws:bedrock:*:*:provisioned-model/*",
    ]
  }
}

resource "aws_iam_role_policy" "bedrock_invoke" {
  count = var.enabled ? 1 : 0

  name   = "bedrock-invoke"
  role   = aws_iam_role.bedrock_lambda[0].id
  policy = data.aws_iam_policy_document.bedrock_invoke[0].json
}

# ── CloudWatch log group ───────────────────────────────────────────────────────

resource "aws_cloudwatch_log_group" "bedrock_lambda" {
  count = var.enabled ? 1 : 0

  name              = "/aws/lambda/${local.name_prefix}-bedrock-proxy"
  retention_in_days = var.log_retention_days

  tags = merge(local.common_tags, {
    Name                 = "/aws/lambda/${local.name_prefix}-bedrock-proxy"
    "aria:resource_type" = "observability"
  })
}

# ── Lambda function ───────────────────────────────────────────────────────────

resource "aws_lambda_function" "bedrock_proxy" {
  count = var.enabled ? 1 : 0

  function_name = "${local.name_prefix}-bedrock-proxy"
  description   = "Bedrock proxy — exposes any Bedrock model as an HTTP API endpoint"
  role          = aws_iam_role.bedrock_lambda[0].arn

  filename         = data.archive_file.lambda_zip[0].output_path
  source_code_hash = data.archive_file.lambda_zip[0].output_base64sha256
  handler          = "handler.lambda_handler"
  runtime          = "python3.12"

  memory_size = var.lambda_memory_size
  timeout     = var.lambda_timeout

  # Ensure the log group exists before the function is created so that the
  # first cold-start log stream lands in the managed group (with retention).
  depends_on = [
    aws_cloudwatch_log_group.bedrock_lambda,
    aws_iam_role_policy_attachment.basic_execution,
  ]

  environment {
    variables = {
      BEDROCK_MODEL_ID = var.bedrock_model_id
      BEDROCK_REGION   = var.bedrock_region
      SYSTEM_PROMPT    = var.system_prompt
      MAX_TOKENS       = tostring(var.max_tokens)
      TEMPERATURE      = tostring(var.temperature)
      TOP_P            = tostring(var.top_p)
      ALLOWED_ORIGINS  = var.allowed_origins
      LOG_LEVEL        = "INFO"
    }
  }

  tags = merge(local.common_tags, {
    Name                 = "${local.name_prefix}-bedrock-proxy"
    "aria:resource_type" = "serverless"
  })
}

# ── HTTP API (API Gateway v2) ─────────────────────────────────────────────────

resource "aws_apigatewayv2_api" "bedrock_proxy" {
  count = var.enabled ? 1 : 0

  name          = "${local.name_prefix}-bedrock-proxy"
  protocol_type = "HTTP"
  description   = "HTTP API in front of the Bedrock proxy Lambda"

  cors_configuration {
    allow_origins = local.allowed_origins_list
    allow_methods = ["GET", "POST", "OPTIONS"]
    allow_headers = ["Content-Type", "Authorization"]
    max_age       = 300
  }

  tags = merge(local.common_tags, {
    Name                 = "${local.name_prefix}-bedrock-proxy"
    "aria:resource_type" = "network"
  })
}

# Lambda proxy integration — payload format 2.0 so the handler receives a clean
# HTTP API event (not the REST API proxy format).
resource "aws_apigatewayv2_integration" "bedrock_proxy" {
  count = var.enabled ? 1 : 0

  api_id                 = aws_apigatewayv2_api.bedrock_proxy[0].id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.bedrock_proxy[0].invoke_arn
  payload_format_version = "2.0"
}

# POST /chat — requires callers to sign requests with AWS SigV4 (IAM auth)
resource "aws_apigatewayv2_route" "chat" {
  count = var.enabled ? 1 : 0

  api_id             = aws_apigatewayv2_api.bedrock_proxy[0].id
  route_key          = "POST /chat"
  authorization_type = "AWS_IAM"
  target             = "integrations/${aws_apigatewayv2_integration.bedrock_proxy[0].id}"
}

# GET /health — unauthenticated liveness check
resource "aws_apigatewayv2_route" "health" {
  count = var.enabled ? 1 : 0

  api_id    = aws_apigatewayv2_api.bedrock_proxy[0].id
  route_key = "GET /health"
  target    = "integrations/${aws_apigatewayv2_integration.bedrock_proxy[0].id}"
}

# $default stage with auto-deploy so every Terraform apply is immediately live
resource "aws_apigatewayv2_stage" "default" {
  count = var.enabled ? 1 : 0

  api_id      = aws_apigatewayv2_api.bedrock_proxy[0].id
  name        = "$default"
  auto_deploy = true

  tags = merge(local.common_tags, {
    Name                 = "${local.name_prefix}-bedrock-proxy-default"
    "aria:resource_type" = "network"
  })
}

resource "aws_lambda_permission" "apigw_invoke" {
  count = var.enabled ? 1 : 0

  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.bedrock_proxy[0].function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.bedrock_proxy[0].execution_arn}/*/*"
}
