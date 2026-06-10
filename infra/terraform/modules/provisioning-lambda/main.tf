# Lambda function for triggering CodeBuild to provision evaluator instances
# API endpoint: POST /provision-evaluator
# Receives: user_id, plan_type
# Triggers: CodeBuild project to run terraform apply

locals {
  lambda_name         = "${var.app_name}-provisioner"
  xray_layer_zip_path = abspath("${path.module}/xray-layer.zip")
}

# ── IAM role for Lambda ────────────────────────────────────────────────────

resource "aws_iam_role" "lambda_role" {
  name_prefix = "${var.app_name}-${var.environment}-role-"

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
      USER_INSTANCE_TABLE    = var.user_instance_table_name
      COGNITO_USER_POOL_ID   = var.cognito_user_pool_id
      MAX_INSTANCES_PER_USER = var.max_instances_per_user
      MAX_MONTHLY_SPEND      = var.max_monthly_spend_per_user
      COST_PER_INSTANCE_HOUR = var.cost_per_instance_hour
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
    allow_methods = ["POST", "GET", "OPTIONS"]
    allow_headers = ["Content-Type", "Authorization"]
  }

  tags = var.tags
}

resource "aws_apigatewayv2_integration" "lambda_integration" {
  api_id                 = aws_apigatewayv2_api.provisioner_api.id
  integration_type       = "AWS_PROXY"
  integration_method     = "POST"
  integration_uri        = aws_lambda_function.provisioner.invoke_arn
  payload_format_version = "2.0"
}

# ── API Gateway Stage ────────────────────────────────────────────────────────

resource "aws_apigatewayv2_stage" "provisioner_stage" {
  api_id      = aws_apigatewayv2_api.provisioner_api.id
  name        = "prod"
  auto_deploy = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api_logs.arn
    format = jsonencode({
      requestId          = "$context.requestId"
      ip                 = "$context.identity.sourceIp"
      requestTime        = "$context.requestTime"
      httpMethod         = "$context.httpMethod"
      resourcePath       = "$context.resourcePath"
      status             = "$context.status"
      protocol           = "$context.protocol"
      responseLength     = "$context.responseLength"
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

# ── JWT Authorizer ────────────────────────────────────────────────────────────

resource "aws_apigatewayv2_authorizer" "jwt" {
  api_id           = aws_apigatewayv2_api.provisioner_api.id
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]
  name             = "${local.lambda_name}-jwt-authorizer"

  jwt_configuration {
    audience = [var.jwt_audience]
    issuer   = "https://cognito-idp.${var.aws_region}.amazonaws.com/${var.cognito_user_pool_id}"
  }
}

# ── Routes with JWT Authorization ──────────────────────────────────────────────

resource "aws_apigatewayv2_route" "provision_route_secured" {
  api_id             = aws_apigatewayv2_api.provisioner_api.id
  route_key          = "POST /provision-evaluator"
  target             = "integrations/${aws_apigatewayv2_integration.lambda_integration.id}"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
  authorization_type = "JWT"
}

resource "aws_apigatewayv2_route" "status_route_secured" {
  api_id             = aws_apigatewayv2_api.provisioner_api.id
  route_key          = "GET /provision-status/{buildId}"
  target             = "integrations/${aws_apigatewayv2_integration.lambda_integration.id}"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
  authorization_type = "JWT"
}

resource "aws_apigatewayv2_route" "instance_url_route_secured" {
  api_id             = aws_apigatewayv2_api.provisioner_api.id
  route_key          = "GET /instance-url"
  target             = "integrations/${aws_apigatewayv2_integration.lambda_integration.id}"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
  authorization_type = "JWT"
}

resource "aws_apigatewayv2_route" "reactivate_route_secured" {
  api_id             = aws_apigatewayv2_api.provisioner_api.id
  route_key          = "POST /reactivate-instance"
  target             = "integrations/${aws_apigatewayv2_integration.lambda_integration.id}"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
  authorization_type = "JWT"
}

resource "aws_apigatewayv2_route" "retry_build_route_secured" {
  api_id             = aws_apigatewayv2_api.provisioner_api.id
  route_key          = "POST /retry-build"
  target             = "integrations/${aws_apigatewayv2_integration.lambda_integration.id}"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
  authorization_type = "JWT"
}

# ── WAF for API Gateway ──────────────────────────────────────────────────────

resource "aws_wafv2_web_acl" "provisioner_waf" {
  name        = "${local.lambda_name}-waf"
  description = "WAF rules for provisioning API"
  scope       = "REGIONAL"

  default_action {
    allow {}
  }

  rule {
    name     = "RateLimitRule"
    priority = 1

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit              = 2000
        aggregate_key_type = "IP"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.lambda_name}-rate-limit"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "AWSManagedRulesCommonRuleSet"
    priority = 2

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.lambda_name}-common-rules"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "AWSManagedRulesKnownBadInputsRuleSet"
    priority = 3

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesKnownBadInputsRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.lambda_name}-bad-inputs"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${local.lambda_name}-waf"
    sampled_requests_enabled   = true
  }

  tags = var.tags
}

# AWS WAFv2 does not accept API Gateway v2 HTTP API stage ARNs here, so the
# ACL is defined for future use but not associated to this stage.

# ── CloudWatch Alarms for Monitoring ─────────────────────────────────────────

