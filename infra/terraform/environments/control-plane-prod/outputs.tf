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
  value       = module.provisioning_lambda.api_endpoint
}

output "provisioning_lambda_arn" {
  description = "ARN of the provisioning Lambda function"
  value       = module.provisioning_lambda.lambda_function_arn
}

output "user_instances_table_name" {
  description = "DynamoDB table name for tracking user instances"
  value       = aws_dynamodb_table.user_instances.name
}

output "user_instances_table_arn" {
  description = "DynamoDB table ARN for user instance tracking"
  value       = aws_dynamodb_table.user_instances.arn
}

# ── Security Infrastructure Outputs ────────────────────────────────────────────

output "jwt_authorizer_id" {
  description = "API Gateway JWT Authorizer ID"
  value       = module.provisioning_lambda.jwt_authorizer_id
}

output "api_waf_arn" {
  description = "ARN of WAF Web ACL protecting the provisioning API"
  value       = module.provisioning_lambda.waf_arn
}

output "provisioning_lambda_log_group" {
  description = "CloudWatch log group for provisioning Lambda"
  value       = module.provisioning_lambda.cloudwatch_log_group
}

output "provisioning_api_log_group" {
  description = "CloudWatch log group for provisioning API Gateway"
  value       = module.provisioning_lambda.api_gateway_log_group
}

output "provisioning_cloudtrail_name" {
  description = "CloudTrail name for provisioning API audit logs"
  value       = module.provisioning_lambda.cloudtrail_name
}

output "dynamodb_encryption_key_arn" {
  description = "ARN of KMS key for DynamoDB encryption"
  value       = aws_kms_key.dynamodb.arn
}

output "cloudtrail_logs_bucket" {
  description = "S3 bucket for CloudTrail logs"
  value       = aws_s3_bucket.cloudtrail_logs.id
}

output "provisioning_alarms_sns_topic" {
  description = "SNS topic for provisioning alarm notifications"
  value       = aws_sns_topic.provisioning_alarms.arn
}
