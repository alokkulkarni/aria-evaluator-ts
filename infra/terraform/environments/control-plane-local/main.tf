module "docker_local_control_plane" {
  source = "../../modules/docker-local-control-plane"

  app_name    = var.app_name
  environment = var.environment

  app_image_name         = var.app_image_name
  app_dockerfile         = var.app_dockerfile
  app_dockerfile_context = var.app_dockerfile_context

  container_port = var.container_port
  host_port      = var.host_port
  force_rebuild  = var.force_rebuild
}
