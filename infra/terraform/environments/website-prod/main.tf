data "aws_caller_identity" "current" {}
data "aws_region" "current" {}
data "aws_availability_zones" "available" { state = "available" }

locals {
  availability_zones  = slice(data.aws_availability_zones.available.names, 0, 3)
  repo_root           = abspath("${path.module}/../../../..")
  website_root        = "${local.repo_root}/website"
  public_url          = var.domain_name != "" ? "https://${var.domain_name}" : "https://${module.frontend.cloudfront_domain_name}"
  use_prebuilt_auth   = var.auth_backend_image_uri != ""
  resolved_auth_image = local.use_prebuilt_auth ? var.auth_backend_image_uri : module.docker_build_auth[0].image_uri

  common_tags = merge(
    var.tags,
    {
      "aria:region"        = data.aws_region.current.region
      "aria:pricing_track" = "platform"
    },
  )
}

# ── Build & push auth-backend Docker image to ECR ─────────────────────────────
# Skipped when auth_backend_image_uri is provided (CI/CD pre-built image)

module "docker_build_auth" {
  count  = local.use_prebuilt_auth ? 0 : 1
  source = "../../modules/docker-build-push"

  ecr_repository_url = module.auth_backend.ecr_repository_url
  image_tag          = var.auth_backend_image_tag
  dockerfile         = "auth-backend/Dockerfile"
  build_context      = local.website_root
  aws_region         = var.aws_region
  force_rebuild      = var.force_rebuild
}

# ── Build & deploy static website to S3 ───────────────────────────────────────
# Skipped when skip_website_build is true (CI/CD handles S3 sync separately)

resource "null_resource" "build_and_deploy_website" {
  count = var.skip_website_build ? 0 : 1
  triggers = {
    package_lock_sha = filesha1("${local.website_root}/package-lock.json")
    force_rebuild    = var.force_rebuild
  }

  depends_on = [module.frontend]

  provisioner "local-exec" {
    working_dir = local.website_root

    command = <<-EOT
      set -euo pipefail

      echo "==> Installing website dependencies..."
      npm ci --prefer-offline

      echo "==> Building static website (signup_mode=${var.signup_mode})..."

      # For static export, temporarily move API routes and middleware (they belong to auth-backend)
      if [ -d src/app/api ]; then
        mv src/app/api src/app/_api_backup
      fi
      if [ -f src/middleware.ts ]; then
        mv src/middleware.ts src/_middleware_backup.ts
      fi

      NEXT_PUBLIC_SIGNUP_MODE=${var.signup_mode} NEXT_BUILD_MODE=export npm run build

      # Restore API routes and middleware
      if [ -d src/app/_api_backup ]; then
        mv src/app/_api_backup src/app/api
      fi
      if [ -f src/_middleware_backup.ts ]; then
        mv src/_middleware_backup.ts src/middleware.ts
      fi

      echo "==> Syncing to S3: ${module.frontend.s3_bucket_name}..."
      aws s3 sync out/ "s3://${module.frontend.s3_bucket_name}/" --delete --region ${var.aws_region}

      echo "==> Invalidating CloudFront cache..."
      aws cloudfront create-invalidation \
        --distribution-id "${module.frontend.cloudfront_distribution_id}" \
        --paths "/*" \
        --region us-east-1

      echo "==> Website deployed."
    EOT
  }
}

# ── Auth Backend (ECS Fargate behind ALB) ─────────────────────────────────────

module "auth_backend" {
  source = "../../modules/website-auth"

  app_name    = "aria"
  environment = "prod"
  public_url  = local.public_url

  # Separate VPC for auth backend
  vpc_cidr            = "10.61.0.0/16"
  public_subnet_cidrs = ["10.61.1.0/24", "10.61.2.0/24", "10.61.3.0/24"]
  availability_zones  = local.availability_zones

  # Auth backend is lightweight — 0.25 vCPU, 512 MiB, 2 replicas for HA
  cpu           = 256
  memory        = 512
  desired_count = 2
  image_tag     = var.auth_backend_image_tag
  image_uri     = local.use_prebuilt_auth ? var.auth_backend_image_uri : ""

  # Auth secrets
  nextauth_secret       = var.nextauth_secret
  google_client_id      = var.google_client_id
  google_client_secret  = var.google_client_secret
  github_client_id      = var.github_client_id
  github_client_secret  = var.github_client_secret
  cognito_enabled       = var.enable_cognito
  cognito_client_id     = try(module.cognito[0].app_client_id, "")
  cognito_client_secret = try(module.cognito[0].app_client_secret, "")
  cognito_issuer        = try(module.cognito[0].issuer, "")
  cognito_domain        = try(module.cognito[0].user_pool_domain_fqdn, "")

  control_plane_url                = var.control_plane_url
  control_plane_url_ssm_param_name = var.control_plane_url_ssm_param_name
  log_retention_days               = 90
  enable_container_insights        = true

  tags = local.common_tags
}

module "cognito" {
  count  = var.enable_cognito ? 1 : 0
  source = "../../modules/cognito"

  app_name    = "aria"
  environment = "prod"
  domain_name = var.domain_name

  google_client_id     = var.google_client_id
  google_client_secret = var.google_client_secret
  apple_client_id      = var.apple_client_id
  apple_team_id        = var.apple_team_id
  apple_key_id         = var.apple_key_id
  apple_private_key    = var.apple_private_key

  callback_urls = ["${local.public_url}/api/auth/callback/cognito"]
  logout_urls   = ["${local.public_url}/sign-out"]
}

# ── Static Frontend (S3 + CloudFront) ─────────────────────────────────────────

module "frontend" {
  source = "../../modules/website-frontend"

  providers = {
    aws = aws.us_east_1
  }

  app_name    = "aria"
  environment = "prod"

  # Domain & TLS
  domain_name                    = var.domain_name
  route53_zone_id                = var.route53_zone_id
  acm_certificate_arn_cloudfront = var.acm_certificate_arn_us_east_1

  # Wire auth backend ALB as second CloudFront origin
  auth_backend_alb_dns       = module.auth_backend.alb_dns_name
  auth_backend_origin_secret = module.auth_backend.origin_secret

  waf_rate_limit = 2000

  tags = local.common_tags
}

# ── CloudTrail ────────────────────────────────────────────────────────────────
# Records all management API calls and data events across ALL AWS regions.
# Prod: multi-region, Insights, 1-year retention, full CIS alarms.

module "cloudtrail" {
  source = "../../modules/cloudtrail"

  app_name       = "aria-website"
  environment    = "prod"
  aws_region     = var.aws_region
  aws_account_id = data.aws_caller_identity.current.account_id
  bucket_suffix  = var.cloudtrail_bucket_suffix

  is_multi_region               = true
  include_global_service_events = true
  enable_log_file_validation    = true
  enable_s3_data_events         = true
  enable_lambda_data_events     = true
  enable_insight_events         = true
  enable_cloudwatch_logs        = true
  cloudwatch_log_retention_days = 90
  s3_log_retention_days         = 365
  kms_key_arn                   = var.cloudtrail_kms_key_arn

  # Re-use the existing alarm SNS topic already declared in this environment
  alert_sns_topic_arn = var.alarm_sns_topic_arn

  tags = local.common_tags
}
