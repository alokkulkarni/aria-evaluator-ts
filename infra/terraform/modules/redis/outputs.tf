# infra/terraform/modules/redis/outputs.tf
# Outputs for Redis module

output "endpoint_address" {
  description = "Redis cluster endpoint address"
  value       = aws_elasticache_cluster.main.cache_nodes[0].address
}

output "endpoint_port" {
  description = "Redis cluster endpoint port"
  value       = aws_elasticache_cluster.main.port
}

output "connection_string" {
  description = "Redis connection string"
  value       = "redis://${aws_elasticache_cluster.main.cache_nodes[0].address}:${aws_elasticache_cluster.main.port}"
}

output "cluster_id" {
  description = "Redis cluster ID"
  value       = aws_elasticache_cluster.main.cluster_id
}

output "engine_version_actual" {
  description = "Actual Redis engine version"
  value       = aws_elasticache_cluster.main.engine_version_actual
}

output "member_clusters" {
  description = "List of member cluster nodes"
  value       = aws_elasticache_cluster.main.member_clusters
}

output "configuration_endpoint_address" {
  description = "Configuration endpoint address (cluster mode disabled)"
  value       = try(aws_elasticache_cluster.main.cache_nodes[0].address, "")
}
