output "vpc_id" {
  description = "ID of the tenant VPC"
  value       = module.networking.vpc_id
}

output "alb_dns_name" {
  description = "DNS name of the tenant ALB"
  value       = module.alb.alb_dns_name
}

output "cloudfront_domain_name" {
  description = "CloudFront domain name when edge delivery is enabled"
  value       = var.cloudfront_enabled ? module.cloudfront[0].distribution_domain_name : null
}

output "ecs_cluster_name" {
  description = "Tenant ECS cluster name"
  value       = module.ecs.cluster_name
}

output "ecs_service_name" {
  description = "Tenant ECS service name"
  value       = module.ecs.service_name
}

output "s3_bucket_name" {
  description = "Tenant application state bucket name"
  value       = module.s3.bucket_name
}

output "resume_lambda_arn" {
  description = "ARN of the tenant resume Lambda"
  value       = module.suspend_lambda.resume_lambda_arn
}

output "log_group_name" {
  description = "Primary tenant application log group name"
  value       = module.observability.app_log_group_name
}

output "dashboard_name" {
  description = "Tenant CloudWatch dashboard name"
  value       = module.observability.dashboard_name
}

output "sns_topic_arn" {
  description = "Tenant observability SNS topic ARN"
  value       = module.observability.sns_topic_arn
}

output "cf_origin_secret_arn" {
  description = "Secrets Manager ARN storing the CloudFront origin secret"
  value       = var.cloudfront_enabled ? aws_secretsmanager_secret.cf_origin_secret[0].arn : null
}
