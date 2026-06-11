output "codebuild_project_name" {
  description = "Name of the CodeBuild project"
  value       = aws_codebuild_project.provisioner.name
}

output "codebuild_project_arn" {
  description = "ARN of the CodeBuild project"
  value       = aws_codebuild_project.provisioner.arn
}

output "codebuild_role_arn" {
  description = "IAM role ARN for CodeBuild"
  value       = aws_iam_role.codebuild_role.arn
}

output "sns_topic_arn" {
  description = "ARN of the SNS topic receiving provisioning failure notifications. Empty string when alert_email is not set."
  value       = local.notifications_enabled ? aws_sns_topic.provisioning_failures[0].arn : ""
}

output "log_group_name" {
  description = "CloudWatch log group name for CodeBuild builds"
  value       = local.log_group_name
}
