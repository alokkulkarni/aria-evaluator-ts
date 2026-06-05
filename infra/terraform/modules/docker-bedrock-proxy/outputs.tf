output "proxy_url" {
  description = "Base URL of the Bedrock proxy reachable from the Docker host"
  value       = "http://localhost:${var.host_port}"
}

output "proxy_url_docker" {
  description = <<-EOT
    Base URL of the Bedrock proxy reachable from other Docker containers using
    host.docker.internal (works on macOS/Windows Docker Desktop and Linux when
    the proxy module adds host.docker.internal via extra_hosts).
  EOT
  value       = "http://host.docker.internal:${var.host_port}"
}

output "container_name" {
  description = "Name of the running proxy Docker container"
  value       = docker_container.proxy.name
}

output "network_name" {
  description = "Name of the isolated Docker network created for the proxy"
  value       = docker_network.proxy.name
}
