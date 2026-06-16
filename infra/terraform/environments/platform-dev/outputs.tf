output "alb_dns_name" {
  description = "Shared ALB DNS name — point the wildcard *.<domain> CNAME/alias here."
  value       = module.platform.alb_dns_name
}

output "database_url_secret_arn" {
  description = "Shared Aurora DATABASE_URL secret ARN."
  value       = module.platform.database_url_secret_arn
}

output "tenant_hosts" {
  description = "Per-tenant hostnames."
  value       = { for k, m in module.tenant_service : k => m.host }
}

output "tenant_services" {
  description = "Per-tenant ECS service names (control-plane wakes these)."
  value       = { for k, m in module.tenant_service : k => m.service_name }
}
