output "app_url" {
  description = "URL where the website is accessible"
  value       = module.docker_local_website.app_url
}

output "container_name" {
  description = "Docker container name"
  value       = module.docker_local_website.container_name
}

output "network_name" {
  description = "Docker network name"
  value       = module.docker_local_website.network_name
}

output "taint_command" {
  description = "Run this to force a full image rebuild after changing source code"
  value       = module.docker_local_website.taint_command
}
