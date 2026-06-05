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
      "aria:resource_type" = "observability"
    },
  )
}

resource "aws_cloudwatch_log_group" "app" {
  name              = "/aria/${var.tenant_id}/app"
  retention_in_days = var.log_retention_days

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-app-logs"
  })
}

resource "aws_cloudwatch_log_group" "access" {
  name              = "/aria/${var.tenant_id}/access"
  retention_in_days = var.log_retention_days

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-access-logs"
  })
}

resource "aws_cloudwatch_log_group" "audit" {
  name              = "/aria/${var.tenant_id}/audit"
  retention_in_days = var.log_retention_days

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-audit-logs"
  })
}

resource "aws_sns_topic" "alerts" {
  name              = "aria-${var.tenant_id}-alerts"
  kms_master_key_id = var.kms_key_arn

  tags = merge(local.common_tags, {
    Name = "aria-${var.tenant_id}-alerts"
  })
}

data "aws_iam_policy_document" "alerts" {
  statement {
    sid    = "AllowCloudWatchPublish"
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["cloudwatch.amazonaws.com"]
    }

    actions   = ["sns:Publish"]
    resources = [aws_sns_topic.alerts.arn]
  }
}

resource "aws_sns_topic_policy" "alerts" {
  arn    = aws_sns_topic.alerts.arn
  policy = data.aws_iam_policy_document.alerts.json
}

resource "aws_sns_topic_subscription" "email" {
  count = var.alert_email != "" ? 1 : 0

  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

resource "aws_cloudwatch_log_metric_filter" "errors" {
  name           = "aria-${var.tenant_id}-error-count"
  log_group_name = aws_cloudwatch_log_group.app.name
  pattern        = "ERROR"

  metric_transformation {
    name      = "ErrorCount"
    namespace = "aria/${var.tenant_id}"
    value     = "1"
  }
}

resource "aws_cloudwatch_metric_alarm" "error_count" {
  alarm_name          = "aria-${var.tenant_id}-error-count"
  alarm_description   = "Triggers when application ERROR lines are detected"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  threshold           = 1
  period              = 300
  statistic           = "Sum"
  namespace           = "aria/${var.tenant_id}"
  metric_name         = "ErrorCount"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]

  tags = local.common_tags
}

resource "aws_cloudwatch_metric_alarm" "ecs_cpu_high" {
  alarm_name          = "aria-${var.tenant_id}-ecs-cpu-high"
  alarm_description   = "ECS CPU utilization exceeded 80%"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  threshold           = 80
  period              = 300
  statistic           = "Average"
  namespace           = "AWS/ECS"
  metric_name         = "CPUUtilization"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
  treat_missing_data  = "notBreaching"

  dimensions = {
    ClusterName = var.ecs_cluster_name
    ServiceName = var.ecs_service_name
  }

  tags = local.common_tags
}

resource "aws_cloudwatch_metric_alarm" "ecs_memory_high" {
  alarm_name          = "aria-${var.tenant_id}-ecs-memory-high"
  alarm_description   = "ECS memory utilization exceeded 85%"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  threshold           = 85
  period              = 300
  statistic           = "Average"
  namespace           = "AWS/ECS"
  metric_name         = "MemoryUtilization"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
  treat_missing_data  = "notBreaching"

  dimensions = {
    ClusterName = var.ecs_cluster_name
    ServiceName = var.ecs_service_name
  }

  tags = local.common_tags
}

resource "aws_cloudwatch_metric_alarm" "alb_5xx_rate" {
  alarm_name          = "aria-${var.tenant_id}-alb-5xx-rate"
  alarm_description   = "ALB target 5xx rate exceeded 5%"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  threshold           = 5
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]

  metric_query {
    id          = "errors"
    return_data = false

    metric {
      namespace   = "AWS/ApplicationELB"
      metric_name = "HTTPCode_Target_5XX_Count"
      period      = 120
      stat        = "Sum"
      dimensions = {
        LoadBalancer = var.alb_arn_suffix
      }
    }
  }

  metric_query {
    id          = "requests"
    return_data = false

    metric {
      namespace   = "AWS/ApplicationELB"
      metric_name = "RequestCount"
      period      = 120
      stat        = "Sum"
      dimensions = {
        LoadBalancer = var.alb_arn_suffix
      }
    }
  }

  metric_query {
    id          = "rate"
    expression  = "IF(requests > 0, (errors / requests) * 100, 0)"
    label       = "ALB Target 5xx Rate"
    return_data = true
  }

  tags = local.common_tags
}

resource "aws_cloudwatch_metric_alarm" "ecs_running_count_zero" {
  alarm_name          = "aria-${var.tenant_id}-ecs-running-count-zero"
  alarm_description   = "ECS running task count dropped to zero"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 2
  threshold           = 1
  period              = 300
  statistic           = "Average"
  namespace           = "ECS/ContainerInsights"
  metric_name         = "RunningTaskCount"
  treat_missing_data  = "breaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]

  dimensions = {
    ClusterName = var.ecs_cluster_name
    ServiceName = var.ecs_service_name
  }

  tags = local.common_tags
}

resource "aws_cloudwatch_dashboard" "this" {
  dashboard_name = "aria-${var.tenant_id}"
  dashboard_body = templatefile("${path.module}/templates/dashboard.json.tpl", {
    tenant_id      = var.tenant_id
    cluster_name   = var.ecs_cluster_name
    service_name   = var.ecs_service_name
    alb_arn_suffix = var.alb_arn_suffix
    region         = var.aws_region
  })
}

resource "aws_xray_group" "this" {
  count = var.xray_enabled ? 1 : 0

  group_name        = "aria-${var.tenant_id}"
  filter_expression = "service(\"${var.tenant_id}-aria\")"

  tags = merge(local.common_tags, {
    Name = "aria-${var.tenant_id}-xray"
  })
}

resource "aws_xray_sampling_rule" "this" {
  count = var.xray_enabled ? 1 : 0

  rule_name      = "aria-${var.tenant_id}"
  priority       = 1000
  version        = 1
  reservoir_size = 1
  fixed_rate     = var.xray_sampling_rate
  service_type   = "*"
  service_name   = "${var.tenant_id}-*"
  resource_arn   = "*"
  host           = "*"
  http_method    = "*"
  url_path       = "*"
}
