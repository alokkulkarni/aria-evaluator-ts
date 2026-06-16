# modules/platform/main.tf
# The shared, pooled stack every tenant-service attaches to. Reuses the existing
# networking / aurora / iam modules; the ALB (wildcard cert + default-404, per-tenant
# host rules added by tenant-service), ECS cluster, Redis, and S3 state bucket are
# defined here because the existing alb/ecs modules are coupled to a single service.
# See docs/MULTI_TENANT_SPEC.md (Phase 5).

terraform {
  required_version = ">= 1.6.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0, < 7.0"
    }
  }
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}
data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  name               = "${var.app_name}-${var.environment}"
  availability_zones = length(var.availability_zones) > 0 ? var.availability_zones : slice(data.aws_availability_zones.available.names, 0, 2)
  state_bucket_name  = var.state_bucket_name != "" ? var.state_bucket_name : "${var.app_name}-${var.environment}-platform-${data.aws_caller_identity.current.account_id}"
}

# ── Networking (reuse) ─────────────────────────────────────────────────────────
module "networking" {
  source = "../networking"

  app_name                = var.app_name
  environment             = var.environment
  vpc_cidr                = var.vpc_cidr
  public_subnet_cidrs     = var.public_subnet_cidrs
  private_subnets_enabled = true
  private_subnet_cidrs    = var.private_subnet_cidrs
  availability_zones      = local.availability_zones
  container_port          = var.container_port
  tags                    = var.tags
}

# ── Shared S3 state bucket (scenarios seed prefix per tenant) ──────────────────
resource "aws_s3_bucket" "state" {
  bucket        = local.state_bucket_name
  force_destroy = var.state_bucket_force_destroy
  tags          = var.tags
}

resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_public_access_block" "state" {
  bucket                  = aws_s3_bucket.state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ── Aurora Serverless v2 (reuse the PR#36-fixed module) ───────────────────────
module "aurora" {
  source = "../aurora"

  environment = var.environment
  vpc_id      = module.networking.vpc_id
  subnet_ids  = module.networking.private_subnet_ids
  # Tenant tasks + (for purge-on-delete) the control-plane connect to Aurora.
  allowed_security_group_ids = compact([
    module.networking.ecs_service_security_group_id,
    var.control_plane_security_group_id,
  ])
  enable_proxy        = true
  engine_version      = var.aurora_engine_version
  min_acu             = var.aurora_min_acu
  max_acu             = var.aurora_max_acu
  deletion_protection = var.aurora_deletion_protection
  tags                = var.tags
}

# ── Shared IAM (reuse) — execution role can read the Aurora DATABASE_URL secret ─
module "iam" {
  source = "../iam"

  app_name              = var.app_name
  environment           = var.environment
  state_bucket_arn      = aws_s3_bucket.state.arn
  aws_region            = data.aws_region.current.name
  aws_account_id        = data.aws_caller_identity.current.account_id
  secrets_arns          = [module.aurora.database_url_secret_arn]
  execution_secret_arns = [module.aurora.database_url_secret_arn]
  tags                  = var.tags
}

# ── Shared ECS cluster ─────────────────────────────────────────────────────────
resource "aws_ecs_cluster" "main" {
  name = "${local.name}-platform"
  setting {
    name  = "containerInsights"
    value = "enabled"
  }
  tags = var.tags
}

# ── Shared ALB: wildcard HTTPS + default 404; tenant host rules attach per tenant ─
resource "aws_lb" "main" {
  name                       = substr("${local.name}-plat", 0, 32)
  load_balancer_type         = "application"
  internal                   = false
  security_groups            = [module.networking.alb_security_group_id]
  subnets                    = module.networking.public_subnet_ids
  idle_timeout               = 120
  enable_deletion_protection = var.alb_enable_deletion_protection
  tags                       = var.tags
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.main.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.acm_certificate_arn

  # No default target group — tenant-service adds a host-header rule per tenant.
  default_action {
    type = "fixed-response"
    fixed_response {
      content_type = "text/plain"
      message_body = "No ARIA tenant is configured for this host."
      status_code  = "404"
    }
  }

  tags = var.tags
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }

  tags = var.tags
}

