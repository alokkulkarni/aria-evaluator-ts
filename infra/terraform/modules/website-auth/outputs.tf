output "alb_dns_name" {
  value       = aws_lb.main.dns_name
  description = "DNS name of the auth backend ALB. Pass to website-frontend module."
}

output "origin_secret" {
  value       = random_password.origin_secret.result
  sensitive   = true
  description = "Origin secret for CloudFront → ALB header verification."
}

output "ecr_repository_url" {
  value = aws_ecr_repository.auth.repository_url
}

output "ecs_cluster_name" {
  value = aws_ecs_cluster.main.name
}

output "ecs_service_name" {
  value = aws_ecs_service.auth.name
}

output "vpc_id" {
  value = aws_vpc.main.id
}

output "vpc_cidr_block" {
  value       = aws_vpc.main.cidr_block
  description = "Auth-backend VPC CIDR (used by peer stacks when adding cross-VPC routes)"
}

output "public_route_table_id" {
  value       = aws_route_table.public.id
  description = "Public route table ID — cross-VPC routes (e.g. to control-plane VPC) are added here"
}

output "ecs_security_group_id" {
  value       = aws_security_group.ecs.id
  description = "ECS task security group ID — peer stacks reference this in ingress rules"
}

output "log_group_name" {
  value = aws_cloudwatch_log_group.auth.name
}

output "oauth_secret_arn" {
  value       = aws_secretsmanager_secret.auth.arn
  description = "ARN of the Secrets Manager secret. Pass to bootstrap-oauth-secrets.sh to populate credentials."
}

output "oauth_secret_name" {
  value       = aws_secretsmanager_secret.auth.name
  description = "Name of the Secrets Manager secret (e.g. aria-auth-dev-secrets)."
}
