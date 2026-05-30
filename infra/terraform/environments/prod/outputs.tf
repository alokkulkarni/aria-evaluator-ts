# ── Networking ────────────────────────────────────────────────────────────────

output "vpc_id" {
  description = "ID of the VPC"
  value       = module.networking.vpc_id
}

output "public_subnet_ids" {
  description = "IDs of the public subnets"
  value       = module.networking.public_subnet_ids
}

# ── ECR ───────────────────────────────────────────────────────────────────────

output "ecr_repository_url" {
  description = "ECR repository URL — use this as the base for image tags"
  value       = module.ecr.repository_url
}

output "ecr_repository_name" {
  description = "ECR repository name"
  value       = module.ecr.repository_name
}

# ── S3 ────────────────────────────────────────────────────────────────────────

output "state_bucket_name" {
  description = "Name of the S3 state bucket"
  value       = module.s3.bucket_name
}

output "state_bucket_arn" {
  description = "ARN of the S3 state bucket"
  value       = module.s3.bucket_arn
}

# ── IAM ───────────────────────────────────────────────────────────────────────

output "task_execution_role_arn" {
  description = "ARN of the ECS task execution role"
  value       = module.iam.task_execution_role_arn
}

output "task_role_arn" {
  description = "ARN of the ECS task role"
  value       = module.iam.task_role_arn
}

# ── ALB ───────────────────────────────────────────────────────────────────────

output "alb_dns_name" {
  description = "DNS name of the Application Load Balancer"
  value       = module.alb.alb_dns_name
}

# ── ECS ───────────────────────────────────────────────────────────────────────

output "ecs_cluster_name" {
  description = "Name of the ECS cluster"
  value       = module.ecs.cluster_name
}

output "ecs_service_name" {
  description = "Name of the ECS service"
  value       = module.ecs.service_name
}

output "log_group_name" {
  description = "CloudWatch log group name"
  value       = module.ecs.log_group_name
}

# ── CloudFront ────────────────────────────────────────────────────────────────

output "cloudfront_distribution_id" {
  description = "ID of the CloudFront distribution"
  value       = module.cloudfront.distribution_id
}

output "cloudfront_url" {
  description = "Public HTTPS URL of the application via CloudFront"
  value       = module.cloudfront.distribution_url
}

output "cloudfront_domain_name" {
  description = "CloudFront distribution domain name"
  value       = module.cloudfront.distribution_domain_name
}
