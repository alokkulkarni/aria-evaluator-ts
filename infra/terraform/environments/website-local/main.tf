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

  extra_environment_vars = var.extra_environment_vars
}
