locals {
  name_prefix = "${var.app_name}-${var.environment}"

  common_tags = merge(
    {
      AppName     = var.app_name
      Environment = var.environment
      ManagedBy   = "terraform"
    },
    var.tags,
  )

  use_custom_cert = var.acm_certificate_arn != ""
}

# ── Cache Policy: Static Assets ────────────────────────────────────────────────
# Used for the default behaviour (React SPA assets, fonts, images).

resource "aws_cloudfront_cache_policy" "static" {
  name        = "${local.name_prefix}-static"
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

# ── Cache Policy: No Cache ─────────────────────────────────────────────────────
# Used for API, reports, transcripts, audio, and health paths.

resource "aws_cloudfront_cache_policy" "no_cache" {
  name        = "${local.name_prefix}-no-cache"
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

# ── Origin Request Policy: API ─────────────────────────────────────────────────
# Forwards all viewer context to the ALB origin for dynamic paths.

resource "aws_cloudfront_origin_request_policy" "api" {
  name    = "${local.name_prefix}-api-origin"
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

# ── CloudFront Distribution ────────────────────────────────────────────────────

resource "aws_cloudfront_distribution" "main" {
  enabled             = true
  http_version        = "http2"
  price_class         = var.price_class
  default_root_object = var.default_root_object
  aliases             = var.aliases
  comment             = "${local.name_prefix} distribution"

  origin {
    origin_id   = "alb-origin"
    domain_name = var.alb_dns_name

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  # ── Default behaviour: React SPA (static assets) ──────────────────────────
  default_cache_behavior {
    target_origin_id       = "alb-origin"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD", "OPTIONS"]
    compress               = true
    cache_policy_id        = aws_cloudfront_cache_policy.static.id
  }

  # ── /api/* — Express REST + SSE ───────────────────────────────────────────
  ordered_cache_behavior {
    path_pattern           = "/api/*"
    target_origin_id       = "alb-origin"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS", "PUT", "PATCH", "POST", "DELETE"]
    cached_methods         = ["GET", "HEAD", "OPTIONS"]
    compress               = true
    cache_policy_id        = aws_cloudfront_cache_policy.no_cache.id
    origin_request_policy_id = aws_cloudfront_origin_request_policy.api.id
  }

  # ── /reports/* — HTML/JSON evaluation reports ─────────────────────────────
  ordered_cache_behavior {
    path_pattern           = "/reports/*"
    target_origin_id       = "alb-origin"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD", "OPTIONS"]
    compress               = true
    cache_policy_id        = aws_cloudfront_cache_policy.no_cache.id
    origin_request_policy_id = aws_cloudfront_origin_request_policy.api.id
  }

  # ── /transcripts/* — conversation transcript JSON files ──────────────────
  ordered_cache_behavior {
    path_pattern           = "/transcripts/*"
    target_origin_id       = "alb-origin"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD", "OPTIONS"]
    compress               = true
    cache_policy_id        = aws_cloudfront_cache_policy.no_cache.id
    origin_request_policy_id = aws_cloudfront_origin_request_policy.api.id
  }

  # ── /audio/* — voice call WAV recordings ─────────────────────────────────
  ordered_cache_behavior {
    path_pattern           = "/audio/*"
    target_origin_id       = "alb-origin"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD", "OPTIONS"]
    compress               = true
    cache_policy_id        = aws_cloudfront_cache_policy.no_cache.id
    origin_request_policy_id = aws_cloudfront_origin_request_policy.api.id
  }

  # ── /health — ALB health check passthrough ────────────────────────────────
  ordered_cache_behavior {
    path_pattern           = "/health"
    target_origin_id       = "alb-origin"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD", "OPTIONS"]
    compress               = true
    cache_policy_id        = aws_cloudfront_cache_policy.no_cache.id
    origin_request_policy_id = aws_cloudfront_origin_request_policy.api.id
  }

  # ── TLS certificate ───────────────────────────────────────────────────────
  viewer_certificate {
    cloudfront_default_certificate = local.use_custom_cert ? false : true
    acm_certificate_arn            = local.use_custom_cert ? var.acm_certificate_arn : null
    ssl_support_method             = local.use_custom_cert ? "sni-only" : null
    minimum_protocol_version       = local.use_custom_cert ? "TLSv1.2_2021" : null
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  tags = local.common_tags
}
