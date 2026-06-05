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
