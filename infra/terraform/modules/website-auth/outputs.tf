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

output "log_group_name" {
  value = aws_cloudwatch_log_group.auth.name
}
