output "control_plane_url" {
  value = "http://${module.alb.alb_dns_name}"
}

# ── CloudTrail outputs ────────────────────────────────────────────────────────

output "cloudtrail_trail_arn" {
  description = "ARN of the CloudTrail trail"
  value       = module.cloudtrail.trail_arn
}

output "cloudtrail_s3_bucket" {
  description = "S3 bucket receiving CloudTrail log files"
  value       = module.cloudtrail.s3_bucket_name
}

output "cloudtrail_log_group" {
  description = "CloudWatch log group for CloudTrail events"
  value       = module.cloudtrail.cloudwatch_log_group_name
}

output "cloudtrail_alarm_count" {
  description = "Number of CIS-recommended CloudWatch alarms created"
  value       = module.cloudtrail.alarm_count
}

# ── Provisioning infrastructure outputs ────────────────────────────────────────

output "provisioning_api_endpoint" {
  description = "API Gateway endpoint for instance provisioning"
  value       = module.provisioning_lambda.api_endpoint_url
}

output "provisioning_lambda_arn" {
  description = "ARN of the provisioning Lambda function"
  value       = module.provisioning_lambda.lambda_arn
}

output "user_instances_table_name" {
  description = "DynamoDB table name for tracking user instances"
  value       = aws_dynamodb_table.user_instances.name
}

output "user_instances_table_arn" {
  description = "DynamoDB table ARN for user instance tracking"
  value       = aws_dynamodb_table.user_instances.arn
}
