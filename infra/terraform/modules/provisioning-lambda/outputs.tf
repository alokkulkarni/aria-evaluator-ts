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
