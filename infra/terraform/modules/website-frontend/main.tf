# ── Website Frontend Module ────────────────────────────────────────────────────
#
# Deploys the ARIA Evaluator static website to S3 + CloudFront with:
#   - Private S3 bucket (OAC, not public website hosting)
#   - CloudFront distribution with dual origins:
#       Default (*) → S3 (static pages)
#       /api/*      → ALB (auth backend, provided via variable)
#   - Optional custom domain (Route53 + ACM)
#   - CloudFront Function to block *.cloudfront.net direct access
#   - WAF Web ACL (rate limiting + AWS managed rules)
#   - Custom error responses for SPA client-side routing

data "aws_caller_identity" "current" {}

locals {
  name_prefix = "${var.app_name}-frontend-${var.environment}"
  cf_aliases  = var.domain_name != "" ? [var.domain_name, "www.${var.domain_name}"] : []
  app_url     = var.domain_name != "" ? "https://${var.domain_name}" : "http://localhost:3000"

  common_tags = merge(var.tags, {
    ManagedBy            = "terraform"
    Project              = "aria-evaluator"
    Environment          = var.environment
    Component            = "website-frontend"
    "aria:resource_type" = "website-frontend"
  })
}

# ── S3 Bucket (private, OAC-only access) ──────────────────────────────────────

resource "aws_s3_bucket" "static" {
  bucket = "${local.name_prefix}-static"
  tags   = merge(local.common_tags, { Name = "${local.name_prefix}-static" })
}

resource "aws_s3_bucket_versioning" "static" {
  bucket = aws_s3_bucket.static.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "static" {
  bucket = aws_s3_bucket.static.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
  }
}

