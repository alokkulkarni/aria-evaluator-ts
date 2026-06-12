# infra/terraform/environments/prod/redis.tf
# Optional Redis cluster for tenant deployments.
#
# The tenant module's tier config (tenant-module/main.tf:14-18) sets
# `private_subnets = false` for the `free` and `individual` tiers — those
# tiers don't get private subnets in their VPC. ElastiCache needs at least
# one subnet to bind a subnet group to, so we ONLY create Redis (and its
# CloudWatch dashboard) when private subnets are available. Cheaper tiers
# fall back to running without Redis; the app's lib/cache.ts treats
# REDIS_HOST=localhost as no-cache.

locals {
  redis_enabled = length(module.tenant.private_subnet_ids) > 0
}

# Subnet group for Redis across multiple AZs
resource "aws_elasticache_subnet_group" "redis" {
  count = local.redis_enabled ? 1 : 0

  name       = "aria-prod-redis-subnet-group"
  subnet_ids = module.tenant.private_subnet_ids
  tags       = local.common_tags
}

# Security group for Redis
resource "aws_security_group" "redis" {
  count = local.redis_enabled ? 1 : 0

  name_prefix = "aria-prod-redis-"
  description = "Security group for Redis in production"
  vpc_id      = module.tenant.vpc_id

  # Allow Redis access from ECS tasks
  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [module.tenant.ecs_service_security_group_id]
  }

  # Allow self-replication for cluster mode
  ingress {
    from_port = 0
    to_port   = 65535
    protocol  = "tcp"
    self      = true
  }

  # Allow all egress
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.common_tags, { Name = "aria-prod-redis-sg" })
}

# Redis module with HA config (Multi-AZ with automatic failover)
module "redis" {
  source = "../../modules/redis"
  count  = local.redis_enabled ? 1 : 0

  environment                = "prod"
  engine_version             = "7.0"
  node_type                  = var.redis_node_type != null ? var.redis_node_type : "cache.m6g.large"
  num_cache_nodes            = var.redis_num_cache_nodes != null ? var.redis_num_cache_nodes : 2
  automatic_failover_enabled = var.redis_automatic_failover_enabled != null ? var.redis_automatic_failover_enabled : true
  at_rest_encryption_enabled = true
  transit_encryption_enabled = var.redis_transit_encryption_enabled != null ? var.redis_transit_encryption_enabled : true

  subnet_group_name  = aws_elasticache_subnet_group.redis[0].name
  security_group_ids = [aws_security_group.redis[0].id]

  # Extended snapshot retention for production
  snapshot_retention_limit = var.redis_snapshot_retention_limit != null ? var.redis_snapshot_retention_limit : 30
  snapshot_window          = "03:00-05:00"
  maintenance_window       = "sun:04:00-sun:06:00"

  # Enable alarms in production
  create_alarms = true
  alarm_actions = var.alarm_sns_topic_arn != "" ? [var.alarm_sns_topic_arn] : []

  # Keep final snapshot on deletion for disaster recovery
  skip_final_snapshot = false

  tags = local.common_tags
}

# CloudWatch dashboard for Redis monitoring
resource "aws_cloudwatch_dashboard" "redis" {
  count = local.redis_enabled ? 1 : 0

  dashboard_name = "aria-prod-redis"

  dashboard_body = jsonencode({
    widgets = [
      {
        type = "metric"
        properties = {
          metrics = [
            ["AWS/ElastiCache", "CPUUtilization", { stat = "Average" }],
            [".", "DatabaseMemoryUsagePercentage", { stat = "Average" }],
            [".", "NetworkBytesIn", { stat = "Sum" }],
            [".", "NetworkBytesOut", { stat = "Sum" }],
            [".", "CacheHits", { stat = "Sum" }],
            [".", "CacheMisses", { stat = "Sum" }],
            [".", "Evictions", { stat = "Sum" }],
            [".", "ReplicationLag", { stat = "Average" }],
          ]
          period = 300
          stat   = "Average"
          region = data.aws_region.current.region
          title  = "Redis Cluster Metrics"
        }
      }
    ]
  })
}

# Outputs (return empty string / null when redis is not deployed)
output "redis_endpoint_address" {
  description = "Redis cluster endpoint address (empty when redis not deployed)"
  value       = local.redis_enabled ? module.redis[0].endpoint_address : ""
}

output "redis_endpoint_port" {
  description = "Redis cluster port (0 when redis not deployed)"
  value       = local.redis_enabled ? module.redis[0].endpoint_port : 0
}

output "redis_connection_string" {
  description = "Redis connection string for application (empty when redis not deployed)"
  value       = local.redis_enabled ? "redis://${module.redis[0].endpoint_address}:${module.redis[0].endpoint_port}" : ""
}

output "redis_cluster_id" {
  description = "Redis cluster ID for reference (empty when redis not deployed)"
  value       = local.redis_enabled ? module.redis[0].cluster_id : ""
}
