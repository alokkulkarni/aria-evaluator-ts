output "website_url" {
  description = "Public URL of the dev website"
  value       = module.website.website_url
}

output "cloudfront_url" {
  description = "CloudFront distribution URL"
  value       = module.website.cloudfront_url
}

output "ecr_repository_url" {
  description = "Push your Next.js Docker image to this ECR repo"
  value       = module.website.ecr_repository_url
}

output "ecs_cluster_name" {
  value = module.website.ecs_cluster_name
}

output "ecs_service_name" {
  value = module.website.ecs_service_name
}

output "log_group_name" {
  value = module.website.log_group_name
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
