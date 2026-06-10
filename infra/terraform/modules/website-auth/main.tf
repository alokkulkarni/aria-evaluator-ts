# ── Website Auth Backend Module ────────────────────────────────────────────────
#
# Deploys the ARIA Evaluator auth backend (NextAuth API, control-plane proxy)
# on ECS Fargate behind an ALB with:
#   - VPC with public subnets
#   - ALB with origin-secret header validation
#   - ECS Fargate service (256 CPU / 512 MiB)
#   - ECR repository
#   - Secrets Manager for auth secrets
#   - CloudWatch log group

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  name_prefix = "${var.app_name}-auth-${var.environment}"

  common_tags = merge(var.tags, {
    ManagedBy            = "terraform"
    Project              = "aria-evaluator"
    Environment          = var.environment
    Component            = "website-auth"
    "aria:resource_type" = "website-auth"
  })
}

# ── Random origin secret (shared with frontend CloudFront) ────────────────────

resource "random_password" "origin_secret" {
  length  = 32
  special = false
}

# ── VPC ────────────────────────────────────────────────────────────────────────

resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags                 = merge(local.common_tags, { Name = "${local.name_prefix}-vpc" })
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
  tags   = merge(local.common_tags, { Name = "${local.name_prefix}-igw" })
}

resource "aws_subnet" "public" {
  count                   = length(var.public_subnet_cidrs)
  vpc_id                  = aws_vpc.main.id
  cidr_block              = var.public_subnet_cidrs[count.index]
  availability_zone       = var.availability_zones[count.index]
  map_public_ip_on_launch = true
  tags                    = merge(local.common_tags, { Name = "${local.name_prefix}-public-${count.index}" })
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
  tags   = merge(local.common_tags, { Name = "${local.name_prefix}-public-rt" })
}

resource "aws_route" "internet" {
  route_table_id         = aws_route_table.public.id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.main.id
}

resource "aws_route_table_association" "public" {
  count          = length(aws_subnet.public)
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# ── Security Groups ───────────────────────────────────────────────────────────

resource "aws_security_group" "alb" {
  name_prefix = "${local.name_prefix}-alb-"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "HTTP from CloudFront"
  }

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "HTTPS from CloudFront"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.common_tags, { Name = "${local.name_prefix}-alb-sg" })

  lifecycle { create_before_destroy = true }
}

resource "aws_security_group" "ecs" {
  name_prefix = "${local.name_prefix}-ecs-"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port       = var.container_port
    to_port         = var.container_port
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
    description     = "From ALB"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.common_tags, { Name = "${local.name_prefix}-ecs-sg" })

  lifecycle { create_before_destroy = true }
}

# ── ALB ────────────────────────────────────────────────────────────────────────

resource "aws_lb" "main" {
  name               = "${local.name_prefix}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id

  tags = local.common_tags
}

resource "aws_lb_target_group" "auth" {
  name        = "${local.name_prefix}-tg"
  port        = var.container_port
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "ip"

  health_check {
    path                = "/api/health"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
    matcher             = "200"
  }

  deregistration_delay = 30

  tags = local.common_tags
}

# Default listener — returns 403 unless X-CF-Origin-Secret matches
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "fixed-response"
    fixed_response {
      content_type = "text/plain"
      message_body = "Forbidden"
      status_code  = "403"
    }
  }

  tags = local.common_tags
}

# Forward rule only when origin secret header matches
resource "aws_lb_listener_rule" "origin_verified" {
  listener_arn = aws_lb_listener.http.arn
  priority     = 1

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.auth.arn
  }

  condition {
    http_header {
      http_header_name = "X-CF-Origin-Secret"
      values           = [random_password.origin_secret.result]
    }
  }
}

# ── ECR Repository ─────────────────────────────────────────────────────────────

resource "aws_ecr_repository" "auth" {
  name                 = local.name_prefix
  image_tag_mutability = "MUTABLE"
  force_delete         = var.environment != "prod"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = local.common_tags
}

resource "aws_ecr_lifecycle_policy" "auth" {
  repository = aws_ecr_repository.auth.name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep last 10 images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 10
      }
      action = { type = "expire" }
    }]
  })
}

# ── ECS Cluster ────────────────────────────────────────────────────────────────

resource "aws_ecs_cluster" "main" {
  name = "${local.name_prefix}-cluster"

  setting {
    name  = "containerInsights"
    value = var.enable_container_insights ? "enabled" : "disabled"
  }

  tags = local.common_tags
}

# ── CloudWatch Log Group (encrypted at rest) ─────────────────────────────────

resource "aws_cloudwatch_log_group" "auth" {
  name              = "/ecs/${local.name_prefix}"
  retention_in_days = var.log_retention_days
  tags              = local.common_tags
}

# ── ALB access logging ────────────────────────────────────────────────────────

resource "aws_s3_bucket" "alb_logs" {
  count  = var.environment == "prod" ? 1 : 0
  bucket = "${local.name_prefix}-alb-logs"
  tags   = local.common_tags
}

resource "aws_s3_bucket_server_side_encryption_configuration" "alb_logs" {
  count  = var.environment == "prod" ? 1 : 0
  bucket = aws_s3_bucket.alb_logs[0].id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "alb_logs" {
  count  = var.environment == "prod" ? 1 : 0
  bucket = aws_s3_bucket.alb_logs[0].id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "alb_logs" {
  count  = var.environment == "prod" ? 1 : 0
  bucket = aws_s3_bucket.alb_logs[0].id

  rule {
    id     = "expire-old-logs"
    status = "Enabled"
    expiration {
      days = 90
    }
  }
}

resource "aws_s3_bucket_policy" "alb_logs" {
  count  = var.environment == "prod" ? 1 : 0
  bucket = aws_s3_bucket.alb_logs[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { Service = "logdelivery.elasticloadbalancing.amazonaws.com" }
        Action    = "s3:PutObject"
        Resource  = "${aws_s3_bucket.alb_logs[0].arn}/*"
      },
      {
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource  = [aws_s3_bucket.alb_logs[0].arn, "${aws_s3_bucket.alb_logs[0].arn}/*"]
        Condition = {
          Bool = { "aws:SecureTransport" = "false" }
        }
      }
    ]
  })
}

