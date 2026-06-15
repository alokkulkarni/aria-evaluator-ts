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

  # End-to-end TLS on the ALB is enabled when a custom origin domain + hosted
  # zone are supplied (prod). Without them (dev) the ALB stays HTTP :80.
  https_enabled = var.origin_domain != "" && var.route53_zone_id != ""

  # Move the Fargate tasks off the public subnets when a private tier is supplied.
  private_enabled = length(var.private_subnet_cidrs) > 0

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

# ── Private subnet tier + NAT (egress for Fargate tasks: OAuth providers, AWS) ──
# Created only when private_subnet_cidrs is supplied. The ALB stays in the public
# subnets; only the ECS tasks move to private. NAT is required because the
# auth-backend makes outbound calls to Google/Apple OAuth endpoints.

resource "aws_subnet" "private" {
  count             = length(var.private_subnet_cidrs)
  vpc_id            = aws_vpc.main.id
  cidr_block        = var.private_subnet_cidrs[count.index]
  availability_zone = var.availability_zones[count.index]
  tags              = merge(local.common_tags, { Name = "${local.name_prefix}-private-${count.index}" })
}

resource "aws_eip" "nat" {
  count  = local.private_enabled ? 1 : 0
  domain = "vpc"
  tags   = merge(local.common_tags, { Name = "${local.name_prefix}-nat-eip" })
}

resource "aws_nat_gateway" "main" {
  count         = local.private_enabled ? 1 : 0
  allocation_id = aws_eip.nat[0].id
  subnet_id     = aws_subnet.public[0].id
  tags          = merge(local.common_tags, { Name = "${local.name_prefix}-nat" })
  depends_on    = [aws_internet_gateway.main]
}

resource "aws_route_table" "private" {
  count  = local.private_enabled ? 1 : 0
  vpc_id = aws_vpc.main.id
  tags   = merge(local.common_tags, { Name = "${local.name_prefix}-private-rt" })
}

resource "aws_route" "private_nat" {
  count                  = local.private_enabled ? 1 : 0
  route_table_id         = aws_route_table.private[0].id
  destination_cidr_block = "0.0.0.0/0"
  nat_gateway_id         = aws_nat_gateway.main[0].id
}

resource "aws_route_table_association" "private" {
  count          = length(aws_subnet.private)
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private[0].id
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

# ── ACM certificate for the custom origin domain (regional, DNS-validated) ─────

resource "aws_acm_certificate" "origin" {
  count             = local.https_enabled ? 1 : 0
  domain_name       = var.origin_domain
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = merge(local.common_tags, { Name = var.origin_domain })
}

resource "aws_route53_record" "origin_cert_validation" {
  for_each = local.https_enabled ? {
    for dvo in aws_acm_certificate.origin[0].domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      type   = dvo.resource_record_type
      record = dvo.resource_record_value
    }
  } : {}

  zone_id         = var.route53_zone_id
  name            = each.value.name
  type            = each.value.type
  records         = [each.value.record]
  ttl             = 60
  allow_overwrite = true
}

resource "aws_acm_certificate_validation" "origin" {
  count                   = local.https_enabled ? 1 : 0
  certificate_arn         = aws_acm_certificate.origin[0].arn
  validation_record_fqdns = [for r in aws_route53_record.origin_cert_validation : r.fqdn]
}

# A-alias: origin.<domain> → the auth ALB (so CloudFront has an HTTPS origin host)
resource "aws_route53_record" "origin_alias" {
  count   = local.https_enabled ? 1 : 0
  zone_id = var.route53_zone_id
  name    = var.origin_domain
  type    = "A"

  alias {
    name                   = aws_lb.main.dns_name
    zone_id                = aws_lb.main.zone_id
    evaluate_target_health = false
  }
}

# ── Listeners ──────────────────────────────────────────────────────────────────
# HTTP-only mode (dev): :80 returns 403 unless the origin-secret header matches.
# HTTPS mode (prod): :80 redirects to :443; :443 terminates TLS and applies the
# same origin-secret guard. The forward rule attaches to whichever listener serves.

# Single :80 listener (modified in place — never destroyed+recreated, which would
# clash on the port). HTTPS mode (prod): redirect :80 → 443. HTTP-only mode (dev):
# return 403 unless the origin-secret header matches (the forward rule below).
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  dynamic "default_action" {
    for_each = local.https_enabled ? [] : [1]
    content {
      type = "fixed-response"
      fixed_response {
        content_type = "text/plain"
        message_body = "Forbidden"
        status_code  = "403"
      }
    }
  }

  dynamic "default_action" {
    for_each = local.https_enabled ? [1] : []
    content {
      type = "redirect"
      redirect {
        port        = "443"
        protocol    = "HTTPS"
        status_code = "HTTP_301"
      }
    }
  }

  tags = local.common_tags
}

