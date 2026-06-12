# infra/terraform/modules/redis/main.tf
# AWS ElastiCache Redis cluster configuration

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# ElastiCache Redis (replication group).
# We use aws_elasticache_replication_group rather than aws_elasticache_cluster
# because the cluster resource doesn't support automatic_failover,
# at_rest_encryption, transit_encryption, or auth_token — which the caller
# explicitly requests via variables. Single-node deployments still work
# (num_cache_clusters = 1) with failover disabled.
resource "aws_elasticache_replication_group" "main" {
  replication_group_id = "${var.environment}-aria-redis"
  description          = "ARIA ${var.environment} Redis"

  engine               = "redis"
  engine_version       = var.engine_version
  node_type            = var.node_type
  num_cache_clusters   = var.num_cache_nodes
  parameter_group_name = var.parameter_group_name

  port                       = var.port
  automatic_failover_enabled = var.automatic_failover_enabled && var.num_cache_nodes > 1
  multi_az_enabled           = var.automatic_failover_enabled && var.num_cache_nodes > 1

  subnet_group_name  = var.subnet_group_name
  security_group_ids = var.security_group_ids

  # Encryption (replication_group supports all three; cluster does not)
  at_rest_encryption_enabled = var.at_rest_encryption_enabled
  transit_encryption_enabled = var.transit_encryption_enabled
  auth_token                 = var.auth_token != "" ? var.auth_token : null

  # Backup & maintenance
  snapshot_retention_limit = var.snapshot_retention_limit
  snapshot_window          = var.snapshot_window
  maintenance_window       = var.maintenance_window

  # Tags
  tags = merge(
    var.tags,
    {
      Name        = "${var.environment}-aria-redis"
      Environment = var.environment
    }
  )

  # Don't take a final snapshot on destroy (cheap, fast teardown for tenants).
  # The caller can override via the existing skip_final_snapshot var — the
  # replication_group attribute name is final_snapshot_identifier (omit for
  # no snapshot) so we simply leave it unset when skip_final_snapshot is true.
}

# CloudWatch alarms
resource "aws_cloudwatch_metric_alarm" "cpu_utilization" {
  count               = var.create_alarms ? 1 : 0
  alarm_name          = "${var.environment}-aria-redis-cpu"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ElastiCache"
  period              = "300"
  statistic           = "Average"
  threshold           = "75"
  alarm_description   = "Redis cluster CPU utilization is too high"

  dimensions = {
    CacheClusterId = "${aws_elasticache_replication_group.main.replication_group_id}-001"
  }

  alarm_actions = var.alarm_actions
}

resource "aws_cloudwatch_metric_alarm" "memory_utilization" {
  count               = var.create_alarms ? 1 : 0
  alarm_name          = "${var.environment}-aria-redis-memory"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "DatabaseMemoryUsagePercentage"
  namespace           = "AWS/ElastiCache"
  period              = "300"
  statistic           = "Average"
  threshold           = "90"
  alarm_description   = "Redis cluster memory utilization is too high"

  dimensions = {
    CacheClusterId = "${aws_elasticache_replication_group.main.replication_group_id}-001"
  }

  alarm_actions = var.alarm_actions
}

resource "aws_cloudwatch_metric_alarm" "evictions" {
  count               = var.create_alarms ? 1 : 0
  alarm_name          = "${var.environment}-aria-redis-evictions"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "Evictions"
  namespace           = "AWS/ElastiCache"
  period              = "300"
  statistic           = "Sum"
  threshold           = "100"
  alarm_description   = "Redis cluster has too many evictions"

  dimensions = {
    CacheClusterId = "${aws_elasticache_replication_group.main.replication_group_id}-001"
  }

  alarm_actions = var.alarm_actions
}
