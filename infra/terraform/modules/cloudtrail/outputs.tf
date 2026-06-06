output "trail_arn" {
  description = "ARN of the CloudTrail trail"
  value       = aws_cloudtrail.main.arn
}

output "trail_name" {
  description = "Name of the CloudTrail trail"
  value       = aws_cloudtrail.main.name
}

output "trail_home_region" {
  description = "Home region of the trail"
  value       = aws_cloudtrail.main.home_region
}

output "s3_bucket_name" {
  description = "S3 bucket receiving CloudTrail log files"
  value       = aws_s3_bucket.trail.id
}

output "s3_bucket_arn" {
  description = "ARN of the CloudTrail S3 bucket"
  value       = aws_s3_bucket.trail.arn
}

output "cloudwatch_log_group_name" {
  description = "CloudWatch log group name for CloudTrail events (null when CW integration disabled)"
  value       = var.enable_cloudwatch_logs ? aws_cloudwatch_log_group.trail[0].name : null
}

output "cloudwatch_log_group_arn" {
  description = "CloudWatch log group ARN for CloudTrail events"
  value       = var.enable_cloudwatch_logs ? aws_cloudwatch_log_group.trail[0].arn : null
}

output "alarm_count" {
  description = "Number of CIS-recommended CloudWatch alarms created"
  value       = length(aws_cloudwatch_metric_alarm.cis)
}
