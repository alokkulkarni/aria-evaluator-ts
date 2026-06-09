# CodeBuild project for on-demand evaluator instance provisioning
# Triggered by Lambda when user clicks "Configure Instance"
# Clones repo and runs: terraform apply -var user_id=<uuid> -var plan_type=<plan>

locals {
  codebuild_name = "${var.app_name}-provisioner"
  codebuild_environment_variables = [
    {
      name  = "TERRAFORM_VERSION"
      value = "1.7.0"
      type  = "PLAINTEXT"
    },
    {
      name  = "AWS_REGION"
      value = var.aws_region
      type  = "PLAINTEXT"
    },
    {
      name  = "AWS_ACCOUNT_ID"
      value = var.aws_account_id
      type  = "PLAINTEXT"
    },
    {
      name  = "TERRAFORM_STATE_BUCKET"
      value = var.terraform_state_bucket
      type  = "PLAINTEXT"
    },
    {
      name  = "TERRAFORM_STATE_LOCK_TABLE"
      value = var.terraform_state_lock_table
      type  = "PLAINTEXT"
    },
    {
      name  = "TERRAFORM_STATE_KMS_KEY_ARN"
      value = var.terraform_state_kms_key_arn
      type  = "PLAINTEXT"
    },
    {
      name  = "USER_INSTANCE_TABLE"
      value = var.user_instance_table_name
      type  = "PLAINTEXT"
    },
    {
      name  = "GITHUB_REPO"
      value = var.github_repo_url
      type  = "PLAINTEXT"
    },
    {
      name  = "GITHUB_BRANCH"
      value = var.github_branch
      type  = "PLAINTEXT"
    }
  ]
}

# ── IAM role for CodeBuild ────────────────────────────────────────────────────

resource "aws_iam_role" "codebuild_role" {
  name = "${local.codebuild_name}-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "codebuild.amazonaws.com"
        }
      }
    ]
  })

  tags = var.tags
}

# CloudWatch Logs permission
resource "aws_iam_role_policy" "codebuild_logs" {
  name = "${local.codebuild_name}-logs"
  role = aws_iam_role.codebuild_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:${var.aws_region}:${var.aws_account_id}:log-group:/aws/codebuild/${local.codebuild_name}*"
      }
    ]
  })
}

# S3 permission for terraform state and artifacts
resource "aws_iam_role_policy" "codebuild_s3" {
  name = "${local.codebuild_name}-s3"
  role = aws_iam_role.codebuild_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:ListBucket"
        ]
        Resource = [
          "${var.terraform_state_bucket_arn}",
          "${var.terraform_state_bucket_arn}/*"
        ]
      }
    ]
  })
}

# KMS permission for terraform state encryption
resource "aws_iam_role_policy" "codebuild_kms" {
  name = "${local.codebuild_name}-kms"
  role = aws_iam_role.codebuild_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:Encrypt",
          "kms:GenerateDataKey",
          "kms:DescribeKey"
        ]
        Resource = var.terraform_state_kms_key_arn
      }
    ]
  })
}

# DynamoDB permission for user instance tracking
resource "aws_iam_role_policy" "codebuild_dynamodb" {
  name = "${local.codebuild_name}-dynamodb"
  role = aws_iam_role.codebuild_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:GetItem",
          "dynamodb:Query"
        ]
        Resource = var.user_instance_table_arn
      }
    ]
  })
}

# ECR permission for pulling evaluator image
resource "aws_iam_role_policy" "codebuild_ecr" {
  name = "${local.codebuild_name}-ecr"
  role = aws_iam_role.codebuild_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage",
          "ecr:PutImage",
          "ecr:InitiateLayerUpload",
          "ecr:UploadLayerPart",
          "ecr:CompleteLayerUpload",
          "ecr:DescribeRepositories",
          "ecr:DescribeImages",
          "ecr:ListImages"
        ]
        Resource = var.ecr_repository_arn
      }
    ]
  })
}

# Full AWS permissions for terraform (provisioning evaluator instances)
resource "aws_iam_role_policy" "codebuild_terraform" {
  name = "${local.codebuild_name}-terraform"
  role = aws_iam_role.codebuild_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ec2:*",
          "ecs:*",
          "iam:*",
          "rds:*",
          "elasticache:*",
          "s3:*",
          "dynamodb:*",
          "lambda:*",
          "apigateway:*",
          "cloudwatch:*",
          "logs:*",
          "sns:*",
          "sqs:*",
          "acm:*",
          "route53:*",
          "elasticloadbalancing:*",
          "kms:*",
          "secretsmanager:*",
          "ssm:*"
        ]
        Resource = "*"
      }
    ]
  })
}

# Secrets Manager permission for sensitive variables
resource "aws_iam_role_policy" "codebuild_secrets" {
  name = "${local.codebuild_name}-secrets"
  role = aws_iam_role.codebuild_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret"
        ]
        Resource = "arn:aws:secretsmanager:${var.aws_region}:${var.aws_account_id}:secret:${var.app_name}-provisioner-*"
      }
    ]
  })
}

# ── CodeBuild Project ────────────────────────────────────────────────────────

resource "aws_codebuild_project" "provisioner" {
  name          = local.codebuild_name
  service_role  = aws_iam_role.codebuild_role.arn
  build_timeout = 30 # 30 minutes for terraform apply + infrastructure setup

  environment {
    compute_type                = "BUILD_GENERAL1_LARGE"
    image                       = "aws/codebuild/standard:7.0"
    type                        = "LINUX_CONTAINER"
    image_pull_credentials_type = "CODEBUILD"
    dynamic "environment_variable" {
      for_each = local.codebuild_environment_variables
      content {
        name  = environment_variable.value.name
        value = environment_variable.value.value
        type  = environment_variable.value.type
      }
    }
  }

  source {
    type      = "NO_SOURCE"
    buildspec = file("${path.module}/buildspec.yaml")
  }

  artifacts {
    type = "NO_ARTIFACTS"
  }

  logs_config {
    cloudwatch_logs {
      group_name  = "/aws/codebuild/${local.codebuild_name}"
      stream_name = "provisioning"
    }
  }

  tags = var.tags
}

# CloudWatch Log Group
resource "aws_cloudwatch_log_group" "codebuild_logs" {
  name              = "/aws/codebuild/${local.codebuild_name}"
  retention_in_days = 30

  tags = var.tags
}
