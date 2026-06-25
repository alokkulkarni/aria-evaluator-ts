# infra/terraform/environments/evaluator-prod/redis.tf
# Pooled evaluator Redis (AWS ElastiCache) — BullMQ job queue + cross-task SSE.

# Subnet group. evaluator-prod runs in PUBLIC subnets (no private subnets); the
# node is not publicly accessible — its SG only allows the ECS task SG on 6379.
resource "aws_elasticache_subnet_group" "redis" {
  name       = "${var.app_name}-${var.environment}-redis-subnet-group"
  subnet_ids = module.networking.public_subnet_ids
  tags       = local.common_tags
}

# Security group for Redis
resource "aws_security_group" "redis" {
  name_prefix = "${var.app_name}-${var.environment}-redis-"
  description = "Security group for Redis"
  vpc_id      = module.networking.vpc_id

  # Allow Redis access from ECS tasks
  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [module.networking.ecs_service_security_group_id]
  }

  # Allow egress to anywhere
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.common_tags, { Name = "${var.app_name}-${var.environment}-redis-sg" })
}

# Redis module
module "redis" {
  source = "../../modules/redis"

  environment    = var.environment
  engine_version = "7.0"
  # Cost-optimized: t4g.micro (0.5 GB) is ample for a BullMQ queue + SSE pub/sub.
  node_type                  = var.redis_node_type != null ? var.redis_node_type : "cache.t4g.micro"
  num_cache_nodes            = var.redis_num_cache_nodes != null ? var.redis_num_cache_nodes : 1
  automatic_failover_enabled = false
  at_rest_encryption_enabled = true
  transit_encryption_enabled = false # Simplify for dev

  subnet_group_name  = aws_elasticache_subnet_group.redis.name
  security_group_ids = [aws_security_group.redis.id]

  snapshot_retention_limit = var.redis_snapshot_retention_limit != null ? var.redis_snapshot_retention_limit : 5
  snapshot_window          = "03:00-05:00"
  maintenance_window       = "sun:05:00-sun:07:00"

  create_alarms = true
  alarm_actions = var.alarm_sns_topic_arn != "" ? [var.alarm_sns_topic_arn] : []

  tags = local.common_tags
}

# Outputs for Redis connection details
output "redis_endpoint_address" {
  description = "Redis cluster endpoint address"
  value       = module.redis.endpoint_address
}

output "redis_endpoint_port" {
  description = "Redis cluster port"
  value       = module.redis.endpoint_port
}

output "redis_connection_string" {
  description = "Redis connection string for application"
  value       = "redis://${module.redis.endpoint_address}:${module.redis.endpoint_port}"
}
