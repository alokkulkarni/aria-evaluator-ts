# ── AWS Config (account-level drift detection) ────────────────────────────────
# Gated on var.enable_aws_config. AWS Config's configuration recorder is a
# singleton per account+region, so it belongs in this account-level security
# module (alongside GuardDuty + Security Hub), NOT in any app stack such as
# evaluator-prod — a second recorder in the same region would fail.
#
# What it gives us:
#   • Lights up the already-subscribed Security Hub FSBP/CIS controls, which
#     cannot evaluate without Config (incl. ECS.2 "no auto-assign public IP" and
#     the EC2 SG-open controls).
#   • Two explicit managed rules with their own SNS alert, so drift pages us even
#     if the Security Hub standards are later disabled:
#       - 0.0.0.0/0 SG ingress on any port other than the public ALB's 80/443
#       - ECS services with AssignPublicIp=ENABLED
#
# Cost is kept low by scoping the recorder to just SecurityGroup + ECS::Service.

locals {
  config_enabled       = var.enable_aws_config ? 1 : 0
  config_bucket_name   = lower("${local.name_prefix}-aws-config")
  config_recorder_name = "${local.name_prefix}-config-recorder"
  # Rule names (referenced by the EventBridge alert pattern below).
  config_rule_sg_open       = "${local.name_prefix}-sg-no-unauthorized-public-ingress"
  config_rule_ecs_public_ip = "${local.name_prefix}-ecs-no-auto-public-ip"
}

# ── Delivery S3 bucket ────────────────────────────────────────────────────────
# SSE-S3 (AES256) rather than the findings CMK: keeps the Config delivery path
# independent of the prevent_destroy KMS key policy. Still encrypted at rest.

resource "aws_s3_bucket" "config" {
  count  = local.config_enabled
  bucket = local.config_bucket_name

  tags = merge(local.common_tags, {
    Name = local.config_bucket_name
  })
}

