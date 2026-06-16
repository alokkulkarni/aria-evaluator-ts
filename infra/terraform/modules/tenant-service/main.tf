# modules/tenant-service/main.tf
# Per-tenant compute on the shared platform: a Fargate service routed by a
# host-header ALB rule, with scale-to-zero autoscaling. The control-plane wakes an
# idle tenant by setting desired_count=1 (Phase 6). See docs/MULTI_TENANT_SPEC.md.

terraform {
  required_version = ">= 1.6.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0, < 7.0"
    }
  }
}

locals {
  name = "${var.app_name}-${var.environment}-${var.tenant_id}"

  base_environment = concat(
    [
      { name = "NODE_ENV", value = "production" },
      { name = "API_PORT", value = tostring(var.container_port) },
      { name = "ARIA_DEPLOY_ENV", value = var.environment },
      { name = "TENANT_ID", value = var.tenant_id },
      # Row-level isolation is enforced for every tenant task.
      { name = "TENANT_SCOPING_MODE", value = "enforce" },
      { name = "SAAS_MODE", value = "true" },
      { name = "PRICING_TIER", value = var.pricing_tier },
      { name = "SCENARIOS_DIR", value = "/app/state/scenarios" },
      { name = "EVAL_REPORT_OUTPUT_DIR", value = "/app/state/reports" },
      { name = "AWS_S3_STATE_BUCKET", value = var.state_bucket_name },
      { name = "AWS_S3_STATE_PREFIX", value = var.tenant_id },
    ],
    var.control_plane_internal_url != "" ? [{ name = "CONTROL_PLANE_INTERNAL_URL", value = var.control_plane_internal_url }] : [],
    var.website_url != "" ? [{ name = "ARIA_WEBSITE_URL", value = var.website_url }] : [],
    var.redis_host != "" ? [
      { name = "REDIS_HOST", value = var.redis_host },
      { name = "REDIS_PORT", value = tostring(var.redis_port) },
    ] : [],
    var.extra_environment_vars,
  )

  # The shared Aurora connection string (RDS Proxy endpoint) is injected as a secret.
  container_secrets = concat(
    [{ name = "DATABASE_URL", valueFrom = var.database_url_secret_arn }],
    var.extra_secrets,
  )
}

resource "aws_cloudwatch_log_group" "app" {
  name              = "/aria/${var.environment}/tenant/${var.tenant_id}"
  retention_in_days = var.log_retention_days
  tags              = var.tags
}

resource "aws_ecs_task_definition" "app" {
  family                   = local.name
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = tostring(var.cpu)
  memory                   = tostring(var.memory)
  execution_role_arn       = var.execution_role_arn
  task_role_arn            = var.task_role_arn

  container_definitions = jsonencode([
    {
      name        = "app"
      image       = var.app_image_uri
      essential   = true
      environment = local.base_environment
      secrets     = local.container_secrets
      portMappings = [
        { containerPort = var.container_port, protocol = "tcp" },
      ]
      healthCheck = {
        command     = ["CMD-SHELL", "node -e \"require('http').get('http://localhost:${var.container_port}/health',r=>process.exit(r.statusCode<400?0:1)).on('error',()=>process.exit(1))\""]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      }
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.app.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "app"
        }
      }
    },
  ])

  tags = var.tags
}

resource "aws_lb_target_group" "app" {
  name        = substr("${var.app_name}-${var.tenant_id}", 0, 32)
  port        = var.container_port
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  health_check {
    path                = "/health"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
    matcher             = "200-399"
  }

  deregistration_delay = 30
  tags                 = var.tags
}

# Host-header rule on the SHARED HTTPS listener routes <tenant>.<domain> here.
resource "aws_lb_listener_rule" "host" {
  listener_arn = var.alb_https_listener_arn
  priority     = var.listener_rule_priority

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app.arn
  }

  condition {
    host_header {
      values = [var.host]
    }
  }

  tags = var.tags
}

resource "aws_ecs_service" "app" {
  name            = local.name
  cluster         = var.cluster_arn
  task_definition = aws_ecs_task_definition.app.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [var.tenant_ecs_sg_id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.app.arn
    container_name   = "app"
    container_port   = var.container_port
  }

  # Autoscaling / control-plane wake own the running count — don't reset it on apply.
  lifecycle {
    ignore_changes = [desired_count]
  }

  depends_on = [aws_lb_listener_rule.host]

  tags = var.tags
}

# ── Autoscaling (scale-to-zero capable) ───────────────────────────────────────
resource "aws_appautoscaling_target" "ecs" {
  max_capacity       = var.max_capacity
  min_capacity       = var.min_capacity
  resource_id        = "service/${var.cluster_name}/${aws_ecs_service.app.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "cpu" {
  name               = "${local.name}-cpu"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ecs.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value       = var.cpu_scale_target
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}
