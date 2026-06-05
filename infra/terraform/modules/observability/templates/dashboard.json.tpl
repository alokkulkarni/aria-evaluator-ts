{
  "widgets": [
    {
      "type": "metric",
      "x": 0,
      "y": 0,
      "width": 12,
      "height": 6,
      "properties": {
        "title": "${tenant_id} ECS CPU Utilization",
        "view": "timeSeries",
        "region": "${region}",
        "stat": "Average",
        "period": 300,
        "metrics": [
          [ "AWS/ECS", "CPUUtilization", "ClusterName", "${cluster_name}", "ServiceName", "${service_name}" ]
        ]
      }
    },
    {
      "type": "metric",
      "x": 12,
      "y": 0,
      "width": 12,
      "height": 6,
      "properties": {
        "title": "${tenant_id} ECS Memory Utilization",
        "view": "timeSeries",
        "region": "${region}",
        "stat": "Average",
        "period": 300,
        "metrics": [
          [ "AWS/ECS", "MemoryUtilization", "ClusterName", "${cluster_name}", "ServiceName", "${service_name}" ]
        ]
      }
    },
    {
      "type": "metric",
      "x": 0,
      "y": 6,
      "width": 6,
      "height": 6,
      "properties": {
        "title": "${tenant_id} Running Tasks",
        "view": "singleValue",
        "region": "${region}",
        "stat": "Average",
        "period": 300,
        "metrics": [
          [ "ECS/ContainerInsights", "RunningTaskCount", "ClusterName", "${cluster_name}", "ServiceName", "${service_name}" ]
        ]
      }
    },
    {
      "type": "metric",
      "x": 6,
      "y": 6,
      "width": 9,
      "height": 6,
      "properties": {
        "title": "${tenant_id} ALB Request Count",
        "view": "timeSeries",
        "region": "${region}",
        "stat": "Sum",
        "period": 300,
        "metrics": [
          [ "AWS/ApplicationELB", "RequestCount", "LoadBalancer", "${alb_arn_suffix}" ]
        ]
      }
    },
    {
      "type": "metric",
      "x": 15,
      "y": 6,
      "width": 9,
      "height": 6,
      "properties": {
        "title": "${tenant_id} ALB 5xx Count",
        "view": "timeSeries",
        "region": "${region}",
        "stat": "Sum",
        "period": 300,
        "metrics": [
          [ "AWS/ApplicationELB", "HTTPCode_Target_5XX_Count", "LoadBalancer", "${alb_arn_suffix}" ]
        ]
      }
    },
    {
      "type": "metric",
      "x": 0,
      "y": 12,
      "width": 12,
      "height": 6,
      "properties": {
        "title": "${tenant_id} ALB Target Response Time",
        "view": "timeSeries",
        "region": "${region}",
        "stat": "Average",
        "period": 300,
        "metrics": [
          [ "AWS/ApplicationELB", "TargetResponseTime", "LoadBalancer", "${alb_arn_suffix}" ]
        ]
      }
    },
    {
      "type": "log",
      "x": 12,
      "y": 12,
      "width": 12,
      "height": 6,
      "properties": {
        "title": "${tenant_id} Recent ERROR Lines",
        "region": "${region}",
        "query": "SOURCE '/aria/${tenant_id}/app' | fields @timestamp, @message | filter @message like /ERROR/ | sort @timestamp desc | limit 20",
        "view": "table"
      }
    }
  ]
}
