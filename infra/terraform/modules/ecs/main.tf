locals {
  name_prefix = var.tenant_id != "" ? "${var.app_name}-${var.environment}-${var.tenant_id}" : "${var.app_name}-${var.environment}"
  common_tags = merge(
    var.tags,
    {
      ManagedBy            = "terraform"
      Project              = "aria-evaluator"
      Environment          = var.environment
      AppName              = var.app_name
      "aria:resource_type" = "compute"
    },
    var.tenant_id != "" ? { "aria:tenant_id" = var.tenant_id } : {},
    var.pricing_tier != "" ? { "aria:pricing_tier" = var.pricing_tier } : {},
  )

  effective_app_log_group_name = var.app_log_group_name != "" ? var.app_log_group_name : aws_cloudwatch_log_group.app[0].name
  effective_app_log_group_arn  = var.app_log_group_arn != "" ? var.app_log_group_arn : aws_cloudwatch_log_group.app[0].arn
  service_subnet_ids           = length(var.private_subnet_ids) > 0 ? var.private_subnet_ids : var.public_subnet_ids
  assign_public_ip             = length(var.private_subnet_ids) == 0

  base_environment = concat(
    [
      { name = "NODE_ENV", value = "production" },
      { name = "API_PORT", value = tostring(var.container_port) },
      { name = "AWS_S3_STATE_BUCKET", value = var.state_bucket_name },
      { name = "AWS_S3_STATE_PREFIX", value = var.s3_state_prefix },
      { name = "S3_SYNC_INTERVAL_SECONDS", value = tostring(var.s3_sync_interval_seconds) },
      { name = "DATABASE_URL", value = "file:/app/state/data/aria-evaluator.db" },
      { name = "EVAL_REPORT_OUTPUT_DIR", value = "/app/state/reports" },
      { name = "SCENARIOS_DIR", value = "/app/state/scenarios" },
      { name = "TENANT_ID", value = var.tenant_id },
      { name = "PRICING_TIER", value = var.pricing_tier },
      { name = "SAAS_MODE", value = "true" },
      { name = "HEARTBEAT_INTERVAL_SECONDS", value = "600" },
    ],
    var.heartbeat_table_name != "" ? [{ name = "HEARTBEAT_TABLE", value = var.heartbeat_table_name }] : [],
    var.god_mode_enabled ? [{ name = "ARIA_GOD_MODE", value = "true" }] : [],
  )

  all_environment = concat(local.base_environment, var.extra_environment_vars)
  container_secrets = var.god_mode_secret_arn != "" ? [
    {
      name      = "ARIA_GOD_MODE_TOKEN"
      valueFrom = var.god_mode_secret_arn
    }
  ] : []
  mount_points = var.efs_access_point_id != "" ? [
    {
      sourceVolume  = "aria-state"
      containerPath = "/app/state"
      readOnly      = false
    }
  ] : []
}

resource "aws_cloudwatch_log_group" "app" {
  count = var.app_log_group_name == "" ? 1 : 0

  name              = "/ecs/${local.name_prefix}"
  retention_in_days = var.log_retention_days

  tags = local.common_tags
}

resource "aws_ecs_cluster" "main" {
  name = "${local.name_prefix}-cluster"

  setting {
    name  = "containerInsights"
    value = "enhanced"
  }

  tags = local.common_tags

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name       = aws_ecs_cluster.main.name
  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  default_capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight            = 1
    base              = 1
  }
}

resource "aws_ecs_task_definition" "app" {
  family                   = "${local.name_prefix}-task"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.cpu
  memory                   = var.memory
  execution_role_arn       = var.task_execution_role_arn
  task_role_arn            = var.task_role_arn

  dynamic "volume" {
    for_each = var.efs_access_point_id != "" ? [1] : []

    content {
      name = "aria-state"

      efs_volume_configuration {
        file_system_id     = var.efs_file_system_id
        transit_encryption = "ENABLED"

        authorization_config {
          access_point_id = var.efs_access_point_id
          iam             = "ENABLED"
        }
      }
    }
  }

  container_definitions = jsonencode([
    {
      name                   = "app"
      image                  = var.app_image_uri
      essential              = true
      privileged             = false
      readonlyRootFilesystem = false
      portMappings = [
        {
          containerPort = var.container_port
          protocol      = "tcp"
        }
      ]
      mountPoints = local.mount_points
      environment = local.all_environment
      secrets     = local.container_secrets
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = local.effective_app_log_group_name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "app"
        }
      }
      healthCheck = {
        command     = ["CMD-SHELL", "curl -sf http://localhost:${var.container_port}/health || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      }
    }
  ])

  tags = local.common_tags
}

resource "aws_ecs_service" "app" {
  name            = "${local.name_prefix}-svc"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.app.arn
  launch_type     = "FARGATE"
  desired_count   = var.desired_count

  deployment_minimum_healthy_percent = var.deployment_minimum_healthy_percent
  deployment_maximum_percent         = var.deployment_maximum_percent

  network_configuration {
    assign_public_ip = local.assign_public_ip
    subnets          = local.service_subnet_ids
    security_groups  = [var.ecs_service_security_group_id]
  }

  load_balancer {
    target_group_arn = var.target_group_arn
    container_name   = "app"
    container_port   = var.container_port
  }

  lifecycle {
    ignore_changes = [task_definition, desired_count]
  }

  tags = local.common_tags
}
