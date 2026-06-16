output "control_plane_url" {
  value = "http://${module.alb.alb_dns_name}"
}

output "control_plane_url_ssm_parameter_name" {
  description = "SSM Parameter name storing the control plane internal URL."
  value       = aws_ssm_parameter.control_plane_internal_url.name
}

# ── CloudTrail outputs ────────────────────────────────────────────────────────

output "cloudtrail_trail_arn" {
  description = "ARN of the CloudTrail trail"
  value       = module.cloudtrail.trail_arn
}

output "cloudtrail_s3_bucket" {
  description = "S3 bucket receiving CloudTrail log files"
  value       = module.cloudtrail.s3_bucket_name
}

output "cloudtrail_log_group" {
  description = "CloudWatch log group for CloudTrail events"
  value       = module.cloudtrail.cloudwatch_log_group_name
}

output "cloudtrail_alarm_count" {
  description = "Number of CIS-recommended CloudWatch alarms created"
  value       = module.cloudtrail.alarm_count
}

# ── Security Infrastructure Outputs ────────────────────────────────────────────

output "dynamodb_encryption_key_arn" {
  description = "ARN of KMS key for DynamoDB encryption"
  value       = aws_kms_key.dynamodb.arn
}

output "cloudtrail_logs_bucket" {
  description = "S3 bucket for CloudTrail logs"
  value       = aws_s3_bucket.cloudtrail_logs.id
}

# ── Cross-VPC peering metadata ────────────────────────────────────────────────
# Consumed by website-prod (or any peer stack) via terraform_remote_state so it
# can build a VPC peering connection + routes + SG ingress without hand-copying
# IDs into tfvars.

output "vpc_id" {
  description = "Control-plane VPC ID (consumed by peer stacks for VPC peering)"
  value       = module.networking.vpc_id
}

output "vpc_cidr" {
  description = "Control-plane VPC CIDR (used in peer route tables)"
  value       = module.networking.vpc_cidr
}

output "private_route_table_ids" {
  description = "Control-plane private route table IDs (subset of all_route_table_ids)"
  value       = module.networking.private_route_table_ids
}

output "all_route_table_ids" {
  description = "All control-plane route table IDs (public + private). Peer stacks should add reverse routes to every one of these so the internal ALB's return path works regardless of which subnet its ENIs land in."
  value       = module.networking.all_route_table_ids
}

output "alb_security_group_id" {
  description = "Security group on the internal control-plane ALB — peer stacks add ingress rules referencing their ECS SG"
  value       = module.networking.alb_security_group_id
}
