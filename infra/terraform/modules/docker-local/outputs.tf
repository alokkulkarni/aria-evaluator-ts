output "app_url" {
  description = "URL where the aria-evaluator application is accessible"
  value       = "http://localhost:${var.host_port}"
}

output "container_name" {
  description = "Docker container name for the application"
  value       = docker_container.app.name
}

output "state_volume_name" {
  description = "Named Docker volume used for persistent application state (database, reports, scenarios)"
  value       = docker_volume.state.name
}

output "network_name" {
  description = "Docker bridge network name"
  value       = docker_network.app.name
}

output "bedrock_proxy_url" {
  description = "URL for the optional local Bedrock proxy (null when bedrock_proxy_enabled = false)"
  value       = var.bedrock_proxy_enabled ? "http://localhost:${var.bedrock_proxy_host_port}" : null
}

output "bedrock_proxy_container_name" {
  description = "Docker container name for the optional local Bedrock proxy"
  value       = var.bedrock_proxy_enabled ? docker_container.bedrock_proxy[0].name : null
}
