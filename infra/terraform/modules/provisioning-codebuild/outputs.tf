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
