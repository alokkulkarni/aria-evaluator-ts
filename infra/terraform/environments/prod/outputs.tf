# =============================================================================
# ARIA Evaluator — prod outputs
# Run `terraform output` after apply to see all URLs and resource identifiers.
# =============================================================================

# ── ✅ URL Summary (shown prominently at end of apply) ────────────────────────

output "summary" {
  description = "All public URLs and key identifiers — printed at the end of every apply"
  value = {
    evaluator_url          = module.cloudfront.distribution_url
    evaluator_alb_url      = "http://${module.alb.alb_dns_name}"
    bedrock_proxy_chat_url = module.bedrock_lambda.chat_endpoint
    bedrock_proxy_health   = module.bedrock_lambda.health_endpoint
    ecr_repository_url     = module.ecr.repository_url
    ecs_cluster            = module.ecs.cluster_name
    ecs_service            = module.ecs.service_name
    cloudfront_id          = module.cloudfront.distribution_id
    state_bucket           = module.s3.bucket_name
    log_group              = module.ecs.log_group_name
  }
}

# ── Evaluator (ECS + CloudFront) ──────────────────────────────────────────────

output "evaluator_url" {
  description = "Public HTTPS URL of the ARIA Evaluator UI via CloudFront"
  value       = module.cloudfront.distribution_url
}

output "evaluator_alb_dns" {
  description = "Direct ALB DNS name (HTTP only — use CloudFront URL for HTTPS)"
  value       = module.alb.alb_dns_name
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID (needed for cache invalidations)"
  value       = module.cloudfront.distribution_id
}

output "cloudfront_domain_name" {
  description = "CloudFront domain name"
  value       = module.cloudfront.distribution_domain_name
}

# ── Bedrock Proxy Lambda ──────────────────────────────────────────────────────

output "bedrock_proxy_api_endpoint" {
  description = "Base URL of the Bedrock proxy HTTP API (null when bedrock_lambda_enabled = false)"
  value       = module.bedrock_lambda.api_endpoint
}

output "bedrock_proxy_chat_url" {
  description = "POST /chat endpoint of the Bedrock proxy (null when disabled)"
  value       = module.bedrock_lambda.chat_endpoint
}

output "bedrock_proxy_health_url" {
  description = "GET /health endpoint of the Bedrock proxy (null when disabled)"
  value       = module.bedrock_lambda.health_endpoint
}

output "bedrock_proxy_lambda_name" {
  description = "Name of the Bedrock proxy Lambda function (null when disabled)"
  value       = module.bedrock_lambda.lambda_function_name
}

# ── ECR ───────────────────────────────────────────────────────────────────────

output "ecr_repository_url" {
  description = "ECR repository URL — use as the base for image tags"
  value       = module.ecr.repository_url
}

output "ecr_repository_name" {
  description = "ECR repository name"
  value       = module.ecr.repository_name
}

# ── ECS ───────────────────────────────────────────────────────────────────────

output "ecs_cluster_name" {
  description = "ECS cluster name"
  value       = module.ecs.cluster_name
}

output "ecs_service_name" {
  description = "ECS service name"
  value       = module.ecs.service_name
}

output "ecs_log_group_name" {
  description = "CloudWatch log group for ECS tasks"
  value       = module.ecs.log_group_name
}

# ── S3 ────────────────────────────────────────────────────────────────────────

output "state_bucket_name" {
  description = "S3 state bucket name"
  value       = module.s3.bucket_name
}

# ── IAM ───────────────────────────────────────────────────────────────────────

output "task_execution_role_arn" {
  description = "ECS task execution role ARN"
  value       = module.iam.task_execution_role_arn
}

output "task_role_arn" {
  description = "ECS task role ARN"
  value       = module.iam.task_role_arn
}

# ── Networking ────────────────────────────────────────────────────────────────

output "vpc_id" {
  description = "VPC ID"
  value       = module.networking.vpc_id
}

output "public_subnet_ids" {
  description = "Public subnet IDs"
  value       = module.networking.public_subnet_ids
}
