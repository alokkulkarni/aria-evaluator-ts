output "proxy_url" {
  description = "Proxy URL reachable from the Docker host (use this to test with curl)"
  value       = module.bedrock_proxy.proxy_url
}

output "proxy_url_docker" {
  description = <<-EOT
    Proxy URL reachable from other Docker containers via host.docker.internal.
    Set bedrock_proxy_url to this value in environments/local/terraform.tfvars
    before running `terraform apply` for the evaluator.
  EOT
  value       = module.bedrock_proxy.proxy_url_docker
}

output "container_name" {
  description = "Name of the running proxy Docker container"
  value       = module.bedrock_proxy.container_name
}

output "network_name" {
  description = "Name of the isolated Docker network for the proxy"
  value       = module.bedrock_proxy.network_name
}
