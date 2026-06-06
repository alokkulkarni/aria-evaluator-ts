data "aws_caller_identity" "current" {}

data "aws_canonical_user_id" "current" {}

data "aws_cloudfront_log_delivery_canonical_user_id" "current" {}

locals {
  name_prefix     = var.tenant_id != "" ? "${var.app_name}-${var.environment}-${var.tenant_id}" : "${var.app_name}-${var.environment}"
  short_name      = "${substr(local.name_prefix, 0, 14)}-${substr(md5(local.name_prefix), 0, 5)}"
  use_custom_cert = var.acm_certificate_arn != ""
  log_bucket_name = lower("aria-${local.short_name}-cf-logs")
  common_tags = merge(
    var.tags,
    {
      ManagedBy            = "terraform"
      Project              = "aria-evaluator"
      Environment          = var.environment
      AppName              = var.app_name
      "aria:resource_type" = "network"
    },
    var.tenant_id != "" ? { "aria:tenant_id" = var.tenant_id } : {},
    var.pricing_tier != "" ? { "aria:pricing_tier" = var.pricing_tier } : {},
  )
}

resource "aws_s3_bucket" "cf_logs" {
  bucket = local.log_bucket_name

  tags = merge(local.common_tags, {
    Name                 = local.log_bucket_name
    "aria:resource_type" = "storage"
  })
}