# ── IAM Roles ──────────────────────────────────────────────────────────────────

resource "aws_iam_role" "execution" {
  name = "${local.name_prefix}-exec-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "execution" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "execution_logs" {
  name = "${local.name_prefix}-exec-logs"
  role = aws_iam_role.execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ecr:GetAuthorizationToken",
          "ecr:BatchCheckLayerAvailability",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "${aws_cloudwatch_log_group.auth.arn}:*"
      },
      {
        Effect   = "Allow"
        Action   = "secretsmanager:GetSecretValue"
        Resource = aws_secretsmanager_secret.auth.arn
      }
    ]
  })
}

resource "aws_iam_role" "task" {
  name = "${local.name_prefix}-task-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })

  tags = local.common_tags
}

data "aws_iam_policy_document" "task_control_plane_discovery" {
  count = trimspace(var.control_plane_url_ssm_param_name) != "" ? 1 : 0

  statement {
    sid    = "ReadControlPlaneUrlFromSsm"
    effect = "Allow"
    actions = [
      "ssm:GetParameter",
    ]
    resources = [
      "arn:aws:ssm:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:parameter${var.control_plane_url_ssm_param_name}",
    ]
  }
}

resource "aws_iam_role_policy" "task_control_plane_discovery" {
  count = trimspace(var.control_plane_url_ssm_param_name) != "" ? 1 : 0

  name   = "${local.name_prefix}-cp-discovery"
  role   = aws_iam_role.task.id
  policy = data.aws_iam_policy_document.task_control_plane_discovery[0].json
}

# ── Secrets Manager ────────────────────────────────────────────────────────────

resource "aws_secretsmanager_secret" "auth" {
  name = "${local.name_prefix}-secrets"
  tags = local.common_tags
}

resource "aws_secretsmanager_secret_version" "auth" {
  secret_id = aws_secretsmanager_secret.auth.id

  secret_string = jsonencode({
    NEXTAUTH_SECRET      = var.nextauth_secret
    GOOGLE_CLIENT_ID     = var.google_client_id
    GOOGLE_CLIENT_SECRET = var.google_client_secret
    GITHUB_CLIENT_ID     = var.github_client_id
    GITHUB_CLIENT_SECRET = var.github_client_secret
  })
}

# ── ECS Task Definition ───────────────────────────────────────────────────────

resource "aws_ecs_task_definition" "auth" {
  family                   = "${local.name_prefix}-task"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.cpu
  memory                   = var.memory
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  container_definitions = jsonencode([{
    name      = "auth-backend"
    image     = var.image_uri != "" ? var.image_uri : "${aws_ecr_repository.auth.repository_url}:${var.image_tag}"
    essential = true

    portMappings = [{
      containerPort = var.container_port
      protocol      = "tcp"
    }]

    environment = [
      { name = "PORT", value = tostring(var.container_port) },
      { name = "NODE_ENV", value = "production" },
      { name = "ARIA_DEPLOY_ENV", value = var.environment },
      { name = "NEXTAUTH_URL", value = var.public_url },
      { name = "CONTROL_PLANE_INTERNAL_URL", value = var.control_plane_url },
      { name = "CONTROL_PLANE_URL_SSM_PARAM_NAME", value = var.control_plane_url_ssm_param_name },
    ]

    secrets = [
      { name = "NEXTAUTH_SECRET", valueFrom = "${aws_secretsmanager_secret.auth.arn}:NEXTAUTH_SECRET::" },
      { name = "GOOGLE_CLIENT_ID", valueFrom = "${aws_secretsmanager_secret.auth.arn}:GOOGLE_CLIENT_ID::" },
      { name = "GOOGLE_CLIENT_SECRET", valueFrom = "${aws_secretsmanager_secret.auth.arn}:GOOGLE_CLIENT_SECRET::" },
      { name = "GITHUB_CLIENT_ID", valueFrom = "${aws_secretsmanager_secret.auth.arn}:GITHUB_CLIENT_ID::" },
      { name = "GITHUB_CLIENT_SECRET", valueFrom = "${aws_secretsmanager_secret.auth.arn}:GITHUB_CLIENT_SECRET::" },
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.auth.name
        "awslogs-region"        = data.aws_region.current.region
        "awslogs-stream-prefix" = "auth"
      }
    }

    healthCheck = {
      command     = ["CMD-SHELL", "wget -qO- http://localhost:${var.container_port}/api/health || exit 1"]
      interval    = 30
      timeout     = 5
      retries     = 3
      startPeriod = 60
    }
  }])

  tags = local.common_tags
}

# ── ECS Service ────────────────────────────────────────────────────────────────

resource "aws_ecs_service" "auth" {
  name                              = "${local.name_prefix}-service"
  cluster                           = aws_ecs_cluster.main.id
  task_definition                   = aws_ecs_task_definition.auth.arn
  desired_count                     = var.desired_count
  launch_type                       = "FARGATE"
  platform_version                  = "LATEST"
  health_check_grace_period_seconds = 60

  network_configuration {
    subnets          = aws_subnet.public[*].id
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.auth.arn
    container_name   = "auth-backend"
    container_port   = var.container_port
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  tags = local.common_tags

  depends_on = [aws_lb_listener.http]
}
