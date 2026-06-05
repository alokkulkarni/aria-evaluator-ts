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