resource "aws_s3_bucket_public_access_block" "cf_logs" {
  bucket = aws_s3_bucket.cf_logs.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "cf_logs" {
  bucket = aws_s3_bucket.cf_logs.id

  rule {
    object_ownership = "BucketOwnerPreferred"
  }
}

resource "aws_s3_bucket_acl" "cf_logs" {
  depends_on = [
    aws_s3_bucket_public_access_block.cf_logs,
    aws_s3_bucket_ownership_controls.cf_logs,
  ]

  bucket = aws_s3_bucket.cf_logs.id

  access_control_policy {
    owner {
      id = data.aws_canonical_user_id.current.id
    }

    grant {
      grantee {
        id   = data.aws_cloudfront_log_delivery_canonical_user_id.current.id
        type = "CanonicalUser"
      }
      permission = "FULL_CONTROL"
    }

    grant {
      grantee {
        id   = data.aws_canonical_user_id.current.id
        type = "CanonicalUser"
      }
      permission = "FULL_CONTROL"
    }
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "cf_logs" {
  bucket = aws_s3_bucket.cf_logs.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_versioning" "cf_logs" {
  bucket = aws_s3_bucket.cf_logs.id

  versioning_configuration {
    status = "Suspended"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "cf_logs" {
  bucket = aws_s3_bucket.cf_logs.id

  rule {
    id     = "expire-cf-logs"
    status = "Enabled"

    filter {}

    expiration {
      days = 90
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

data "aws_iam_policy_document" "cf_logs" {
  statement {
    sid    = "AllowCloudFrontLogDelivery"
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["delivery.logs.amazonaws.com"]
    }

    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.cf_logs.arn}/cf-access/*"]

    condition {
      test     = "StringEquals"
      variable = "s3:x-amz-acl"
      values   = ["bucket-owner-full-control"]
    }
  }

  statement {
    sid    = "AllowCloudFrontLogAclCheck"
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["delivery.logs.amazonaws.com"]
    }

    actions   = ["s3:GetBucketAcl"]
    resources = [aws_s3_bucket.cf_logs.arn]
  }

  # Deny all non-HTTPS requests — enforces TLS for all S3 API calls
  statement {
    sid    = "DenyHTTP"
    effect = "Deny"

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    actions   = ["s3:*"]
    resources = [aws_s3_bucket.cf_logs.arn, "${aws_s3_bucket.cf_logs.arn}/*"]

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "cf_logs" {
  bucket = aws_s3_bucket.cf_logs.id
  policy = data.aws_iam_policy_document.cf_logs.json

  depends_on = [aws_s3_bucket_public_access_block.cf_logs]
}

resource "aws_cloudfront_cache_policy" "static" {
  name        = "${local.short_name}-static"
  comment     = "Static asset cache policy for ${local.name_prefix}"
  default_ttl = var.static_cache_default_ttl
  max_ttl     = var.static_cache_max_ttl
  min_ttl     = 0

  parameters_in_cache_key_and_forwarded_to_origin {
    cookies_config {
      cookie_behavior = "none"
    }
    headers_config {
      header_behavior = "none"
    }
    query_strings_config {
      query_string_behavior = "none"
    }
    enable_accept_encoding_brotli = true
    enable_accept_encoding_gzip   = true
  }
}

resource "aws_cloudfront_cache_policy" "no_cache" {
  name        = "${local.short_name}-no-cache"
  comment     = "Disable edge caching for dynamic endpoints in ${local.name_prefix}"
  default_ttl = 0
  max_ttl     = 1
  min_ttl     = 0

  parameters_in_cache_key_and_forwarded_to_origin {
    cookies_config {
      cookie_behavior = "all"
    }
    headers_config {
      header_behavior = "none"
    }
    query_strings_config {
      query_string_behavior = "all"
    }
    enable_accept_encoding_brotli = true
    enable_accept_encoding_gzip   = true
  }
}

resource "aws_cloudfront_origin_request_policy" "api" {
  name    = "${local.short_name}-api-origin"
  comment = "Forward all request context for API paths in ${local.name_prefix}"

  cookies_config {
    cookie_behavior = "all"
  }
  headers_config {
    header_behavior = "allViewer"
  }
  query_strings_config {
    query_string_behavior = "all"
  }
}

resource "aws_cloudfront_function" "auth_redirect" {
  count   = var.saas_mode ? 1 : 0
  name    = "${local.short_name}-auth-redirect"
  runtime = "cloudfront-js-1.0"
  comment = "Redirect unauthenticated requests to ${var.main_website_url}/sign-in"
  publish = true

  code = templatefile("${path.module}/templates/auth_redirect.js.tpl", {
    main_website_url = var.main_website_url
  })
}

resource "aws_cloudfront_distribution" "main" {
  enabled             = true
  http_version        = "http2"
  price_class         = var.price_class
  default_root_object = var.default_root_object
  aliases             = var.aliases
  comment             = "${local.name_prefix} distribution"
  web_acl_id          = var.waf_web_acl_arn != "" ? var.waf_web_acl_arn : null

  origin {
    origin_id   = "alb-origin"
    domain_name = var.alb_dns_name

    dynamic "custom_header" {
      for_each = var.cloudfront_origin_secret != "" ? [1] : []

      content {
        name  = "X-CF-Origin-Secret"
        value = var.cloudfront_origin_secret
      }
    }

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    target_origin_id       = "alb-origin"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD", "OPTIONS"]
    compress               = true
    cache_policy_id        = aws_cloudfront_cache_policy.static.id

    dynamic "function_association" {
      for_each = var.saas_mode ? [1] : []
      content {
        event_type   = "viewer-request"
        function_arn = aws_cloudfront_function.auth_redirect[0].arn
      }
    }
  }

  ordered_cache_behavior {
    path_pattern             = "/api/*"
    target_origin_id         = "alb-origin"
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "PATCH", "POST", "DELETE"]
    cached_methods           = ["GET", "HEAD", "OPTIONS"]
    compress                 = true
    cache_policy_id          = aws_cloudfront_cache_policy.no_cache.id
    origin_request_policy_id = aws_cloudfront_origin_request_policy.api.id

    dynamic "function_association" {
      for_each = var.saas_mode ? [1] : []
      content {
        event_type   = "viewer-request"
        function_arn = aws_cloudfront_function.auth_redirect[0].arn
      }
    }
  }

  ordered_cache_behavior {
    path_pattern             = "/reports/*"
    target_origin_id         = "alb-origin"
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["GET", "HEAD", "OPTIONS"]
    cached_methods           = ["GET", "HEAD", "OPTIONS"]
    compress                 = true
    cache_policy_id          = aws_cloudfront_cache_policy.no_cache.id
    origin_request_policy_id = aws_cloudfront_origin_request_policy.api.id

    dynamic "function_association" {
      for_each = var.saas_mode ? [1] : []
      content {
        event_type   = "viewer-request"
        function_arn = aws_cloudfront_function.auth_redirect[0].arn
      }
    }
  }

  ordered_cache_behavior {
    path_pattern             = "/transcripts/*"
    target_origin_id         = "alb-origin"
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["GET", "HEAD", "OPTIONS"]
    cached_methods           = ["GET", "HEAD", "OPTIONS"]
    compress                 = true
    cache_policy_id          = aws_cloudfront_cache_policy.no_cache.id
    origin_request_policy_id = aws_cloudfront_origin_request_policy.api.id

    dynamic "function_association" {
      for_each = var.saas_mode ? [1] : []
      content {
        event_type   = "viewer-request"
        function_arn = aws_cloudfront_function.auth_redirect[0].arn
      }
    }
  }

  ordered_cache_behavior {
    path_pattern             = "/audio/*"
    target_origin_id         = "alb-origin"
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["GET", "HEAD", "OPTIONS"]
    cached_methods           = ["GET", "HEAD", "OPTIONS"]
    compress                 = true
    cache_policy_id          = aws_cloudfront_cache_policy.no_cache.id
    origin_request_policy_id = aws_cloudfront_origin_request_policy.api.id

    dynamic "function_association" {
      for_each = var.saas_mode ? [1] : []
      content {
        event_type   = "viewer-request"
        function_arn = aws_cloudfront_function.auth_redirect[0].arn
      }
    }
  }

  # /health is exempt from auth redirect — always passthrough
  ordered_cache_behavior {
    path_pattern             = "/health"
    target_origin_id         = "alb-origin"
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["GET", "HEAD", "OPTIONS"]
    cached_methods           = ["GET", "HEAD", "OPTIONS"]
    compress                 = true
    cache_policy_id          = aws_cloudfront_cache_policy.no_cache.id
    origin_request_policy_id = aws_cloudfront_origin_request_policy.api.id
  }

  viewer_certificate {
    cloudfront_default_certificate = local.use_custom_cert ? false : true
    acm_certificate_arn            = local.use_custom_cert ? var.acm_certificate_arn : null
    ssl_support_method             = local.use_custom_cert ? "sni-only" : null
    minimum_protocol_version       = local.use_custom_cert ? "TLSv1.2_2021" : null
  }

  logging_config {
    bucket          = aws_s3_bucket.cf_logs.bucket_regional_domain_name
    include_cookies = false
    prefix          = "cf-access/"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-cloudfront"
  })
}
