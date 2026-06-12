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

output "private_route_table_ids" {
  description = "List of private route table IDs (one per AZ). Needed by peer stacks adding cross-VPC routes."
  value       = aws_route_table.private[*].id
}

output "public_route_table_id" {
  description = "Public route table ID. Peer stacks must add a route here too when the ALB/target ENIs live in public subnets."
  value       = aws_route_table.public.id
}

output "all_route_table_ids" {
  description = "All route table IDs (public + private). Use this when adding cross-VPC routes — guarantees return path regardless of which subnets the target lives in."
  value       = concat([aws_route_table.public.id], aws_route_table.private[*].id)
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
