data "aws_caller_identity" "current" {}

locals {
  name_prefix = "${var.app_name}-${var.environment}"
  common_tags = merge(
    var.tags,
    {
      ManagedBy            = "terraform"
      Project              = "aria-evaluator"
      Environment          = var.environment
      AppName              = var.app_name
      "aria:region"        = var.aws_region
      "aria:resource_type" = "security"
    },
  )
}

# ── KMS key for GuardDuty findings encryption ─────────────────────────────────
# A dedicated CMK is required so GuardDuty, EventBridge, and S3 can all use it.
# The bootstrap KMS key is not used here to avoid circular dependency.

data "aws_iam_policy_document" "findings_kms" {
  statement {
    sid    = "AllowRootAccount"
    effect = "Allow"

    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"]
    }

    actions   = ["kms:*"]
    resources = ["*"]
  }

  statement {
    sid    = "AllowGuardDutyEncrypt"
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["guardduty.amazonaws.com"]
    }

    actions = [
      "kms:Encrypt",
      "kms:Decrypt",
      "kms:ReEncrypt*",
      "kms:GenerateDataKey*",
      "kms:DescribeKey",
    ]
    resources = ["*"]

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }

  statement {
    sid    = "AllowEventBridgeSNS"
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["events.amazonaws.com"]
    }

    actions = [
      "kms:GenerateDataKey*",
      "kms:Decrypt",
    ]
    resources = ["*"]
  }
}

resource "aws_kms_key" "findings" {
  description             = "KMS key for GuardDuty findings and security alerts SNS"
  enable_key_rotation     = true
  deletion_window_in_days = 30
  policy                  = data.aws_iam_policy_document.findings_kms.json

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-guardduty-findings-key"
  })

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_kms_alias" "findings" {
  name          = "alias/${local.name_prefix}-guardduty-findings"
  target_key_id = aws_kms_key.findings.key_id
}

# ── GuardDuty Detector ────────────────────────────────────────────────────────

resource "aws_guardduty_detector" "this" {
  enable = true

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-guardduty-detector"
  })

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_guardduty_detector_feature" "s3_logs" {
  detector_id = aws_guardduty_detector.this.id
  name        = "S3_DATA_EVENTS"
  status      = "ENABLED"
}

resource "aws_guardduty_detector_feature" "malware_protection" {
  detector_id = aws_guardduty_detector.this.id
  name        = "EBS_MALWARE_PROTECTION"
  status      = "ENABLED"
}

# ── S3 bucket for GuardDuty findings export ───────────────────────────────────

