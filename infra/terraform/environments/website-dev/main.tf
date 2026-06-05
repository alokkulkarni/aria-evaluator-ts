data "aws_caller_identity" "current" {}
data "aws_region" "current" {}
data "aws_availability_zones" "available" { state = "available" }

locals {
  availability_zones = slice(data.aws_availability_zones.available.names, 0, 2)

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
  environment = "dev"
  aws_region  = var.aws_region

  # Networking
  vpc_cidr            = "10.50.0.0/16"
  public_subnet_cidrs = ["10.50.1.0/24", "10.50.2.0/24"]
  availability_zones  = local.availability_zones

  # Container — update after first docker push
  container_image = var.container_image

  # Compute (smaller for dev cost savings)
  cpu           = 256
  memory        = 512
  desired_count = 1
  min_capacity  = 1
  max_capacity  = 2

  # Auth secrets (set via environment variables or .tfvars — never hardcode)
  nextauth_secret      = var.nextauth_secret
  google_client_id     = var.google_client_id
  google_client_secret = var.google_client_secret
  github_client_id     = var.github_client_id
  github_client_secret = var.github_client_secret

  # Domain — leave empty in dev, use CloudFront default domain
  domain_name                    = ""
  route53_zone_id                = ""
  acm_certificate_arn_us_east_1  = ""
  acm_certificate_arn_regional   = ""

  # CloudFront
  price_class = "PriceClass_100"

  # Control plane (stub)
  control_plane_url = ""

  # Logging
  log_retention_days = 14

  # No alarms in dev
  alarm_sns_topic_arn = ""

  tags = local.common_tags
}
