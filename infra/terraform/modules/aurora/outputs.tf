output "cluster_endpoint" {
  description = "Writer endpoint of the Aurora cluster."
  value       = aws_rds_cluster.main.endpoint
}

output "reader_endpoint" {
  description = "Reader endpoint of the Aurora cluster."
  value       = aws_rds_cluster.main.reader_endpoint
}

output "proxy_endpoint" {
  description = "RDS Proxy endpoint (null when enable_proxy = false)."
  value       = var.enable_proxy ? aws_db_proxy.main[0].endpoint : null
}

output "database_url_secret_arn" {
  description = "Secrets Manager ARN holding the full app DATABASE_URL — wire into the ECS task as a `valueFrom` secret."
  value       = aws_secretsmanager_secret.database_url.arn
}

output "master_secret_arn" {
  description = "Secrets Manager ARN holding the master {username,password}."
  value       = aws_secretsmanager_secret.master.arn
}

output "security_group_id" {
  description = "Security group id of the Aurora cluster."
  value       = aws_security_group.db.id
}

output "port" {
  description = "Postgres port."
  value       = 5432
}
