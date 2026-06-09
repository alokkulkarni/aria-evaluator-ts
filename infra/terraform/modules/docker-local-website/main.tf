locals {
  name_prefix = "${var.app_name}-${var.environment}"

  # ── Resolve build context ──────────────────────────────────────────────────
  # The website source lives at <repo root>/website/.
  # This module is at modules/docker-local-website/ which is four levels below
  # the repo root:
  #   modules/docker-local-website/ → modules/ → terraform/ → infra/ → repo root
  #
  # Build context = repo root / website/
  repo_root = abspath("${path.module}/../../../..")

  effective_build_context = (
    var.website_dir != ""
    ? var.website_dir
    : "${local.repo_root}/website"
  )

  effective_control_plane_url = (
    var.environment == "local"
    ? replace(
      replace(var.control_plane_url, "localhost", "host.docker.internal"),
      "127.0.0.1",
      "host.docker.internal",
    )
    : var.control_plane_url
  )

  # ── Environment list in "KEY=VALUE" format for docker_container.env ───────
  # Build from the typed list — NextAuth, OAuth secrets and optional extras.
  base_env = [
    { name = "NODE_ENV", value = "production" },
    { name = "ARIA_DEPLOY_ENV", value = var.environment },
    { name = "PORT", value = tostring(var.container_port) },
    { name = "HOSTNAME", value = "0.0.0.0" },
    { name = "NEXTAUTH_URL", value = var.nextauth_url },
    { name = "NEXT_PUBLIC_APP_URL", value = var.nextauth_url },
    { name = "NEXT_PUBLIC_APP_NAME", value = "ARIA Evaluator" },
    { name = "NEXT_PUBLIC_CONTROL_PLANE_URL", value = "/api/control-plane" },
    { name = "CONTROL_PLANE_INTERNAL_URL", value = local.effective_control_plane_url },
    { name = "NEXTAUTH_SECRET", value = var.nextauth_secret },
    { name = "GOOGLE_CLIENT_ID", value = var.google_client_id },
    { name = "GOOGLE_CLIENT_SECRET", value = var.google_client_secret },
    { name = "GITHUB_CLIENT_ID", value = var.github_client_id },
    { name = "GITHUB_CLIENT_SECRET", value = var.github_client_secret },
  ]

  all_env  = concat(local.base_env, var.extra_environment_vars)
  env_list = [for e in local.all_env : "${e.name}=${e.value}"]
}

# ── Bridge network ─────────────────────────────────────────────────────────────

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

# ── Application image ──────────────────────────────────────────────────────────
# Always builds locally via docker CLI using DOCKER_BUILDKIT=1.
# The kreuzwerker provider's built-in build block has known compatibility issues
# with tar-based build contexts; shelling out to docker CLI is more reliable and
# supports BuildKit cache mounts defined in Dockerfile.local.
#
# Auto-rebuild triggers:
#   • Dockerfile content changes    → auto-triggers on next `terraform apply`
#   • package-lock.json changes     → auto-triggers on next `terraform apply`
#   • Source code changes only      → taint manually, then apply:
#       terraform taint 'module.docker_local_website.null_resource.build_app_image'
#       terraform apply

resource "null_resource" "build_app_image" {
  triggers = {
    dockerfile_sha   = filesha1("${local.effective_build_context}/${var.app_dockerfile}")
    package_lock_sha = filesha1("${local.effective_build_context}/package-lock.json")
    # Increment this manually (or via -var) to force a rebuild of unchanged source:
    #   terraform apply -var='force_rebuild=2'
    force_rebuild = var.force_rebuild
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

# ── Application container ──────────────────────────────────────────────────────

resource "docker_container" "app" {
  name  = local.name_prefix
  image = data.docker_image.app.id

  # Restart automatically on crash / Docker daemon restart
  restart = "unless-stopped"

  networks_advanced {
    name = docker_network.app.name
  }

  ports {
    internal = var.container_port
    external = var.host_port
    protocol = "tcp"
  }

  env = local.env_list

  healthcheck {
    test = [
      "CMD-SHELL",
      "wget -qO- http://localhost:${var.container_port}/api/health || exit 1"
    ]
    interval     = "30s"
    timeout      = "10s"
    start_period = "60s"
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
    value = "main-website"
  }
}

# ── Auth Backend (split architecture) ──────────────────────────────────────────
# Optional: set var.enable_auth_backend = true to run the auth backend as a
# separate container alongside the main website. This mirrors the prod
# architecture where static pages are served from S3/CloudFront and API routes
# are handled by a dedicated ECS service.

resource "null_resource" "build_auth_image" {
  count = var.enable_auth_backend ? 1 : 0

  triggers = {
    dockerfile_sha   = filesha1("${local.effective_build_context}/auth-backend/Dockerfile")
    package_lock_sha = filesha1("${local.effective_build_context}/auth-backend/package-lock.json")
    force_rebuild    = var.force_rebuild
  }

  provisioner "local-exec" {
    environment = {
      DOCKER_BUILDKIT = "1"
    }

    command = <<-EOT
      docker build \
        --tag "${var.app_name}-auth-backend" \
        --file "${local.effective_build_context}/auth-backend/Dockerfile" \
        "${local.effective_build_context}/auth-backend"
    EOT
  }
}

resource "docker_container" "auth_backend" {
  count = var.enable_auth_backend ? 1 : 0
  name  = "${local.name_prefix}-auth"
  image = "${var.app_name}-auth-backend"

  restart = "unless-stopped"

  networks_advanced {
    name = docker_network.app.name
  }

  ports {
    internal = 3001
    external = var.auth_backend_host_port
    protocol = "tcp"
  }

  env = [
    "NODE_ENV=production",
    "ARIA_DEPLOY_ENV=${var.environment}",
    "PORT=3001",
    "HOSTNAME=0.0.0.0",
    "NEXTAUTH_URL=${var.nextauth_url}",
    "CONTROL_PLANE_INTERNAL_URL=${local.effective_control_plane_url}",
    "NEXTAUTH_SECRET=${var.nextauth_secret}",
    "GOOGLE_CLIENT_ID=${var.google_client_id}",
    "GOOGLE_CLIENT_SECRET=${var.google_client_secret}",
    "GITHUB_CLIENT_ID=${var.github_client_id}",
    "GITHUB_CLIENT_SECRET=${var.github_client_secret}",
  ]

  healthcheck {
    test         = ["CMD-SHELL", "wget -qO- http://localhost:3001/api/health || exit 1"]
    interval     = "30s"
    timeout      = "10s"
    start_period = "60s"
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
    value = "auth-backend"
  }

  depends_on = [null_resource.build_auth_image]
}
