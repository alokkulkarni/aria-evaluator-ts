output "cloudfront_url" {
  description = "CloudFront distribution URL (https://)"
  value       = "https://${aws_cloudfront_distribution.main.domain_name}"
}

output "cloudfront_domain_name" {
  description = "CloudFront distribution domain name"
  value       = aws_cloudfront_distribution.main.domain_name
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID"
  value       = aws_cloudfront_distribution.main.id
}

output "alb_dns_name" {
  description = "ALB DNS name (internal use — CloudFront is the public endpoint)"
  value       = aws_lb.main.dns_name
}

output "alb_arn" {
  description = "ALB ARN"
  value       = aws_lb.main.arn
}

output "ecs_cluster_name" {
  description = "ECS cluster name"
  value       = aws_ecs_cluster.main.name
}

output "ecs_service_name" {
  description = "ECS service name"
  value       = aws_ecs_service.app.name
}

output "ecr_repository_url" {
  description = "ECR repository URL — push your Next.js Docker image here"
  value       = aws_ecr_repository.app.repository_url
}

output "app_secrets_arn" {
  description = "Secrets Manager ARN holding NextAuth + OAuth credentials"
  value       = aws_secretsmanager_secret.app_secrets.arn
}

output "log_group_name" {
  description = "CloudWatch log group for ECS task output"
  value       = aws_cloudwatch_log_group.app.name
}

output "waf_web_acl_arn" {
  description = "WAF Web ACL ARN"
  value       = aws_wafv2_web_acl.cloudfront.arn
}

output "vpc_id" {
  description = "VPC ID"
  value       = aws_vpc.main.id
}

output "public_subnet_ids" {
  description = "Public subnet IDs"
  value       = aws_subnet.public[*].id
}

output "website_url" {
  description = "Public URL of the website (custom domain or CloudFront)"
  value       = var.domain_name != "" ? "https://${var.domain_name}" : "https://${aws_cloudfront_distribution.main.domain_name}"
}
