data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  repo_root    = abspath("${path.module}/../../../..")
  website_root = "${local.repo_root}/website"

  common_tags = merge(
    var.tags,
    {
      "aria:region"        = data.aws_region.current.region
      "aria:pricing_track" = "platform"
    },
  )

  # Route53 TXT records cap each character string at 255 bytes. Auto-chunk the
  # DKIM key so Terraform sends it correctly regardless of key length. To rotate
  # the DKIM key: update google_dkim_txt in terraform.tfvars and re-apply.
  dkim_chunks = chunklist(split("", var.google_dkim_txt), 255)
  dkim_record = join(" ", [for chunk in local.dkim_chunks : "\"${join("", chunk)}\""])
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

      echo "==> Building static website..."
      NEXT_PUBLIC_GA4_MEASUREMENT_ID=${var.ga4_measurement_id} NEXT_BUILD_MODE=export npm run build

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

# ── Google Workspace MX ───────────────────────────────────────────────────────
# Created manually; adopted into Terraform so it can't be dropped accidentally.
# Import before the first apply:
#   terraform import 'aws_route53_record.google_workspace_mx[0]' \
#     '${var.route53_zone_id}_${var.domain_name}_MX'
resource "aws_route53_record" "google_workspace_mx" {
  count   = var.route53_zone_id != "" ? 1 : 0
  zone_id = var.route53_zone_id
  name    = var.domain_name
  type    = "MX"
  ttl     = 3600
  records = ["1 SMTP.GOOGLE.COM"]
}

# ── Google Workspace DKIM TXT ─────────────────────────────────────────────────
# Created manually; adopted into Terraform. If you rotate the DKIM key in Google
# Admin, update google_dkim_txt in terraform.tfvars and re-apply.
# Import before the first apply:
#   terraform import 'aws_route53_record.google_dkim[0]' \
#     '${var.route53_zone_id}_google._domainkey.${var.domain_name}_TXT'
resource "aws_route53_record" "google_dkim" {
  count   = var.route53_zone_id != "" && var.google_dkim_txt != "" ? 1 : 0
  zone_id = var.route53_zone_id
  name    = "google._domainkey.${var.domain_name}"
  type    = "TXT"
  ttl     = 3600
  records = [local.dkim_record]
}

# ── Google Search Console verification (DNS TXT) ──────────────────────────────
# Created out-of-band; adopted into Terraform so it's codified.
# Import before the first apply:
#   terraform import 'aws_route53_record.google_site_verification[0]' \
#     '${var.route53_zone_id}_${var.domain_name}_TXT'
# If SPF/DMARC TXT are later needed at the apex, fold them into the `records`
# list here — there can only be one TXT record set per name.
resource "aws_route53_record" "google_site_verification" {
  count   = var.google_site_verification_txt != "" && var.route53_zone_id != "" ? 1 : 0
  zone_id = var.route53_zone_id
  name    = var.domain_name
  type    = "TXT"
  ttl     = 3600
  records = ["google-site-verification=${var.google_site_verification_txt}"]
}

# ── Google SEO API credentials — from Secrets Manager ─────────────────────────
# Canonical as-code home for the local seo tooling's Google credentials (PageSpeed/
# CrUX API key + Search Console / GA4 service-account JSON). Seeded with placeholders,
# then populated out-of-band:
#   aws secretsmanager put-secret-value --secret-id /aria/website/prod/seo-google-api \
#     --secret-string "$(jq -n --arg k "$API_KEY" --rawfile sa service_account.json \
#       '{api_key:$k, service_account_json:$sa}')"
resource "aws_secretsmanager_secret" "seo_google" {
  name                    = "/aria/website/prod/seo-google-api"
  description             = "Google SEO API credentials (PSI/CrUX api_key + Search Console/GA4 service account) for analyst tooling"
  recovery_window_in_days = 7
  tags                    = local.common_tags
}

resource "aws_secretsmanager_secret_version" "seo_google" {
  secret_id = aws_secretsmanager_secret.seo_google.id
  secret_string = jsonencode({
    api_key              = "PENDING_BOOTSTRAP"
    service_account_json = "PENDING_BOOTSTRAP"
  })
  lifecycle {
    ignore_changes = [secret_string] # real values populated out-of-band; don't revert
  }
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

  waf_rate_limit = 2000
  force_destroy  = var.force_destroy

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

  force_destroy = var.force_destroy

  tags = local.common_tags
}
