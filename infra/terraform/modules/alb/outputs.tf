output "alb_arn" {
  description = "ARN of the Application Load Balancer"
  value       = aws_lb.main.arn
}

output "alb_arn_suffix" {
  description = "ARN suffix of the ALB for CloudWatch metrics"
  value       = aws_lb.main.arn_suffix
}

output "alb_dns_name" {
  description = "DNS name of the Application Load Balancer"
  value       = aws_lb.main.dns_name
}

output "alb_zone_id" {
  description = "Hosted zone ID of the ALB (for Route 53 alias records)"
  value       = aws_lb.main.zone_id
}

output "target_group_arn" {
  description = "ARN of the ALB target group"
  value       = aws_lb_target_group.app.arn
}

output "https_listener_arn" {
  description = "ARN of the HTTPS listener when TLS is enabled"
  value       = try(aws_lb_listener.https[0].arn, null)
}

output "listener_arn" {
  description = "Primary listener ARN (HTTPS when enabled, otherwise HTTP)"
  value       = try(aws_lb_listener.https[0].arn, aws_lb_listener.http[0].arn)
}