# ── Shared Redis (SSE pub/sub + leader-election lock; keys are tenant-namespaced) ─
resource "aws_security_group" "redis" {
  name_prefix = "${local.name}-redis-"
  description = "ARIA ${var.environment} shared Redis — 6379 from tenant tasks"
  vpc_id      = module.networking.vpc_id

  ingress {
    description     = "Redis from tenant ECS tasks"
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [module.networking.ecs_service_security_group_id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = var.tags
}

resource "aws_elasticache_subnet_group" "redis" {
  name       = "${local.name}-platform"
  subnet_ids = module.networking.private_subnet_ids
}

resource "aws_elasticache_cluster" "redis" {
  cluster_id           = substr("${local.name}-plat", 0, 20)
  engine               = "redis"
  engine_version       = var.redis_engine_version
  node_type            = var.redis_node_type
  num_cache_nodes      = 1
  parameter_group_name = "default.redis7"
  port                 = 6379
  subnet_group_name    = aws_elasticache_subnet_group.redis.name
  security_group_ids   = [aws_security_group.redis.id]
  tags                 = var.tags
}

# ── Wildcard DNS → ALB ─────────────────────────────────────────────────────────
resource "aws_route53_record" "wildcard" {
  count   = var.route53_zone_id != "" ? 1 : 0
  zone_id = var.route53_zone_id
  name    = "*.${var.domain}"
  type    = "A"

  alias {
    name                   = aws_lb.main.dns_name
    zone_id                = aws_lb.main.zone_id
    evaluate_target_health = true
  }
}

# ── Control-plane provisioning permission (Phase 6) ────────────────────────────
# The control-plane creates/wakes/suspends/tears down per-tenant ECS services via
# the AWS SDK (no CodeBuild), and purges tenant data (S3 prefix + DB secret) on
# delete. ALB traffic alone can't scale a 0-task service, so wake is control-plane
# driven (UpdateService desired=1 on login).
resource "aws_iam_policy" "control_plane_provisioning" {
  count       = var.control_plane_role_name != "" ? 1 : 0
  name        = "${local.name}-cp-provisioning"
  description = "Allow the control-plane to provision/wake/suspend/tear down per-tenant ECS services and purge tenant data."

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "EcsProvisioning"
        Effect = "Allow"
        Action = [
          "ecs:RegisterTaskDefinition",
          "ecs:DeregisterTaskDefinition",
          "ecs:DescribeTaskDefinition",
          "ecs:CreateService",
          "ecs:UpdateService",
          "ecs:DeleteService",
          "ecs:DescribeServices",
          "ecs:ListTasks",
          "ecs:DescribeTasks",
          "ecs:TagResource",
        ]
        Resource = "*"
      },
      {
        Sid    = "ElbProvisioning"
        Effect = "Allow"
        Action = [
          "elasticloadbalancing:CreateTargetGroup",
          "elasticloadbalancing:DeleteTargetGroup",
          "elasticloadbalancing:DescribeTargetGroups",
          "elasticloadbalancing:CreateRule",
          "elasticloadbalancing:DeleteRule",
          "elasticloadbalancing:ModifyRule",
          "elasticloadbalancing:DescribeRules",
          "elasticloadbalancing:AddTags",
        ]
        Resource = "*"
      },
      {
        Sid    = "Autoscaling"
        Effect = "Allow"
        Action = [
          "application-autoscaling:RegisterScalableTarget",
          "application-autoscaling:DeregisterScalableTarget",
          "application-autoscaling:PutScalingPolicy",
          "application-autoscaling:DeleteScalingPolicy",
          "application-autoscaling:DescribeScalableTargets",
          "application-autoscaling:DescribeScalingPolicies",
        ]
        Resource = "*"
      },
      {
        Sid      = "PassTaskRoles"
        Effect   = "Allow"
        Action   = "iam:PassRole"
        Resource = [module.iam.task_execution_role_arn, module.iam.task_role_arn]
        Condition = {
          StringEquals = { "iam:PassedToService" = "ecs-tasks.amazonaws.com" }
        }
      },
      {
        Sid      = "TenantBucketList"
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = aws_s3_bucket.state.arn
      },
      {
        Sid      = "TenantObjectPurge"
        Effect   = "Allow"
        Action   = ["s3:DeleteObject", "s3:GetObject"]
        Resource = "${aws_s3_bucket.state.arn}/*"
      },
      {
        Sid      = "ReadDbSecret"
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = module.aurora.database_url_secret_arn
      },
    ]
  })

  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "control_plane_provisioning" {
  count      = var.control_plane_role_name != "" ? 1 : 0
  role       = var.control_plane_role_name
  policy_arn = aws_iam_policy.control_plane_provisioning[0].arn
}
