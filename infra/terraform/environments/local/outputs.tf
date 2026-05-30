output "app_url" {
  description = "URL where aria-evaluator is accessible"
  value       = module.docker_local.app_url
}

output "container_name" {
  description = "Docker container name for the application"
  value       = module.docker_local.container_name
}

output "state_volume_name" {
  description = "Docker volume holding the persistent application state"
  value       = module.docker_local.state_volume_name
}

output "network_name" {
  description = "Docker bridge network name"
  value       = module.docker_local.network_name
}

output "bedrock_proxy_url" {
  description = "Local Bedrock proxy URL (null when bedrock_proxy_enabled = false)"
  value       = module.docker_local.bedrock_proxy_url
}
