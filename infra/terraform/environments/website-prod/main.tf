data "aws_caller_identity" "current" {}
data "aws_region" "current" {}
data "aws_availability_zones" "available" { state = "available" }

locals {
  availability_zones = slice(data.aws_availability_zones.available.names, 0, 3)

  common_tags = merge(
    var.tags,
    {
      "aria:region"        = data.aws_region.current.name
      "aria:pricing_track" = "platform"
    },
  )
}

module "website" {
  source = "../../modules/website"

  providers = {
    aws           = aws
    aws.us_east_1 = aws.us_east_1
  }

  app_name    = "aria"
  environment = "prod"
  aws_region  = var.aws_region

  # Networking — 3 AZs for HA
  vpc_cidr            = "10.60.0.0/16"
  public_subnet_cidrs = var.public_subnet_cidrs
  availability_zones  = local.availability_zones

  # Container
  container_image = var.container_image

  # Compute (production sizing)
  cpu           = 1024
  memory        = 2048
  desired_count = 2
  min_capacity  = 2
  max_capacity  = 20

  # Auth secrets — all sourced from AWS Secrets Manager at runtime via Terraform variables
  nextauth_secret      = var.nextauth_secret
  google_client_id     = var.google_client_id
  google_client_secret = var.google_client_secret
  github_client_id     = var.github_client_id
  github_client_secret = var.github_client_secret

  # Domain & TLS (REQUIRED for prod)
  domain_name                   = var.domain_name
  route53_zone_id               = var.route53_zone_id
  acm_certificate_arn_us_east_1 = var.acm_certificate_arn_us_east_1
  acm_certificate_arn_regional  = var.acm_certificate_arn_regional

  # CloudFront — global delivery
  price_class = "PriceClass_All"

  # Control plane — wire when Phase 1 is complete
  control_plane_url = var.control_plane_url

  # Logging
  log_retention_days = 90

  # Alarms
  alarm_sns_topic_arn = var.alarm_sns_topic_arn

  tags = local.common_tags
}
