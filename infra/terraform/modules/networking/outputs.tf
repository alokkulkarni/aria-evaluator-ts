output "vpc_id" {
  description = "ID of the VPC"
  value       = aws_vpc.main.id
}

output "vpc_cidr" {
  description = "CIDR block of the VPC"
  value       = aws_vpc.main.cidr_block
}

output "public_subnet_ids" {
  description = "List of public subnet IDs"
  value       = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  description = "List of private subnet IDs"
  value       = aws_subnet.private[*].id
}

output "alb_security_group_id" {
  description = "Security group ID for the ALB"
  value       = aws_security_group.alb.id
}

output "ecs_service_security_group_id" {
  description = "Security group ID for the ECS service"
  value       = aws_security_group.ecs_service.id
}

output "internet_gateway_id" {
  description = "ID of the Internet Gateway"
  value       = aws_internet_gateway.main.id
}

output "vpc_endpoint_s3_id" {
  description = "ID of the S3 gateway VPC endpoint when private networking is enabled"
  value       = try(aws_vpc_endpoint.s3[0].id, null)
}

output "flow_log_group_name" {
  description = "Name of the VPC flow log group"
  value       = aws_cloudwatch_log_group.vpc_flow_logs.name
}
