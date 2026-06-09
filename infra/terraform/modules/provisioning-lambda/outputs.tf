output "api_endpoint" {
  description = "API Gateway endpoint URL"
  value       = "${aws_apigatewayv2_api.provisioner_api.api_endpoint}/${aws_apigatewayv2_stage.provisioner_stage.name}"
}

output "lambda_function_name" {
  description = "Lambda function name"
  value       = aws_lambda_function.provisioner.function_name
}

output "lambda_function_arn" {
  description = "Lambda function ARN"
  value       = aws_lambda_function.provisioner.arn
}

# ── Security Outputs ────────────────────────────────────────────────────────

output "jwt_authorizer_id" {
  description = "API Gateway JWT Authorizer ID"
  value       = aws_apigatewayv2_authorizer.jwt.id
}

output "waf_arn" {
  description = "WAF Web ACL ARN"
  value       = aws_wafv2_web_acl.provisioner_waf.arn
}

output "cloudwatch_log_group" {
  description = "CloudWatch log group for Lambda"
  value       = aws_cloudwatch_log_group.lambda_logs.name
}

output "api_gateway_log_group" {
  description = "CloudWatch log group for API Gateway"
  value       = aws_cloudwatch_log_group.api_logs.name
}

output "cloudtrail_name" {
  description = "CloudTrail name for audit logging"
  value       = aws_cloudtrail.provisioner_trail.name
}

output "api_id" {
  description = "API Gateway API ID"
  value       = aws_apigatewayv2_api.provisioner_api.id
}

output "stage_name" {
  description = "API Gateway stage name"
  value       = aws_apigatewayv2_stage.provisioner_stage.name
}
