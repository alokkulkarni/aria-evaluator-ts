output "app_log_group_name" {
  description = "Application log group name"
  value       = aws_cloudwatch_log_group.app.name
}

output "app_log_group_arn" {
  description = "Application log group ARN"
  value       = aws_cloudwatch_log_group.app.arn
}

output "sns_topic_arn" {
  description = "SNS topic ARN for tenant alerts"
  value       = aws_sns_topic.alerts.arn
}

output "dashboard_name" {
  description = "CloudWatch dashboard name"
  value       = aws_cloudwatch_dashboard.this.dashboard_name
}

output "xray_group_arn" {
  description = "ARN of the X-Ray group when tracing is enabled"
  value       = try(aws_xray_group.this[0].arn, null)
}