resource "aws_lb_listener" "https" {
  count             = local.https_enabled ? 1 : 0
  load_balancer_arn = aws_lb.main.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate_validation.origin[0].certificate_arn

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

# Forward to the app only when the CloudFront origin-secret header matches.
resource "aws_lb_listener_rule" "origin_verified" {
  listener_arn = local.https_enabled ? aws_lb_listener.https[0].arn : aws_lb_listener.http.arn
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
  force_delete         = var.force_destroy || var.environment != "prod"

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
  count         = var.environment == "prod" ? 1 : 0
  bucket        = "${local.name_prefix}-alb-logs"
  force_destroy = var.force_destroy
  tags          = local.common_tags
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

# Auto-generated signing secret — never needs to be in tfvars or state-exposed.
# Rotate by tainting this resource: terraform taint module.auth_backend.random_password.nextauth_secret
resource "random_password" "nextauth_secret" {
  length  = 48
  special = false
}

resource "aws_secretsmanager_secret" "auth" {
  name = "${local.name_prefix}-secrets"
  tags = local.common_tags
}

# Terraform writes the secret ONCE on first apply (seed values).
# lifecycle.ignore_changes means subsequent applies never overwrite the secret —
# real Google/GitHub credentials are populated out-of-band by the bootstrap script:
#   infra/scripts/bootstrap-oauth-secrets.sh <env>
resource "aws_secretsmanager_secret_version" "auth" {
  secret_id = aws_secretsmanager_secret.auth.id

  secret_string = jsonencode(merge(
    {
      NEXTAUTH_SECRET      = random_password.nextauth_secret.result
      GOOGLE_CLIENT_ID     = "PENDING_BOOTSTRAP"
      GOOGLE_CLIENT_SECRET = "PENDING_BOOTSTRAP"
      GITHUB_CLIENT_ID     = "PENDING_BOOTSTRAP"
      GITHUB_CLIENT_SECRET = "PENDING_BOOTSTRAP"
    },
    trimspace(var.cognito_client_secret) != "" ? {
      COGNITO_CLIENT_SECRET = var.cognito_client_secret
    } : {},
  ))

  lifecycle { ignore_changes = [secret_string] }
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
      { name = "AUTH_URL", value = var.public_url },
      { name = "AUTH_TRUST_HOST", value = "true" },
      { name = "COGNITO_ENABLED", value = var.cognito_enabled ? "true" : "false" },
      { name = "COGNITO_CLIENT_ID", value = var.cognito_client_id },
      { name = "COGNITO_ISSUER", value = var.cognito_issuer },
      { name = "COGNITO_DOMAIN", value = var.cognito_domain },
      { name = "CONTROL_PLANE_INTERNAL_URL", value = var.control_plane_url },
      { name = "CONTROL_PLANE_URL_SSM_PARAM_NAME", value = var.control_plane_url_ssm_param_name },
    ]

    secrets = concat(
      [
        { name = "NEXTAUTH_SECRET", valueFrom = "${aws_secretsmanager_secret.auth.arn}:NEXTAUTH_SECRET::" },
        { name = "GOOGLE_CLIENT_ID", valueFrom = "${aws_secretsmanager_secret.auth.arn}:GOOGLE_CLIENT_ID::" },
        { name = "GOOGLE_CLIENT_SECRET", valueFrom = "${aws_secretsmanager_secret.auth.arn}:GOOGLE_CLIENT_SECRET::" },
        { name = "GITHUB_CLIENT_ID", valueFrom = "${aws_secretsmanager_secret.auth.arn}:GITHUB_CLIENT_ID::" },
        { name = "GITHUB_CLIENT_SECRET", valueFrom = "${aws_secretsmanager_secret.auth.arn}:GITHUB_CLIENT_SECRET::" },
      ],
      trimspace(var.cognito_client_secret) != "" ? [
        { name = "COGNITO_CLIENT_SECRET", valueFrom = "${aws_secretsmanager_secret.auth.arn}:COGNITO_CLIENT_SECRET::" },
      ] : [],
    )

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.auth.name
        "awslogs-region"        = data.aws_region.current.region
        "awslogs-stream-prefix" = "auth"
      }
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
    subnets          = local.private_enabled ? aws_subnet.private[*].id : aws_subnet.public[*].id
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = local.private_enabled ? false : true
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

  # Wait for NAT egress before placing tasks in private subnets, otherwise the
  # first deployment can't pull its image from ECR and trips the circuit breaker.
  depends_on = [
    aws_lb_listener_rule.origin_verified,
    aws_route.private_nat,
    aws_route_table_association.private,
  ]
}
