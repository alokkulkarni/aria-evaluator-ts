# infra/terraform/modules/redis/outputs.tf
# Outputs for the Redis module.
# Resource is aws_elasticache_replication_group — its endpoint attribute names
# differ from aws_elasticache_cluster (no cache_nodes[], use primary_endpoint).

output "endpoint_address" {
  description = "Redis primary endpoint address (writes)"
  value       = aws_elasticache_replication_group.main.primary_endpoint_address
}

output "reader_endpoint_address" {
  description = "Redis reader endpoint address (multi-AZ reads)"
  value       = aws_elasticache_replication_group.main.reader_endpoint_address
}

output "endpoint_port" {
  description = "Redis cluster endpoint port"
  value       = aws_elasticache_replication_group.main.port
}

output "connection_string" {
  description = "Redis connection string (rediss:// when TLS is enabled, redis:// otherwise)"
  value = format(
    "%s://%s:%s",
    aws_elasticache_replication_group.main.transit_encryption_enabled ? "rediss" : "redis",
    aws_elasticache_replication_group.main.primary_endpoint_address,
    aws_elasticache_replication_group.main.port,
  )
}

output "cluster_id" {
  description = "Redis replication group ID"
  value       = aws_elasticache_replication_group.main.replication_group_id
}

output "engine_version_actual" {
  description = "Actual Redis engine version"
  value       = aws_elasticache_replication_group.main.engine_version_actual
}

output "member_clusters" {
  description = "List of member cluster node IDs"
  value       = aws_elasticache_replication_group.main.member_clusters
}
