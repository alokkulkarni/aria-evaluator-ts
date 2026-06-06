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
  extra_environment_vars = [
    { name = "ARIA_DEPLOY_ENV", value = "local" },
    { name = "CONTROL_PLANE_ENABLE_LOCAL_SEED", value = "true" },
    { name = "CONTROL_PLANE_LOCAL_TEST_EMAIL", value = "local.tester@aria.local" },
    { name = "CONTROL_PLANE_LOCAL_TEST_PASSWORD", value = "AriaLocal123!" },
    { name = "CONTROL_PLANE_LOCAL_TEST_NAME", value = "Local Test User" },
    { name = "CONTROL_PLANE_LOCAL_TEST_TENANT_ID", value = "local-demo-tenant" },
    { name = "CONTROL_PLANE_INSTANCE_BASE_URL", value = "http://localhost:3001" },
  ]
}