resource "aws_s3_bucket_public_access_block" "static" {
  bucket                  = aws_s3_bucket.static.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ── CloudFront OAC ────────────────────────────────────────────────────────────

resource "aws_cloudfront_origin_access_control" "static" {
  name                              = "${local.name_prefix}-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# S3 bucket policy — allow OAC only
resource "aws_s3_bucket_policy" "static" {
  bucket = aws_s3_bucket.static.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "AllowCloudFrontOAC"
      Effect    = "Allow"
      Principal = { Service = "cloudfront.amazonaws.com" }
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.static.arn}/*"
      Condition = {
        StringEquals = {
          "AWS:SourceArn" = aws_cloudfront_distribution.main.arn
        }
      }
    }]
  })
}

# ── CloudFront Function (block direct *.cloudfront.net access) ─────────────────

resource "aws_cloudfront_function" "domain_redirect" {
  count   = var.domain_name != "" ? 1 : 0
  name    = "${replace(local.name_prefix, "-", "_")}_domain_redirect"
  runtime = "cloudfront-js-2.0"
  comment = "Redirect *.cloudfront.net to custom domain"

  code = <<-JS
    function handler(event) {
      var host = event.request.headers.host ? event.request.headers.host.value : '';
      if (host.endsWith('.cloudfront.net')) {
        return {
          statusCode: 301,
          statusDescription: 'Moved Permanently',
          headers: {
            location: { value: 'https://${var.domain_name}' + event.request.uri }
          }
        };
      }
      return event.request;
    }
  JS
}

# ── WAF Web ACL ────────────────────────────────────────────────────────────────

resource "aws_wafv2_web_acl" "frontend" {
  name        = "${local.name_prefix}-waf"
  scope       = "CLOUDFRONT"
  description = "WAF for ARIA website frontend"

  default_action {
    allow {}
  }

  rule {
    name     = "rate-limit"
    priority = 1
    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit              = var.waf_rate_limit
        aggregate_key_type = "IP"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.name_prefix}-rate"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "aws-managed-common"
    priority = 2
    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.name_prefix}-common"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${local.name_prefix}-waf"
    sampled_requests_enabled   = true
  }

  tags = local.common_tags
}

# ── CloudFront Distribution ───────────────────────────────────────────────────

resource "aws_cloudfront_distribution" "main" {
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  comment             = "ARIA Evaluator ${var.environment} frontend"
  aliases             = local.cf_aliases
  web_acl_id          = aws_wafv2_web_acl.frontend.arn

  # ── Origin 1: S3 (static pages) ──
  origin {
    domain_name              = aws_s3_bucket.static.bucket_regional_domain_name
    origin_id                = "s3-static"
    origin_access_control_id = aws_cloudfront_origin_access_control.static.id
  }

  # ── Origin 2: ALB (auth backend API) ──
  dynamic "origin" {
    for_each = var.auth_backend_alb_dns != "" ? [1] : []
    content {
      domain_name = var.auth_backend_alb_dns
      origin_id   = "alb-auth"

      custom_origin_config {
        http_port              = 80
        https_port             = 443
        origin_protocol_policy = var.auth_backend_alb_https ? "https-only" : "http-only"
        origin_ssl_protocols   = ["TLSv1.2"]
      }

      custom_header {
        name  = "X-CF-Origin-Secret"
        value = var.auth_backend_origin_secret
      }
    }
  }

  # ── Default behavior: S3 static ──
  default_cache_behavior {
    target_origin_id           = "s3-static"
    viewer_protocol_policy     = "redirect-to-https"
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security.id
    allowed_methods            = ["GET", "HEAD", "OPTIONS"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    min_ttl     = 0
    default_ttl = 86400
    max_ttl     = 31536000

    dynamic "function_association" {
      for_each = var.domain_name != "" ? [1] : []
      content {
        event_type   = "viewer-request"
        function_arn = aws_cloudfront_function.domain_redirect[0].arn
      }
    }
  }

  # ── /api/* behavior: ALB auth backend (no caching) ──
  dynamic "ordered_cache_behavior" {
    for_each = var.auth_backend_alb_dns != "" ? [1] : []
    content {
      path_pattern           = "/api/*"
      target_origin_id       = "alb-auth"
      viewer_protocol_policy = "redirect-to-https"
      allowed_methods        = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
      cached_methods         = ["GET", "HEAD"]
      compress               = true

      forwarded_values {
        query_string = true
        headers      = ["Authorization", "Content-Type", "Origin", "Referer", "Host"]
        cookies {
          forward = "all"
        }
      }

      min_ttl     = 0
      default_ttl = 0
      max_ttl     = 0
    }
  }

  # ── _next/static/* behavior: long cache ──
  ordered_cache_behavior {
    path_pattern           = "/_next/static/*"
    target_origin_id       = "s3-static"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    min_ttl     = 31536000
    default_ttl = 31536000
    max_ttl     = 31536000
  }

  # ── SPA fallback: serve index.html for client-side routes ──
  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 10
  }

  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 10
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  dynamic "viewer_certificate" {
    for_each = var.acm_certificate_arn_cloudfront != "" ? [1] : []
    content {
      acm_certificate_arn      = var.acm_certificate_arn_cloudfront
      ssl_support_method       = "sni-only"
      minimum_protocol_version = "TLSv1.2_2021"
    }
  }

  dynamic "viewer_certificate" {
    for_each = var.acm_certificate_arn_cloudfront == "" ? [1] : []
    content {
      cloudfront_default_certificate = true
    }
  }

  tags = local.common_tags
}

# ── CloudFront Security Response Headers Policy ──────────────────────────────

resource "aws_cloudfront_response_headers_policy" "security" {
  name    = "${local.name_prefix}-security-headers"
  comment = "GDPR/SOC2 security headers for ${var.environment}"

  security_headers_config {
    content_type_options {
      override = true
    }
    frame_options {
      frame_option = "DENY"
      override     = true
    }
    referrer_policy {
      referrer_policy = "strict-origin-when-cross-origin"
      override        = true
    }
    strict_transport_security {
      access_control_max_age_sec = 63072000
      include_subdomains         = true
      preload                    = true
      override                   = true
    }
    xss_protection {
      mode_block = true
      protection = true
      override   = true
    }
    content_security_policy {
      content_security_policy = join("; ", [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com",
        "img-src 'self' data: https:",
        "connect-src 'self' https://accounts.google.com https://github.com",
        "frame-src https://accounts.google.com",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self' https://accounts.google.com https://github.com",
      ])
      override = true
    }
  }

  custom_headers_config {
    items {
      header   = "Permissions-Policy"
      value    = "camera=(), microphone=(), geolocation=(), payment=()"
      override = true
    }
  }
}

resource "aws_route53_record" "apex" {
  count   = var.domain_name != "" && var.route53_zone_id != "" ? 1 : 0
  zone_id = var.route53_zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.main.domain_name
    zone_id                = aws_cloudfront_distribution.main.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "www" {
  count   = var.domain_name != "" && var.route53_zone_id != "" ? 1 : 0
  zone_id = var.route53_zone_id
  name    = "www.${var.domain_name}"
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.main.domain_name
    zone_id                = aws_cloudfront_distribution.main.hosted_zone_id
    evaluate_target_health = false
  }
}
