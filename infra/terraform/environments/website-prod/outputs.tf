# ── Frontend outputs ──────────────────────────────────────────────────────────

output "website_url" {
  description = "Production website URL"
  value       = module.frontend.website_url
}

output "cloudfront_domain_name" {
  description = "CloudFront distribution domain"
  value       = module.frontend.cloudfront_domain_name
}

output "cloudfront_distribution_id" {
  description = "Used for cache invalidation in CI/CD"
  value       = module.frontend.cloudfront_distribution_id
}

output "s3_bucket_name" {
  description = "S3 bucket for static website files — deploy with: aws s3 sync out/ s3://<bucket>"
  value       = module.frontend.s3_bucket_name
}

# ── Auth Backend outputs ──────────────────────────────────────────────────────

output "auth_ecr_repository_url" {
  description = "Push auth backend Docker image here"
  value       = module.auth_backend.ecr_repository_url
}

output "auth_ecs_cluster_name" {
  value = module.auth_backend.ecs_cluster_name
}

output "auth_ecs_service_name" {
  value = module.auth_backend.ecs_service_name
}

output "auth_alb_dns_name" {
  value = module.auth_backend.alb_dns_name
}

output "auth_log_group_name" {
  value = module.auth_backend.log_group_name
}

# ── Cognito outputs ───────────────────────────────────────────────────────────

output "cognito_enabled" {
  description = "Whether Cognito social auth broker is enabled"
  value       = var.enable_cognito
}

output "cognito_user_pool_id" {
  description = "Cognito User Pool ID"
  value       = try(module.cognito[0].user_pool_id, "")
}

output "cognito_app_client_id" {
  description = "Cognito app client ID used by NextAuth"
  value       = try(module.cognito[0].app_client_id, "")
}

output "cognito_issuer" {
  description = "OIDC issuer configured in NextAuth Cognito provider"
  value       = try(module.cognito[0].issuer, "")
}

output "cognito_idp_response_url" {
  description = "Set this as callback URL in Google and Apple app settings"
  value       = try(module.cognito[0].idp_response_url, "")
}

output "cognito_apple_enabled" {
  description = "Whether Sign in with Apple is enabled in Cognito"
  value       = try(module.cognito[0].apple_enabled, false)
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
