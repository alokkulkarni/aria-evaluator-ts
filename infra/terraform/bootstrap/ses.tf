# SES domain identity for ARIA Evaluator outbound email (suspend warnings, notifications).
#
# Usage:
#   1. Set ses_sender_domain = "ariaeval.io" in terraform.tfvars.
#   2. terraform apply
#   3. Run: terraform output ses_dkim_tokens
#      Add three CNAME records to your DNS zone:
#        <token>._domainkey.<domain>  →  <token>.dkim.amazonses.com
#   4. Add the MAIL FROM MX record:
#        mail.<domain>  MX  10  feedback-smtp.<region>.amazonses.com
#   5. Request SES production access via AWS Support Console to move out of sandbox.
#
# Multi-region note: SES identities are regional. If tenants are provisioned in
# additional regions, run bootstrap in each region (var.aws_region) to create
# the SES identity there. The same domain token set is re-used for DKIM.

resource "aws_ses_domain_identity" "sender" {
  count  = var.ses_sender_domain != "" ? 1 : 0
  domain = var.ses_sender_domain
}

resource "aws_ses_domain_dkim" "sender" {
  count  = var.ses_sender_domain != "" ? 1 : 0
  domain = aws_ses_domain_identity.sender[0].domain
}

# Custom MAIL FROM improves deliverability and DMARC alignment.
resource "aws_ses_domain_mail_from" "sender" {
  count            = var.ses_sender_domain != "" ? 1 : 0
  domain           = aws_ses_domain_identity.sender[0].domain
  mail_from_domain = "mail.${var.ses_sender_domain}"
  # Fall back to SES default if MAIL FROM MX record is not yet propagated.
  behavior_on_mx_failure = "UseDefaultValue"
}
