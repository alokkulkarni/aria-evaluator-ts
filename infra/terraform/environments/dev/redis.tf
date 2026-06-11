# infra/terraform/environments/dev/redis.tf
# Dev environment Redis configuration (AWS ElastiCache)

# Subnet group for Redis across private subnets
resource "aws_elasticache_subnet_group" "redis" {
  name           = "aria-dev-redis-subnet-group"
  subnet_ids     = module.networking.private_subnet_ids
  tags           = local.common_tags
}

# Security group for Redis
resource "aws_security_group" "redis" {
  name_prefix = "aria-dev-redis-"
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

  tags = merge(local.common_tags, { Name = "aria-dev-redis-sg" })
}

# Redis module
module "redis" {
  source = "../../modules/redis"

  environment                = "dev"
  engine_version           = "7.0"
  node_type                = var.redis_node_type != null ? var.redis_node_type : "cache.t4g.small"
  num_cache_nodes          = var.redis_num_cache_nodes != null ? var.redis_num_cache_nodes : 1
  automatic_failover_enabled = false
  at_rest_encryption_enabled = true
  transit_encryption_enabled = false # Simplify for dev

  subnet_group_name = aws_elasticache_subnet_group.redis.name
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
