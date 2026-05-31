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
  description = "Bedrock proxy URL passed through from var.bedrock_proxy_url (empty string when not configured)"
  value       = var.bedrock_proxy_url
}
