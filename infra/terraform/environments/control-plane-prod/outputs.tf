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
