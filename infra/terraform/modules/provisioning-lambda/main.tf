# Lambda function for triggering CodeBuild to provision evaluator instances
# API endpoint: POST /provision-evaluator
# Receives: user_id, plan_type
# Triggers: CodeBuild project to run terraform apply

locals {
  lambda_name = "${var.app_name}-provisioner"
}

# ── IAM role for Lambda ────────────────────────────────────────────────────

resource "aws_iam_role" "lambda_role" {
  name = "${local.lambda_name}-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })

  tags = var.tags
}

# Basic Lambda execution policy
resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# CodeBuild trigger permission
resource "aws_iam_role_policy" "lambda_codebuild" {
  name = "${local.lambda_name}-codebuild"
  role = aws_iam_role.lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "codebuild:BatchGetBuilds",
          "codebuild:StartBuild"
        ]
        Resource = var.codebuild_project_arn
      }
    ]
  })
}

# DynamoDB permission
resource "aws_iam_role_policy" "lambda_dynamodb" {
  name = "${local.lambda_name}-dynamodb"
  role = aws_iam_role.lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:PutItem",
          "dynamodb:GetItem",
          "dynamodb:UpdateItem",
          "dynamodb:Query"
        ]
        Resource = var.user_instance_table_arn
      }
    ]
  })
}

# ── Lambda Function ────────────────────────────────────────────────────────

resource "aws_lambda_function" "provisioner" {
  filename         = data.archive_file.lambda_code.output_path
  function_name    = local.lambda_name
  role             = aws_iam_role.lambda_role.arn
  handler          = "index.handler"
  source_code_hash = data.archive_file.lambda_code.output_base64sha256
  runtime          = "nodejs18.x"
  timeout          = 60

  environment {
    variables = {
      CODEBUILD_PROJECT_NAME = var.codebuild_project_name
      USER_INSTANCE_TABLE     = var.user_instance_table_name
      AWS_REGION              = var.aws_region
    }
  }

  tags = var.tags
}

# ── Lambda Code ────────────────────────────────────────────────────────────

data "archive_file" "lambda_code" {
  type        = "zip"
  source_dir  = "${path.module}/lambda"
  output_path = "${path.module}/lambda.zip"
}

# ── API Gateway for Lambda ────────────────────────────────────────────────────

resource "aws_apigatewayv2_api" "provisioner_api" {
  name          = "${local.lambda_name}-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = var.allowed_origins
    allow_methods = ["POST", "OPTIONS"]
    allow_headers = ["Content-Type", "Authorization"]
  }

  tags = var.tags
}

resource "aws_apigatewayv2_integration" "lambda_integration" {
  api_id             = aws_apigatewayv2_api.provisioner_api.id
  integration_type   = "AWS_PROXY"
  integration_method = "POST"
  payload_format_version = "2.0"
  target             = "arn:aws:apigateway:${var.aws_region}:lambda:path/2015-03-31/functions/${aws_lambda_function.provisioner.arn}/invocations"
}

resource "aws_apigatewayv2_route" "provision_route" {
  api_id    = aws_apigatewayv2_api.provisioner_api.id
  route_key = "POST /provision-evaluator"
  target    = "integrations/${aws_apigatewayv2_integration.lambda_integration.id}"

  authorization_type = "AWS_IAM"
}

# Route for status check
resource "aws_apigatewayv2_route" "status_route" {
  api_id    = aws_apigatewayv2_api.provisioner_api.id
  route_key = "GET /provision-status/{buildId}"
  target    = "integrations/${aws_apigatewayv2_integration.lambda_integration.id}"

  authorization_type = "AWS_IAM"
}

# ── API Gateway Stage ────────────────────────────────────────────────────────

resource "aws_apigatewayv2_stage" "provisioner_stage" {
  api_id      = aws_apigatewayv2_api.provisioner_api.id
  name        = "prod"
  auto_deploy = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api_logs.arn
    format = jsonencode({
      requestId      = "$context.requestId"
      ip             = "$context.identity.sourceIp"
      requestTime    = "$context.requestTime"
      httpMethod     = "$context.httpMethod"
      resourcePath   = "$context.resourcePath"
      status         = "$context.status"
      protocol       = "$context.protocol"
      responseLength = "$context.responseLength"
      integrationLatency = "$context.integration.latency"
    })
  }

  tags = var.tags
}

# ── CloudWatch Logs ────────────────────────────────────────────────────────

resource "aws_cloudwatch_log_group" "lambda_logs" {
  name              = "/aws/lambda/${local.lambda_name}"
  retention_in_days = 30

  tags = var.tags
}

resource "aws_cloudwatch_log_group" "api_logs" {
  name              = "/aws/apigateway/${local.lambda_name}"
  retention_in_days = 30

  tags = var.tags
}

# ── Lambda permissions for API Gateway ────────────────────────────────────

resource "aws_lambda_permission" "api_gateway" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.provisioner.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.provisioner_api.execution_arn}/*/*"
}
