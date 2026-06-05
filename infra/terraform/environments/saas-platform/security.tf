locals {
  common_tags = merge(
    var.tags,
    {
      ManagedBy            = "terraform"
      Project              = "aria-evaluator"
      Environment          = var.environment
      AppName              = var.app_name
      "aria:region"        = var.aws_region
      "aria:pricing_track" = "platform"
      "aria:resource_type" = "security"
    }
  )
}

# ── Platform-level security monitoring ───────────────────────────────────────
# GuardDuty + Security Hub enabled in the control plane home region.
# For multi-region expansion (Phase 5), call this module for each region.
#
# NOTE: If GuardDuty or Security Hub were previously enabled manually in this
# account/region, import the existing resources before applying:
#
#   terraform import module.platform_security.aws_guardduty_detector.this <detector_id>
#   terraform import module.platform_security.aws_securityhub_account.this <account_id>

module "platform_security" {
  source = "../../modules/guardduty"

  app_name                = var.app_name
  environment             = var.environment
  aws_region              = var.aws_region
  alert_email             = var.alert_email
  findings_retention_days = var.findings_retention_days

  enable_securityhub_fsbp = true
  enable_securityhub_cis  = true

  tags = local.common_tags
}
