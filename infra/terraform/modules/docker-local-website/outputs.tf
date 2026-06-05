output "app_url" {
  description = "URL where the website is accessible locally"
  value       = "http://localhost:${var.host_port}"
}

output "container_name" {
  description = "Docker container name for the website"
  value       = docker_container.app.name
}

output "network_name" {
  description = "Docker bridge network name"
  value       = docker_network.app.name
}

output "image_name" {
  description = "Docker image name:tag that was built and deployed"
  value       = var.app_image_name
}

output "taint_command" {
  description = "Command to force a full image rebuild after source-code changes"
  value       = "terraform taint 'module.docker_local_website.null_resource.build_app_image' && terraform apply"
}
