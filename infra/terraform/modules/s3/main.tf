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
