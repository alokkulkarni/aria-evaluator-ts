output "api_endpoint" {
  description = "Base URL of the HTTP API (e.g. https://<id>.execute-api.<region>.amazonaws.com)"
  value       = var.enabled ? aws_apigatewayv2_api.bedrock_proxy[0].api_endpoint : null
}

output "api_id" {
  description = "ID of the HTTP API Gateway"
  value       = var.enabled ? aws_apigatewayv2_api.bedrock_proxy[0].id : null
}

output "lambda_arn" {
  description = "ARN of the Bedrock proxy Lambda function"
  value       = var.enabled ? aws_lambda_function.bedrock_proxy[0].arn : null
}

output "lambda_function_name" {
  description = "Name of the Bedrock proxy Lambda function"
  value       = var.enabled ? aws_lambda_function.bedrock_proxy[0].function_name : null
}

output "lambda_role_arn" {
  description = "ARN of the IAM execution role attached to the Lambda"
  value       = var.enabled ? aws_iam_role.bedrock_lambda[0].arn : null
}

output "chat_endpoint" {
  description = "Full URL for the POST /chat endpoint"
  value       = var.enabled ? "${aws_apigatewayv2_api.bedrock_proxy[0].api_endpoint}/chat" : null
}

output "health_endpoint" {
  description = "Full URL for the GET /health endpoint"
  value       = var.enabled ? "${aws_apigatewayv2_api.bedrock_proxy[0].api_endpoint}/health" : null
}
