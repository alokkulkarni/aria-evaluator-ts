# modules/tenant-service/outputs.tf

output "service_name" {
  description = "ECS service name (used by the control-plane to wake the tenant)."
  value       = aws_ecs_service.app.name
}

output "service_arn" {
  description = "ECS service ARN."
  value       = aws_ecs_service.app.id
}

output "task_definition_arn" {
  description = "Tenant task definition ARN."
  value       = aws_ecs_task_definition.app.arn
}

output "target_group_arn" {
  description = "Target group ARN for this tenant."
  value       = aws_lb_target_group.app.arn
}

output "host" {
  description = "Host that routes to this tenant."
  value       = var.host
}

output "log_group_name" {
  description = "CloudWatch log group for this tenant."
  value       = aws_cloudwatch_log_group.app.name
}
