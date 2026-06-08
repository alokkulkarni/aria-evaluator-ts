module "docker_local_website" {
  source = "../../modules/docker-local-website"

  app_name    = var.app_name
  environment = var.environment

  app_image_name = var.app_image_name
  app_dockerfile = var.app_dockerfile
  website_dir    = var.website_dir
  force_rebuild  = var.force_rebuild

  host_port      = var.host_port
  container_port = var.container_port

  nextauth_url    = "http://localhost:${var.host_port}"
  nextauth_secret = var.nextauth_secret

  google_client_id     = var.google_client_id
  google_client_secret = var.google_client_secret
  github_client_id     = var.github_client_id
  github_client_secret = var.github_client_secret

  control_plane_url = var.control_plane_url

  # Enable the split auth backend container
  enable_auth_backend    = var.enable_auth_backend
  auth_backend_host_port = var.auth_backend_host_port

  extra_environment_vars = var.extra_environment_vars
}
