# Null when var.enabled = false (count = 0).
output "function_name" {
  value = one(aws_lambda_function.crawler[*].function_name)
}

output "function_arn" {
  value = one(aws_lambda_function.crawler[*].arn)
}

output "role_arn" {
  value = one(aws_iam_role.crawler[*].arn)
}
