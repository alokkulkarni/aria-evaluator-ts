locals {
  bucket_name = var.bucket_suffix != "" ? "${var.app_name}-${var.environment}-state-${var.bucket_suffix}" : "${var.app_name}-${var.environment}-state"

  common_tags = merge(
    var.tags,
    {
      ManagedBy            = "terraform"
      Project              = "aria-evaluator"
      Environment          = var.environment
      AppName              = var.app_name
      "aria:resource_type" = "storage"
    },
    var.tenant_id != "" ? { "aria:tenant_id" = var.tenant_id } : {},
    var.pricing_tier != "" ? { "aria:pricing_tier" = var.pricing_tier } : {},
  )
}

resource "aws_s3_bucket" "state" {
  bucket        = local.bucket_name
  force_destroy = var.force_destroy

  tags = merge(local.common_tags, {
    Name = local.bucket_name
  })

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_public_access_block" "state" {
  bucket = aws_s3_bucket.state.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id

  versioning_configuration {
    status = var.versioning_enabled ? "Enabled" : "Suspended"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "state" {
  bucket = aws_s3_bucket.state.id

  rule {
    id     = "abort-incomplete-multipart"
    status = "Enabled"

    abort_incomplete_multipart_upload {
      days_after_initiation = var.lifecycle_abort_incomplete_days
    }
  }
}

# ── HTTPS-only bucket policy ───────────────────────────────────────────────────
# Denies any request that does NOT use TLS (aws:SecureTransport = false).
# This covers both HTTP presigned URLs and unsigned HTTP API calls.
# The policy uses a Deny effect so it overrides any Allow in identity policies.
#
# Two statements are required:
#   1. Deny s3:* on the bucket itself (for ListBucket, GetBucketLocation, etc.)
#   2. Deny s3:* on all objects within the bucket (GetObject, PutObject, etc.)

data "aws_iam_policy_document" "https_only" {
  statement {
    sid     = "DenyHTTPBucketAccess"
    effect  = "Deny"
    actions = ["s3:*"]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    resources = [aws_s3_bucket.state.arn]

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }

  statement {
    sid     = "DenyHTTPObjectAccess"
    effect  = "Deny"
    actions = ["s3:*"]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    resources = ["${aws_s3_bucket.state.arn}/*"]

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "https_only" {
  bucket = aws_s3_bucket.state.id
  policy = data.aws_iam_policy_document.https_only.json

  # The public access block must be in place before attaching a policy,
  # otherwise AWS may reject the policy as potentially making the bucket public.
  depends_on = [aws_s3_bucket_public_access_block.state]
}
