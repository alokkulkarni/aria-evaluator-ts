output "state_bucket_name" {
  description = "Name of the shared Terraform state bucket"
  value       = aws_s3_bucket.terraform_state.id
}

output "state_bucket_arn" {
  description = "ARN of the shared Terraform state bucket"
  value       = aws_s3_bucket.terraform_state.arn
}

output "locks_table_name" {
  description = "Name of the Terraform lock table"
  value       = aws_dynamodb_table.terraform_locks.name
}

output "locks_table_arn" {
  description = "ARN of the Terraform lock table"
  value       = aws_dynamodb_table.terraform_locks.arn
}

output "ecr_repository_url" {
  description = "Shared ECR repository URL for ARIA Evaluator images"
  value       = aws_ecr_repository.shared.repository_url
}

output "heartbeat_table_name" {
  description = "Name of the shared tenant heartbeat table"
  value       = aws_dynamodb_table.heartbeats.name
}

output "heartbeat_table_arn" {
  description = "ARN of the shared tenant heartbeat table"
  value       = aws_dynamodb_table.heartbeats.arn
}

output "kms_key_arn" {
  description = "ARN of the shared KMS key used for secrets encryption"
  value       = aws_kms_key.secrets.arn
}

output "ses_identity_arn" {
  description = "ARN of the SES domain identity for suspend warning emails. Empty when ses_sender_domain is not set."
  value       = length(aws_ses_domain_identity.sender) > 0 ? aws_ses_domain_identity.sender[0].arn : ""
}

output "ses_dkim_tokens" {
  description = "Three DKIM CNAME tokens. For each: add <token>._domainkey.<domain> → <token>.dkim.amazonses.com to your DNS zone."
  value       = length(aws_ses_domain_dkim.sender) > 0 ? aws_ses_domain_dkim.sender[0].dkim_tokens : []
}
