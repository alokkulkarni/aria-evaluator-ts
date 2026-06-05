locals {
  name_prefix = "${var.app_name}-${var.environment}-${var.tenant_id}"
  common_tags = merge(
    var.tags,
    {
      ManagedBy            = "terraform"
      Project              = "aria-evaluator"
      Environment          = var.environment
      AppName              = var.app_name
      "aria:tenant_id"     = var.tenant_id
      "aria:pricing_tier"  = var.pricing_tier
      "aria:resource_type" = "security"
    },
  )
}

resource "aws_cloudwatch_log_group" "this" {
  provider = aws.us_east_1

  name              = "/aws/wafv2/aria-${var.tenant_id}"
  retention_in_days = var.log_retention_days

  tags = merge(local.common_tags, {
    Name = "aria-${var.tenant_id}-waf-logs"
  })
}

resource "aws_wafv2_web_acl" "this" {
  provider = aws.us_east_1

  name  = "aria-${var.tenant_id}"
  scope = "CLOUDFRONT"

  default_action {
    allow {}
  }

  rule {
    name     = "AWSManagedRulesCommonRuleSet"
    priority = 1

    override_action {
      count {}
    }

    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesCommonRuleSet"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.tenant_id}-common-rule-set"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "AWSManagedRulesKnownBadInputsRuleSet"
    priority = 2

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesKnownBadInputsRuleSet"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.tenant_id}-known-bad-inputs"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "RateLimitPerIp"
    priority = 3

    action {
      block {}
    }

    statement {
      rate_based_statement {
        aggregate_key_type = "IP"
        limit              = var.rate_limit_requests
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.tenant_id}-rate-limit"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${var.tenant_id}-web-acl"
    sampled_requests_enabled   = true
  }

  tags = merge(local.common_tags, {
    Name = "aria-${var.tenant_id}-waf"
  })
}

resource "aws_wafv2_web_acl_logging_configuration" "this" {
  provider = aws.us_east_1

  log_destination_configs = [aws_cloudwatch_log_group.this.arn]
  resource_arn            = aws_wafv2_web_acl.this.arn
}