resource "aws_s3_bucket_public_access_block" "config" {
  count  = local.config_enabled
  bucket = aws_s3_bucket.config[0].id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "config" {
  count  = local.config_enabled
  bucket = aws_s3_bucket.config[0].id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "config" {
  count  = local.config_enabled
  bucket = aws_s3_bucket.config[0].id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "config" {
  count  = local.config_enabled
  bucket = aws_s3_bucket.config[0].id

  rule {
    id     = "expire-config-snapshots"
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

data "aws_iam_policy_document" "config_bucket" {
  count = local.config_enabled

  # Deny all non-TLS access.
  statement {
    sid    = "DenyNonSSL"
    effect = "Deny"

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    actions   = ["s3:*"]
    resources = [aws_s3_bucket.config[0].arn, "${aws_s3_bucket.config[0].arn}/*"]

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }

  # AWS Config needs to verify the bucket ACL and that the bucket exists.
  statement {
    sid    = "AWSConfigBucketPermissionsCheck"
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["config.amazonaws.com"]
    }

    actions   = ["s3:GetBucketAcl", "s3:ListBucket"]
    resources = [aws_s3_bucket.config[0].arn]

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }

  # AWS Config writes configuration snapshots/history here.
  statement {
    sid    = "AWSConfigBucketDelivery"
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["config.amazonaws.com"]
    }

    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.config[0].arn}/AWSLogs/${data.aws_caller_identity.current.account_id}/Config/*"]

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
  }
}

resource "aws_s3_bucket_policy" "config" {
  count  = local.config_enabled
  bucket = aws_s3_bucket.config[0].id
  policy = data.aws_iam_policy_document.config_bucket[0].json

  depends_on = [aws_s3_bucket_public_access_block.config]
}

# ── IAM role for the Config recorder ──────────────────────────────────────────

data "aws_iam_policy_document" "config_assume" {
  count = local.config_enabled

  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["config.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }
}

resource "aws_iam_role" "config" {
  count              = local.config_enabled
  name               = "${local.name_prefix}-config-recorder"
  assume_role_policy = data.aws_iam_policy_document.config_assume[0].json

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-config-recorder"
  })
}

# AWS managed policy granting Config read access to record resource state.
resource "aws_iam_role_policy_attachment" "config_managed" {
  count      = local.config_enabled
  role       = aws_iam_role.config[0].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWS_ConfigRole"
}

# S3 delivery permissions for the recorder role (the managed policy does not
# grant write access to the delivery bucket).
data "aws_iam_policy_document" "config_s3_delivery" {
  count = local.config_enabled

  statement {
    effect    = "Allow"
    actions   = ["s3:GetBucketAcl", "s3:ListBucket"]
    resources = [aws_s3_bucket.config[0].arn]
  }

  statement {
    effect    = "Allow"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.config[0].arn}/AWSLogs/${data.aws_caller_identity.current.account_id}/Config/*"]

    condition {
      test     = "StringEquals"
      variable = "s3:x-amz-acl"
      values   = ["bucket-owner-full-control"]
    }
  }
}

resource "aws_iam_role_policy" "config_s3_delivery" {
  count  = local.config_enabled
  name   = "${local.name_prefix}-config-s3-delivery"
  role   = aws_iam_role.config[0].id
  policy = data.aws_iam_policy_document.config_s3_delivery[0].json
}

# ── Recorder, delivery channel, status ────────────────────────────────────────

resource "aws_config_configuration_recorder" "this" {
  count    = local.config_enabled
  name     = local.config_recorder_name
  role_arn = aws_iam_role.config[0].arn

  # Narrow scope to keep recorded configuration-item volume (and cost) minimal
  # while still covering the two drift rules below.
  recording_group {
    all_supported                 = false
    include_global_resource_types = false
    resource_types = [
      "AWS::EC2::SecurityGroup",
      "AWS::ECS::Service",
    ]
  }
}

resource "aws_config_delivery_channel" "this" {
  count          = local.config_enabled
  name           = "${local.name_prefix}-config-delivery"
  s3_bucket_name = aws_s3_bucket.config[0].bucket

  depends_on = [
    aws_config_configuration_recorder.this,
    aws_s3_bucket_policy.config,
  ]
}

resource "aws_config_configuration_recorder_status" "this" {
  count      = local.config_enabled
  name       = aws_config_configuration_recorder.this[0].name
  is_enabled = true

  depends_on = [aws_config_delivery_channel.this]
}

# ── Drift rules ───────────────────────────────────────────────────────────────

# R1 drift: a security group opening any port other than the public ALB's
# 80/443 to 0.0.0.0/0. The ALB's intentional public 80/443 is authorized, so it
# stays COMPLIANT; the ECS task SG (ALB-SG-sourced only) is COMPLIANT until
# someone adds a world-open rule — which is exactly the misconfiguration we want
# paged.
resource "aws_config_config_rule" "sg_open" {
  count = local.config_enabled
  name  = local.config_rule_sg_open

  source {
    owner             = "AWS"
    source_identifier = "VPC_SG_OPEN_ONLY_TO_AUTHORIZED_PORTS"
  }

  input_parameters = jsonencode({
    authorizedTcpPorts = var.config_authorized_public_tcp_ports
  })

  tags = local.common_tags

  depends_on = [aws_config_configuration_recorder_status.this]
}

# R4 / FSBP ECS.2: ECS services must not auto-assign public IPs. NOTE: while the
# evaluator runs on Option A (public subnets + public IPs) this rule is
# NON_COMPLIANT by design — it is the standing audit signal for that posture and
# clears automatically once the evaluator moves to private subnets (Option B/C).
# It also catches an accidental flip back to public after that migration.
resource "aws_config_config_rule" "ecs_public_ip" {
  count = local.config_enabled
  name  = local.config_rule_ecs_public_ip

  source {
    owner             = "AWS"
    source_identifier = "ECS_SERVICE_ASSIGN_PUBLIC_IP_DISABLED"
  }

  tags = local.common_tags

  depends_on = [aws_config_configuration_recorder_status.this]
}

# ── EventBridge: Config NON_COMPLIANT → SNS alerts ───────────────────────────
# Fires on compliance-state transitions (not continuously). The ECS.2 rule emits
# one alert when it first evaluates NON_COMPLIANT (expected under Option A); the
# SG rule alerts only on genuine drift.

resource "aws_cloudwatch_event_rule" "config_noncompliant" {
  count       = local.config_enabled
  name        = "${local.name_prefix}-config-noncompliant"
  description = "AWS Config drift rules transitioning to NON_COMPLIANT (0.0.0.0/0 SG ingress, ECS public IP)"

  event_pattern = jsonencode({
    source      = ["aws.config"]
    detail-type = ["Config Rules Compliance Change"]
    detail = {
      messageType = ["ComplianceChangeNotification"]
      configRuleName = [
        local.config_rule_sg_open,
        local.config_rule_ecs_public_ip,
      ]
      newEvaluationResult = {
        complianceType = ["NON_COMPLIANT"]
      }
    }
  })

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-config-noncompliant"
  })
}

resource "aws_cloudwatch_event_target" "config_noncompliant_sns" {
  count     = local.config_enabled
  rule      = aws_cloudwatch_event_rule.config_noncompliant[0].name
  target_id = "SecurityAlertsSNS"
  arn       = aws_sns_topic.alerts.arn

  input_transformer {
    input_paths = {
      account      = "$.account"
      region       = "$.region"
      rule         = "$.detail.configRuleName"
      resourceId   = "$.detail.resourceId"
      resourceType = "$.detail.resourceType"
      compliance   = "$.detail.newEvaluationResult.complianceType"
    }
    input_template = "\"[ARIA SECURITY ALERT] AWS Config NON_COMPLIANT\\nAccount: <account>  Region: <region>\\nRule: <rule>\\nResource: <resourceType> <resourceId>\\nCompliance: <compliance>\""
  }
}
