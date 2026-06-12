locals {
  name_prefix   = "${var.app_name}-${var.environment}"
  bucket_name   = "${local.name_prefix}-cloudtrail-${var.bucket_suffix}"
  trail_name    = "${local.name_prefix}-trail"
  use_kms       = var.kms_key_arn != ""
  create_alarms = var.alert_sns_topic_arn != ""

  common_tags = merge(
    {
      AppName     = var.app_name
      Environment = var.environment
      ManagedBy   = "terraform"
    },
    var.tags,
  )
}

# ── S3 bucket for CloudTrail logs ─────────────────────────────────────────────

resource "aws_s3_bucket" "trail" {
  bucket        = local.bucket_name
  force_destroy = var.environment != "prod"

  tags = merge(local.common_tags, {
    Name                 = local.bucket_name
    "aria:resource_type" = "security"
  })
}

resource "aws_s3_bucket_public_access_block" "trail" {
  bucket = aws_s3_bucket.trail.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "trail" {
  bucket = aws_s3_bucket.trail.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = local.use_kms ? "aws:kms" : "AES256"
      kms_master_key_id = local.use_kms ? var.kms_key_arn : null
    }
    bucket_key_enabled = local.use_kms
  }
}

resource "aws_s3_bucket_versioning" "trail" {
  bucket = aws_s3_bucket.trail.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "trail" {
  bucket = aws_s3_bucket.trail.id

  rule {
    id     = "expire-cloudtrail-logs"
    status = var.s3_log_retention_days > 0 ? "Enabled" : "Disabled"

    filter {}

    dynamic "expiration" {
      for_each = var.s3_log_retention_days > 0 ? { enabled = true } : {}
      content {
        days = var.s3_log_retention_days
      }
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

# ── Bucket policy: allow CloudTrail to write + enforce HTTPS ──────────────────

data "aws_iam_policy_document" "trail_bucket" {
  # CloudTrail requires GetBucketAcl permission on the bucket
  statement {
    sid    = "AWSCloudTrailAclCheck"
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["cloudtrail.amazonaws.com"]
    }

    actions   = ["s3:GetBucketAcl"]
    resources = [aws_s3_bucket.trail.arn]

    condition {
      test     = "StringEquals"
      variable = "aws:SourceArn"
      values   = ["arn:aws:cloudtrail:${var.aws_region}:${var.aws_account_id}:trail/${local.trail_name}"]
    }
  }

  # CloudTrail PutObject for log delivery
  statement {
    sid    = "AWSCloudTrailWrite"
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["cloudtrail.amazonaws.com"]
    }

    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.trail.arn}/AWSLogs/${var.aws_account_id}/*"]

    condition {
      test     = "StringEquals"
      variable = "s3:x-amz-acl"
      values   = ["bucket-owner-full-control"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceArn"
      values   = ["arn:aws:cloudtrail:${var.aws_region}:${var.aws_account_id}:trail/${local.trail_name}"]
    }
  }

  # Deny all non-HTTPS access
  statement {
    sid    = "DenyHTTP"
    effect = "Deny"

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    actions   = ["s3:*"]
    resources = [aws_s3_bucket.trail.arn, "${aws_s3_bucket.trail.arn}/*"]

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "trail" {
  bucket = aws_s3_bucket.trail.id
  policy = data.aws_iam_policy_document.trail_bucket.json

  depends_on = [aws_s3_bucket_public_access_block.trail]
}

# ── CloudWatch Logs integration ───────────────────────────────────────────────

resource "aws_cloudwatch_log_group" "trail" {
  count = var.enable_cloudwatch_logs ? 1 : 0

  name              = "/aws/cloudtrail/${local.name_prefix}"
  retention_in_days = var.cloudwatch_log_retention_days

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-cloudtrail-logs"
  })
}

data "aws_iam_policy_document" "cloudwatch_assume" {
  count = var.enable_cloudwatch_logs ? 1 : 0

  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["cloudtrail.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "cloudwatch" {
  count = var.enable_cloudwatch_logs ? 1 : 0

  name               = "${local.name_prefix}-cloudtrail-cw-role"
  assume_role_policy = data.aws_iam_policy_document.cloudwatch_assume[0].json

  tags = local.common_tags
}

data "aws_iam_policy_document" "cloudwatch_logs" {
  count = var.enable_cloudwatch_logs ? 1 : 0

  statement {
    sid    = "CreateLogStream"
    effect = "Allow"

    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]

    resources = ["${aws_cloudwatch_log_group.trail[0].arn}:*"]
  }
}

resource "aws_iam_role_policy" "cloudwatch_logs" {
  count = var.enable_cloudwatch_logs ? 1 : 0

  name   = "cloudtrail-cw-logs"
  role   = aws_iam_role.cloudwatch[0].id
  policy = data.aws_iam_policy_document.cloudwatch_logs[0].json
}

# ── CloudTrail trail ──────────────────────────────────────────────────────────

resource "aws_cloudtrail" "main" {
  name                          = local.trail_name
  s3_bucket_name                = aws_s3_bucket.trail.id
  include_global_service_events = var.include_global_service_events
  is_multi_region_trail         = var.is_multi_region
  enable_log_file_validation    = var.enable_log_file_validation
  kms_key_id                    = local.use_kms ? var.kms_key_arn : null
  enable_logging                = true

  cloud_watch_logs_group_arn = var.enable_cloudwatch_logs ? "${aws_cloudwatch_log_group.trail[0].arn}:*" : null
  cloud_watch_logs_role_arn  = var.enable_cloudwatch_logs ? aws_iam_role.cloudwatch[0].arn : null

  # Management events — ALL read/write (default)
  event_selector {
    read_write_type           = "All"
    include_management_events = true

    # S3 object-level data events for all buckets
    dynamic "data_resource" {
      for_each = var.enable_s3_data_events ? { enabled = true } : {}
      content {
        type   = "AWS::S3::Object"
        values = ["arn:aws:s3"]
      }
    }

    # Lambda invocation data events for all functions
    dynamic "data_resource" {
      for_each = var.enable_lambda_data_events ? { enabled = true } : {}
      content {
        type   = "AWS::Lambda::Function"
        values = ["arn:aws:lambda"]
      }
    }
  }

  dynamic "insight_selector" {
    for_each = var.enable_insight_events ? { enabled = true } : {}
    content {
      insight_type = "ApiCallRateInsight"
    }
  }

  tags = merge(local.common_tags, {
    Name = local.trail_name
  })

  depends_on = [aws_s3_bucket_policy.trail]
}

# ── CloudWatch metric filters + alarms ───────────────────────────────────────
# CIS AWS Foundations Benchmark v1.4 recommended alarms (sections 3.1–3.14).
# Only created when enable_cloudwatch_logs = true AND alert_sns_topic_arn is set.

locals {
  log_group_name = var.enable_cloudwatch_logs ? aws_cloudwatch_log_group.trail[0].name : ""
  alarm_actions  = local.create_alarms ? [var.alert_sns_topic_arn] : []

  cis_filters = var.enable_cis_alarms && var.enable_cloudwatch_logs ? {
    # CIS 3.1 — Unauthorised API calls
    "unauthorised-api-calls" = {
      pattern     = "{ ($.errorCode = \"*UnauthorizedOperation\") || ($.errorCode = \"AccessDenied*\") }"
      description = "CIS 3.1 — Unauthorised or access-denied API calls detected"
    }
    # CIS 3.2 — Console login without MFA
    "console-login-no-mfa" = {
      pattern     = "{ ($.eventName = \"ConsoleLogin\") && ($.additionalEventData.MFAUsed != \"Yes\") && ($.userIdentity.type = \"IAMUser\") && ($.responseElements.ConsoleLogin = \"Success\") }"
      description = "CIS 3.2 — AWS Console login without MFA"
    }
    # CIS 3.3 — Root account usage
    "root-account-usage" = {
      pattern     = "{ $.userIdentity.type = \"Root\" && $.userIdentity.invokedBy NOT EXISTS && $.eventType != \"AwsServiceEvent\" }"
      description = "CIS 3.3 — Root account API activity detected"
    }
    # CIS 3.4 — IAM policy changes
    "iam-policy-changes" = {
      pattern     = "{ ($.eventName = DeleteGroupPolicy) || ($.eventName = DeleteRolePolicy) || ($.eventName = DeleteUserPolicy) || ($.eventName = PutGroupPolicy) || ($.eventName = PutRolePolicy) || ($.eventName = PutUserPolicy) || ($.eventName = CreatePolicy) || ($.eventName = DeletePolicy) || ($.eventName = CreatePolicyVersion) || ($.eventName = DeletePolicyVersion) || ($.eventName = SetDefaultPolicyVersion) || ($.eventName = AttachRolePolicy) || ($.eventName = DetachRolePolicy) || ($.eventName = AttachUserPolicy) || ($.eventName = DetachUserPolicy) || ($.eventName = AttachGroupPolicy) || ($.eventName = DetachGroupPolicy) }"
      description = "CIS 3.4 — IAM policy change detected"
    }
    # CIS 3.5 — CloudTrail configuration changes
    "cloudtrail-config-changes" = {
      pattern     = "{ ($.eventName = CreateTrail) || ($.eventName = UpdateTrail) || ($.eventName = DeleteTrail) || ($.eventName = StartLogging) || ($.eventName = StopLogging) }"
      description = "CIS 3.5 — CloudTrail configuration change detected"
    }
    # CIS 3.8 — S3 bucket policy changes
    "s3-policy-changes" = {
      pattern     = "{ ($.eventSource = s3.amazonaws.com) && (($.eventName = PutBucketAcl) || ($.eventName = PutBucketPolicy) || ($.eventName = PutBucketCors) || ($.eventName = PutBucketLifecycle) || ($.eventName = PutBucketReplication) || ($.eventName = DeleteBucketPolicy) || ($.eventName = DeleteBucketCors) || ($.eventName = DeleteBucketLifecycle) || ($.eventName = DeleteBucketReplication)) }"
      description = "CIS 3.8 — S3 bucket policy or configuration change detected"
    }
    # CIS 3.10 — Security group changes
    "security-group-changes" = {
      pattern     = "{ ($.eventName = AuthorizeSecurityGroupIngress) || ($.eventName = AuthorizeSecurityGroupEgress) || ($.eventName = RevokeSecurityGroupIngress) || ($.eventName = RevokeSecurityGroupEgress) || ($.eventName = CreateSecurityGroup) || ($.eventName = DeleteSecurityGroup) }"
      description = "CIS 3.10 — Security group change detected"
    }
    # CIS 3.11 — Network ACL changes
    "nacl-changes" = {
      pattern     = "{ ($.eventName = CreateNetworkAcl) || ($.eventName = CreateNetworkAclEntry) || ($.eventName = DeleteNetworkAcl) || ($.eventName = DeleteNetworkAclEntry) || ($.eventName = ReplaceNetworkAclEntry) || ($.eventName = ReplaceNetworkAclAssociation) }"
      description = "CIS 3.11 — Network ACL change detected"
    }
    # CIS 3.12 — Network gateway changes
    "gateway-changes" = {
      pattern     = "{ ($.eventName = CreateCustomerGateway) || ($.eventName = DeleteCustomerGateway) || ($.eventName = AttachInternetGateway) || ($.eventName = CreateInternetGateway) || ($.eventName = DeleteInternetGateway) || ($.eventName = DetachInternetGateway) }"
      description = "CIS 3.12 — Network gateway change detected"
    }
    # KMS CMK deletion or disabling
    "kms-key-changes" = {
      pattern     = "{ ($.eventSource = kms.amazonaws.com) && (($.eventName = DisableKey) || ($.eventName = ScheduleKeyDeletion)) }"
      description = "KMS customer-managed key disabled or scheduled for deletion"
    }
  } : {}
}

resource "aws_cloudwatch_log_metric_filter" "cis" {
  for_each = local.cis_filters

  name           = "${local.name_prefix}-${each.key}"
  log_group_name = local.log_group_name
  pattern        = each.value.pattern

  metric_transformation {
    name      = replace(each.key, "-", "_")
    namespace = "CloudTrailAlarms/${local.name_prefix}"
    value     = "1"
  }
}

resource "aws_cloudwatch_metric_alarm" "cis" {
  for_each = local.cis_filters

  alarm_name          = "${local.name_prefix}-${each.key}"
  alarm_description   = each.value.description
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  threshold           = 1
  period              = 300
  statistic           = "Sum"
  namespace           = "CloudTrailAlarms/${local.name_prefix}"
  metric_name         = replace(each.key, "-", "_")
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions

  tags = local.common_tags

  depends_on = [aws_cloudwatch_log_metric_filter.cis]
}