resource "aws_s3_bucket" "findings" {
  bucket = lower("${local.name_prefix}-guardduty-findings")

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-guardduty-findings"
  })

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_public_access_block" "findings" {
  bucket = aws_s3_bucket.findings.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "findings" {
  bucket = aws_s3_bucket.findings.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "findings" {
  bucket = aws_s3_bucket.findings.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.findings.arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "findings" {
  bucket = aws_s3_bucket.findings.id

  rule {
    id     = "expire-findings"
    status = "Enabled"

    filter {}

    expiration {
      days = var.findings_retention_days
    }

    noncurrent_version_expiration {
      noncurrent_days = 30
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

data "aws_iam_policy_document" "findings_bucket" {
  # Deny all non-TLS access
  statement {
    sid    = "DenyNonSSL"
    effect = "Deny"

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    actions   = ["s3:*"]
    resources = [aws_s3_bucket.findings.arn, "${aws_s3_bucket.findings.arn}/*"]

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }

  # Allow GuardDuty to check the bucket
  statement {
    sid    = "AllowGuardDutyBucketCheck"
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["guardduty.amazonaws.com"]
    }

    actions   = ["s3:GetBucketLocation"]
    resources = [aws_s3_bucket.findings.arn]

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceArn"
      values   = [aws_guardduty_detector.this.arn]
    }
  }

  # Allow GuardDuty to write findings
  statement {
    sid    = "AllowGuardDutyPutFindings"
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["guardduty.amazonaws.com"]
    }

    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.findings.arn}/guardduty/*"]

    condition {
      test     = "StringEquals"
      variable = "s3:x-amz-acl"
      values   = ["bucket-owner-full-control"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceArn"
      values   = [aws_guardduty_detector.this.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "findings" {
  bucket = aws_s3_bucket.findings.id
  policy = data.aws_iam_policy_document.findings_bucket.json

  depends_on = [aws_s3_bucket_public_access_block.findings]
}

# ── GuardDuty → S3 publishing destination ────────────────────────────────────

resource "aws_guardduty_publishing_destination" "s3" {
  detector_id     = aws_guardduty_detector.this.id
  destination_arn = aws_s3_bucket.findings.arn
  kms_key_arn     = aws_kms_key.findings.arn

  depends_on = [aws_s3_bucket_policy.findings]
}

# ── Security Hub ──────────────────────────────────────────────────────────────
# NOTE: If Security Hub is already manually enabled in this account/region,
# import the existing resource first:
#   terraform import aws_securityhub_account.this <account_id>

resource "aws_securityhub_account" "this" {
  enable_default_standards = false # We subscribe explicitly below

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_securityhub_standards_subscription" "fsbp" {
  count = var.enable_securityhub_fsbp ? 1 : 0

  standards_arn = "arn:aws:securityhub:${var.aws_region}::standards/aws-foundational-security-best-practices/v/1.0.0"

  depends_on = [aws_securityhub_account.this]
}

resource "aws_securityhub_standards_subscription" "cis" {
  count = var.enable_securityhub_cis ? 1 : 0

  # Using CIS 1.4.0 — widely available across all 8 supported regions
  standards_arn = "arn:aws:securityhub:${var.aws_region}::standards/cis-aws-foundations-benchmark/v/1.4.0"

  depends_on = [aws_securityhub_account.this]
}

# Enable GuardDuty as a Security Hub integration so findings flow into Security Hub
resource "aws_securityhub_product_subscription" "guardduty" {
  product_arn = "arn:aws:securityhub:${var.aws_region}::product/aws/guardduty"

  depends_on = [aws_securityhub_account.this]
}

# ── SNS topic for security alerts ────────────────────────────────────────────

resource "aws_sns_topic" "alerts" {
  name              = "${local.name_prefix}-security-alerts"
  kms_master_key_id = aws_kms_key.findings.id

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-security-alerts"
  })
}

data "aws_iam_policy_document" "alerts_topic" {
  statement {
    sid    = "AllowAccountPublish"
    effect = "Allow"

    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"]
    }

    actions   = ["SNS:*"]
    resources = [aws_sns_topic.alerts.arn]
  }

  # Allow EventBridge to publish findings alerts
  statement {
    sid    = "AllowEventBridgePublish"
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["events.amazonaws.com"]
    }

    actions   = ["SNS:Publish"]
    resources = [aws_sns_topic.alerts.arn]
  }
}

resource "aws_sns_topic_policy" "alerts" {
  arn    = aws_sns_topic.alerts.arn
  policy = data.aws_iam_policy_document.alerts_topic.json
}

resource "aws_sns_topic_subscription" "alert_email" {
  count = var.alert_email != "" ? 1 : 0

  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

# ── EventBridge: GuardDuty HIGH/CRITICAL findings → SNS ──────────────────────

resource "aws_cloudwatch_event_rule" "guardduty_high" {
  name        = "${local.name_prefix}-guardduty-high"
  description = "Capture GuardDuty findings with severity >= 7 (HIGH or CRITICAL)"

  event_pattern = jsonencode({
    source      = ["aws.guardduty"]
    detail-type = ["GuardDuty Finding"]
    detail = {
      severity = [{ numeric = [">=", 7] }]
    }
  })

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-guardduty-high"
  })
}

resource "aws_cloudwatch_event_target" "guardduty_high_sns" {
  rule      = aws_cloudwatch_event_rule.guardduty_high.name
  target_id = "SecurityAlertsSNS"
  arn       = aws_sns_topic.alerts.arn

  input_transformer {
    input_paths = {
      account    = "$.account"
      region     = "$.region"
      title      = "$.detail.title"
      severity   = "$.detail.severity"
      type       = "$.detail.type"
      detectorId = "$.detail.service.detectorId"
      findingId  = "$.detail.id"
      updatedAt  = "$.detail.updatedAt"
    }
    input_template = "\"[ARIA SECURITY ALERT] GuardDuty HIGH/CRITICAL Finding\\nAccount: <account>  Region: <region>\\nSeverity: <severity>  Type: <type>\\nTitle: <title>\\nFinding ID: <findingId>\\nDetector: <detectorId>\\nUpdated: <updatedAt>\""
  }
}

# ── EventBridge: Security Hub HIGH/CRITICAL findings → SNS ───────────────────

resource "aws_cloudwatch_event_rule" "securityhub_critical" {
  name        = "${local.name_prefix}-securityhub-critical"
  description = "Capture Security Hub findings with CRITICAL or HIGH severity"

  event_pattern = jsonencode({
    source      = ["aws.securityhub"]
    detail-type = ["Security Hub Findings - Imported"]
    detail = {
      findings = {
        Severity = {
          Label = ["CRITICAL", "HIGH"]
        }
        RecordState   = ["ACTIVE"]
        WorkflowState = ["NEW", "NOTIFIED"]
      }
    }
  })

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-securityhub-critical"
  })
}

resource "aws_cloudwatch_event_target" "securityhub_critical_sns" {
  rule      = aws_cloudwatch_event_rule.securityhub_critical.name
  target_id = "SecurityAlertsSNS"
  arn       = aws_sns_topic.alerts.arn

  input_transformer {
    input_paths = {
      account     = "$.account"
      region      = "$.region"
      title       = "$.detail.findings[0].Title"
      severity    = "$.detail.findings[0].Severity.Label"
      description = "$.detail.findings[0].Description"
      productName = "$.detail.findings[0].ProductName"
      findingId   = "$.detail.findings[0].Id"
      updatedAt   = "$.detail.findings[0].UpdatedAt"
    }
    input_template = "\"[ARIA SECURITY ALERT] Security Hub <severity> Finding\\nAccount: <account>  Region: <region>\\nProduct: <productName>\\nTitle: <title>\\nDescription: <description>\\nFinding ID: <findingId>\\nUpdated: <updatedAt>\""
  }
}
