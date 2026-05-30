locals {
  name_prefix = "${var.app_name}-${var.environment}"

  common_tags = merge(
    {
      AppName     = var.app_name
      Environment = var.environment
      ManagedBy   = "terraform"
    },
    var.tags,
  )

  # Base environment variables that every deployment needs
  base_environment = [
    { name = "NODE_ENV", value = "production" },
    { name = "API_PORT", value = tostring(var.container_port) },
    { name = "AWS_S3_STATE_BUCKET", value = var.state_bucket_name },
    { name = "AWS_S3_STATE_PREFIX", value = var.s3_state_prefix },
    { name = "S3_SYNC_INTERVAL_SECONDS", value = tostring(var.s3_sync_interval_seconds) },
    { name = "DATABASE_URL", value = "file:/app/state/data/aria-evaluator.db" },
    { name = "EVAL_REPORT_OUTPUT_DIR", value = "/app/state/reports" },
    { name = "SCENARIOS_DIR", value = "/app/state/scenarios" },
  ]

  # Merge base + caller-supplied extra vars
  all_environment = concat(local.base_environment, var.extra_environment_vars)
}

# ── CloudWatch Log Group ───────────────────────────────────────────────────────

resource "aws_cloudwatch_log_group" "app" {
  name              = "/ecs/${local.name_prefix}"
  retention_in_days = var.log_retention_days

  tags = local.common_tags
}

# ── ECS Cluster ────────────────────────────────────────────────────────────────

resource "aws_ecs_cluster" "main" {
  name = "${local.name_prefix}-cluster"

  setting {
    name  = "containerInsights"
    value = "disabled"
  }

  tags = local.common_tags
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

# ── Task Definition ────────────────────────────────────────────────────────────

resource "aws_ecs_task_definition" "app" {
  family                   = "${local.name_prefix}-task"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.cpu
  memory                   = var.memory
  execution_role_arn       = var.task_execution_role_arn
  task_role_arn            = var.task_role_arn

  container_definitions = jsonencode([
    {
      name      = "app"
      image     = var.app_image_uri
      essential = true

      portMappings = [
        {
          containerPort = var.container_port
          protocol      = "tcp"
        }
      ]

      environment = local.all_environment

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.app.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "app"
        }
      }

      # Health check mirrors the ALB health check so the container is marked
      # unhealthy before the ALB drains it.
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

# ── ECS Service ────────────────────────────────────────────────────────────────

resource "aws_ecs_service" "app" {
  name            = "${local.name_prefix}-svc"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.app.arn
  launch_type     = "FARGATE"
  desired_count   = var.desired_count

  # Allow zero-downtime deployments: replace old task before new one is healthy.
  deployment_minimum_healthy_percent = var.deployment_minimum_healthy_percent
  deployment_maximum_percent         = var.deployment_maximum_percent

  network_configuration {
    assign_public_ip = true
    subnets          = var.public_subnet_ids
    security_groups  = [var.ecs_service_security_group_id]
  }

  load_balancer {
    target_group_arn = var.target_group_arn
    container_name   = "app"
    container_port   = var.container_port
  }

  # Ensure the ALB listener exists before the service tries to register.
  depends_on = [var.alb_listener_arn]

  # Ignore task definition changes driven by external deployments (e.g. CI/CD
  # pushing a new image tag) so Terraform doesn't revert them on next apply.
  lifecycle {
    ignore_changes = [task_definition, desired_count]
  }

  tags = local.common_tags
}
