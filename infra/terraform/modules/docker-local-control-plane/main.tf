locals {
  name_prefix = "${var.app_name}-${var.environment}"

  repo_root = abspath("${path.module}/../../../..")

  effective_build_context = (
    var.app_dockerfile_context != ""
    ? var.app_dockerfile_context
    : local.repo_root
  )

  base_env = [
    { name = "NODE_ENV", value = "production" },
    { name = "PORT", value = tostring(var.container_port) },
    { name = "CONTROL_PLANE_PORT", value = tostring(var.container_port) },
    { name = "CONTROL_PLANE_STATE_DIR", value = "/app/state/control-plane" },
  ]

  all_env  = concat(local.base_env, var.extra_environment_vars)
  env_list = [for e in local.all_env : "${e.name}=${e.value}"]
}

resource "docker_network" "app" {
  name = "${local.name_prefix}-network"

  labels {
    label = "managed-by"
    value = "terraform"
  }

  labels {
    label = "environment"
    value = var.environment
  }
}

resource "docker_volume" "state" {
  name = "${local.name_prefix}-state"

  labels {
    label = "managed-by"
    value = "terraform"
  }
}

resource "null_resource" "build_app_image" {
  triggers = {
    dockerfile_sha   = filesha1("${local.effective_build_context}/${var.app_dockerfile}")
    package_lock_sha = filesha1("${local.effective_build_context}/package-lock.json")
    force_rebuild    = var.force_rebuild
  }

  provisioner "local-exec" {
    environment = {
      DOCKER_BUILDKIT = "1"
    }

    command = <<-EOT
      docker build \
        --tag "${var.app_image_name}" \
        --file "${local.effective_build_context}/${var.app_dockerfile}" \
        "${local.effective_build_context}"
    EOT
  }
}

data "docker_image" "app" {
  name       = var.app_image_name
  depends_on = [null_resource.build_app_image]
}

resource "docker_container" "app" {
  name  = local.name_prefix
  image = data.docker_image.app.id

  restart = "unless-stopped"

  networks_advanced {
    name = docker_network.app.name
  }

  ports {
    internal = var.container_port
    external = var.host_port
    protocol = "tcp"
  }

  volumes {
    volume_name    = docker_volume.state.name
    container_path = "/app/state"
  }

  env = local.env_list

  healthcheck {
    test = [
      "CMD-SHELL",
      "wget -qO- http://localhost:${var.container_port}/health || exit 1"
    ]
    interval     = "30s"
    timeout      = "10s"
    start_period = "30s"
    retries      = 3
  }

  labels {
    label = "managed-by"
    value = "terraform"
  }

  labels {
    label = "environment"
    value = var.environment
  }

  labels {
    label = "component"
    value = "control-plane"
  }
}
