# modules/platform/outputs.tf — wiring for modules/tenant-service.

output "cluster_arn" {
  description = "Shared ECS cluster ARN."
  value       = aws_ecs_cluster.main.arn
}

output "cluster_name" {
  description = "Shared ECS cluster name."
  value       = aws_ecs_cluster.main.name
}

output "vpc_id" {
  description = "Shared VPC id."
  value       = module.networking.vpc_id
}

output "private_subnet_ids" {
  description = "Private subnet ids for tenant tasks."
  value       = module.networking.private_subnet_ids
}

output "tenant_ecs_sg_id" {
  description = "Security group for tenant ECS tasks."
  value       = module.networking.ecs_service_security_group_id
}

output "alb_https_listener_arn" {
  description = "Shared ALB HTTPS listener ARN (attach per-tenant host rules here)."
  value       = aws_lb_listener.https.arn
}

output "alb_dns_name" {
  description = "Shared ALB DNS name."
  value       = aws_lb.main.dns_name
}

output "alb_zone_id" {
  description = "Shared ALB hosted zone id (for Route53 aliases)."
  value       = aws_lb.main.zone_id
}

output "database_url_secret_arn" {
  description = "Secrets Manager ARN with the shared Aurora DATABASE_URL."
  value       = module.aurora.database_url_secret_arn
}

output "execution_role_arn" {
  description = "Shared ECS task execution role ARN."
  value       = module.iam.task_execution_role_arn
}

output "task_role_arn" {
  description = "Shared ECS task role ARN."
  value       = module.iam.task_role_arn
}

output "state_bucket_name" {
  description = "Shared S3 state bucket name."
  value       = aws_s3_bucket.state.id
}

output "redis_host" {
  description = "Shared Redis endpoint host."
  value       = aws_elasticache_cluster.redis.cache_nodes[0].address
}

output "redis_port" {
  description = "Shared Redis port."
  value       = 6379
}

output "domain" {
  description = "Base domain for tenant subdomains."
  value       = var.domain
}
