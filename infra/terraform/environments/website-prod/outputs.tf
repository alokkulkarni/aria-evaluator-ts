output "website_url" {
  description = "Production website URL"
  value       = module.website.website_url
}

output "cloudfront_url" {
  value = module.website.cloudfront_url
}

output "cloudfront_distribution_id" {
  description = "Used for cache invalidation in CI/CD"
  value       = module.website.cloudfront_distribution_id
}

output "ecr_repository_url" {
  description = "Push production Docker image here"
  value       = module.website.ecr_repository_url
}

output "ecs_cluster_name" {
  value = module.website.ecs_cluster_name
}

output "ecs_service_name" {
  value = module.website.ecs_service_name
}

output "alb_dns_name" {
  value = module.website.alb_dns_name
}

output "log_group_name" {
  value = module.website.log_group_name
}

output "app_secrets_arn" {
  description = "Secrets Manager ARN — update OAuth credentials here post-deploy"
  value       = module.website.app_secrets_arn
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