resource "aws_cloudwatch_metric_alarm" "lambda_errors" {
  alarm_name          = "${local.lambda_name}-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = "60"
  statistic           = "Sum"
  threshold           = "5"
  alarm_description   = "Alert when Lambda errors exceed threshold"
  alarm_actions       = [var.alarm_sns_topic_arn]

  dimensions = {
    FunctionName = aws_lambda_function.provisioner.function_name
  }
}

resource "aws_cloudwatch_metric_alarm" "lambda_throttles" {
  alarm_name          = "${local.lambda_name}-throttles"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "Throttles"
  namespace           = "AWS/Lambda"
  period              = "60"
  statistic           = "Sum"
  threshold           = "1"
  alarm_description   = "Alert when Lambda is throttled"
  alarm_actions       = [var.alarm_sns_topic_arn]

  dimensions = {
    FunctionName = aws_lambda_function.provisioner.function_name
  }
}

resource "aws_cloudwatch_metric_alarm" "api_gateway_4xx_errors" {
  alarm_name          = "${local.lambda_name}-4xx-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "4XXError"
  namespace           = "AWS/ApiGateway"
  period              = "300"
  statistic           = "Sum"
  threshold           = "20"
  alarm_description   = "Alert when 4xx errors exceed threshold"
  alarm_actions       = [var.alarm_sns_topic_arn]

  dimensions = {
    ApiName = aws_apigatewayv2_api.provisioner_api.name
  }
}

resource "aws_cloudwatch_metric_alarm" "api_gateway_5xx_errors" {
  alarm_name          = "${local.lambda_name}-5xx-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "5XXError"
  namespace           = "AWS/ApiGateway"
  period              = "60"
  statistic           = "Sum"
  threshold           = "1"
  alarm_description   = "Alert when 5xx errors occur"
  alarm_actions       = [var.alarm_sns_topic_arn]

  dimensions = {
    ApiName = aws_apigatewayv2_api.provisioner_api.name
  }
}

# ── X-Ray Tracing for Provisioning Lambda ───────────────────────────────────

resource "aws_iam_role_policy" "lambda_xray" {
  name = "${local.lambda_name}-xray"
  role = aws_iam_role.lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "xray:PutTraceSegments",
          "xray:PutTelemetryRecords"
        ]
        Resource = "*"
      }
    ]
  })
}

resource "aws_lambda_layer_version" "xray_sdk" {
  filename            = local.xray_layer_zip_path
  layer_name          = "${local.lambda_name}-xray-layer"
  compatible_runtimes = ["nodejs18.x"]

  depends_on = [null_resource.create_xray_layer]

  lifecycle {
    ignore_changes = [source_code_hash]
  }
}

resource "null_resource" "create_xray_layer" {
  provisioner "local-exec" {
    command = <<-EOT
      set -e
      mkdir -p /tmp/xray-layer/nodejs
      cd /tmp/xray-layer
      npm init -y > /dev/null 2>&1
      npm install --save aws-xray-sdk-core --prefix ./nodejs > /dev/null 2>&1
      cd /tmp
      zip -r -q "${local.xray_layer_zip_path}" xray-layer/
      echo "X-Ray layer created successfully"
    EOT
  }
}

# ── DynamoDB Encryption and Backup ────────────────────────────────────────────

resource "aws_iam_role_policy" "lambda_kms" {
  name = "${local.lambda_name}-kms"
  role = aws_iam_role.lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:GenerateDataKey"
        ]
        Resource = var.dynamodb_kms_key_arn
      }
    ]
  })
}

# ── CloudTrail for Audit Logging ───────────────────────────────────────────

resource "aws_cloudtrail" "provisioner_trail" {
  name           = "${local.lambda_name}-trail"
  s3_bucket_name = var.cloudtrail_s3_bucket

  depends_on = [aws_s3_bucket_policy.cloudtrail_policy]

  enable_log_file_validation    = true
  is_multi_region_trail         = true
  include_global_service_events = true

  event_selector {
    read_write_type           = "All"
    include_management_events = true

    data_resource {
      type   = "AWS::DynamoDB::Table"
      values = ["arn:aws:dynamodb:${var.aws_region}:${data.aws_caller_identity.current.account_id}:table/${var.user_instance_table_name}"]
    }

    data_resource {
      type   = "AWS::Lambda::Function"
      values = ["arn:aws:lambda:${var.aws_region}:${data.aws_caller_identity.current.account_id}:function:${aws_lambda_function.provisioner.function_name}"]
    }
  }

  tags = var.tags
}

resource "aws_s3_bucket_policy" "cloudtrail_policy" {
  bucket = var.cloudtrail_s3_bucket

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AWSCloudTrailAclCheck"
        Effect = "Allow"
        Principal = {
          Service = "cloudtrail.amazonaws.com"
        }
        Action   = "s3:GetBucketAcl"
        Resource = "arn:aws:s3:::${var.cloudtrail_s3_bucket}"
      },
      {
        Sid    = "AWSCloudTrailWrite"
        Effect = "Allow"
        Principal = {
          Service = "cloudtrail.amazonaws.com"
        }
        Action   = "s3:PutObject"
        Resource = "arn:aws:s3:::${var.cloudtrail_s3_bucket}/*"
        Condition = {
          StringEquals = {
            "s3:x-amz-acl" = "bucket-owner-full-control"
          }
        }
      }
    ]
  })
}

data "aws_caller_identity" "current" {}
