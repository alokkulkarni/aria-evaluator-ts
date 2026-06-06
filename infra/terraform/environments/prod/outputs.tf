output "vpc_id" {
  value = module.tenant.vpc_id
}

output "alb_dns_name" {
  value = module.tenant.alb_dns_name
}

output "cloudfront_domain_name" {
  value = module.tenant.cloudfront_domain_name
}

output "ecs_cluster_name" {
  value = module.tenant.ecs_cluster_name
}

output "ecs_service_name" {
  value = module.tenant.ecs_service_name
}

output "s3_bucket_name" {
  value = module.tenant.s3_bucket_name
}

output "resume_lambda_arn" {
  value = module.tenant.resume_lambda_arn
}

output "log_group_name" {
  value = module.tenant.log_group_name
}

output "dashboard_name" {
  value = module.tenant.dashboard_name
}

output "sns_topic_arn" {
  value = module.tenant.sns_topic_arn
}

output "cf_origin_secret_arn" {
  value = module.tenant.cf_origin_secret_arn
}
