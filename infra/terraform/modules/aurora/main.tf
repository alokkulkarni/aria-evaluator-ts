# infra/terraform/modules/aurora/main.tf
# Aurora Serverless v2 (PostgreSQL) for the shared multi-tenant ARIA Evaluator.
# Replaces the single-writer SQLite-on-S3 model so the app can run multiple
# tasks/instances concurrently and the DB compute autoscales with load.
# See docs/MULTI_TENANT_SPEC.md (Phase 1). Not wired into any environment yet.

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0, < 7.0"
    }
    random = {
      source  = "hashicorp/random"
      version = ">= 3.0"
    }
  }
}

locals {
  name = "${var.environment}-aria-aurora"
}

resource "random_password" "master" {
  length  = 32
  special = false # keeps the connection string URL-safe (no %-encoding)
}

resource "aws_db_subnet_group" "main" {
  name       = local.name
  subnet_ids = var.subnet_ids
  tags       = merge(var.tags, { Name = local.name })
}

resource "aws_security_group" "db" {
  name        = "${local.name}-sg"
  description = "ARIA ${var.environment} Aurora — Postgres ingress from the app"
  vpc_id      = var.vpc_id

  # Inline ingress (not a for_each'd aws_security_group_rule) so the allowed app
  # SG ids may be computed/unknown at plan time without an Invalid for_each error.
  ingress {
    description     = "Postgres from the app security group(s)"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = var.allowed_security_group_ids
  }

  tags = merge(var.tags, { Name = "${local.name}-sg" })
}

# ── Aurora Serverless v2 cluster ──────────────────────────────────────────────
resource "aws_rds_cluster" "main" {
  cluster_identifier = local.name
  engine             = "aurora-postgresql"
  engine_mode        = "provisioned" # required for Serverless v2 scaling config
  engine_version     = var.engine_version
  database_name      = var.database_name
  master_username    = var.master_username
  master_password    = random_password.master.result

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.db.id]

  serverlessv2_scaling_configuration {
    min_capacity = var.min_acu
    max_capacity = var.max_acu
  }

  storage_encrypted         = true
  deletion_protection       = var.deletion_protection
  skip_final_snapshot       = var.skip_final_snapshot
  final_snapshot_identifier = var.skip_final_snapshot ? null : "${local.name}-final"
  backup_retention_period   = var.backup_retention_days
  apply_immediately         = var.apply_immediately

  tags = merge(var.tags, { Name = local.name })
}

resource "aws_rds_cluster_instance" "this" {
  count              = var.instance_count
  identifier         = "${local.name}-${count.index}"
  cluster_identifier = aws_rds_cluster.main.id
  instance_class     = "db.serverless"
  engine             = aws_rds_cluster.main.engine
  engine_version     = aws_rds_cluster.main.engine_version
  tags               = merge(var.tags, { Name = "${local.name}-${count.index}" })
}

# ── Master credentials secret (consumed by RDS Proxy) ─────────────────────────
resource "aws_secretsmanager_secret" "master" {
  name = "${local.name}-master"
  tags = merge(var.tags, { Name = "${local.name}-master" })
}
resource "aws_secretsmanager_secret_version" "master" {
  secret_id     = aws_secretsmanager_secret.master.id
  secret_string = jsonencode({ username = var.master_username, password = random_password.master.result })
}

# ── Optional RDS Proxy — connection pooling for autoscaled ECS tasks ──────────
# Many tasks × Prisma pools would exhaust the cluster's connection limit; the
# proxy multiplexes them. Strongly recommended once per-tenant ECS + autoscaling
# is enabled (Phase 5).
resource "aws_iam_role" "proxy" {
  count = var.enable_proxy ? 1 : 0
  name  = "${local.name}-proxy"
  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Effect    = "Allow",
      Principal = { Service = "rds.amazonaws.com" },
      Action    = "sts:AssumeRole"
    }]
  })
  tags = var.tags
}
resource "aws_iam_role_policy" "proxy_secret" {
  count = var.enable_proxy ? 1 : 0
  role  = aws_iam_role.proxy[0].id
  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Effect   = "Allow",
      Action   = ["secretsmanager:GetSecretValue"],
      Resource = aws_secretsmanager_secret.master.arn
    }]
  })
}
resource "aws_db_proxy" "main" {
  count                  = var.enable_proxy ? 1 : 0
  name                   = local.name
  engine_family          = "POSTGRESQL"
  role_arn               = aws_iam_role.proxy[0].arn
  vpc_subnet_ids         = var.subnet_ids
  vpc_security_group_ids = [aws_security_group.db.id]
  require_tls            = true
  auth {
    auth_scheme = "SECRETS"
    iam_auth    = "DISABLED"
    secret_arn  = aws_secretsmanager_secret.master.arn
  }
  tags = merge(var.tags, { Name = local.name })
}
resource "aws_db_proxy_default_target_group" "main" {
  count         = var.enable_proxy ? 1 : 0
  db_proxy_name = aws_db_proxy.main[0].name
}
resource "aws_db_proxy_target" "main" {
  count                 = var.enable_proxy ? 1 : 0
  db_proxy_name         = aws_db_proxy.main[0].name
  target_group_name     = aws_db_proxy_default_target_group.main[0].name
  db_cluster_identifier = aws_rds_cluster.main.id
}

# ── Full DATABASE_URL secret (consumed by the ECS task as a `valueFrom` env) ──
locals {
  db_host      = var.enable_proxy ? aws_db_proxy.main[0].endpoint : aws_rds_cluster.main.endpoint
  database_url = "postgresql://${var.master_username}:${random_password.master.result}@${local.db_host}:5432/${var.database_name}?schema=public&sslmode=require&connection_limit=${var.app_connection_limit}"
}
resource "aws_secretsmanager_secret" "database_url" {
  name = "${local.name}-database-url"
  tags = merge(var.tags, { Name = "${local.name}-database-url" })
}
resource "aws_secretsmanager_secret_version" "database_url" {
  secret_id     = aws_secretsmanager_secret.database_url.id
  secret_string = local.database_url
}
