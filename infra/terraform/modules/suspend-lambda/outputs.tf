output "suspend_check_lambda_arn" {
  description = "ARN of the suspend-check Lambda"
  value       = aws_lambda_function.suspend_check.arn
}

output "suspend_check_lambda_name" {
  description = "Name of the suspend-check Lambda"
  value       = aws_lambda_function.suspend_check.function_name
}

output "resume_lambda_arn" {
  description = "ARN of the resume Lambda"
  value       = aws_lambda_function.resume.arn
}

output "resume_lambda_name" {
  description = "Name of the resume Lambda"
  value       = aws_lambda_function.resume.function_name
}

output "eventbridge_rule_arn" {
  description = "ARN of the EventBridge schedule that invokes the suspend-check Lambda"
  value       = aws_cloudwatch_event_rule.suspend_check.arn
}

output "dlq_arn" {
  description = "ARN of the suspend DLQ"
  value       = aws_sqs_queue.suspend_dlq.arn
}
