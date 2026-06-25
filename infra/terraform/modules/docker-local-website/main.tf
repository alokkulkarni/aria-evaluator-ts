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

  # ── Environment list in "KEY=VALUE" format for docker_container.env ───────
  # Static site — no auth. Only the public app config plus optional extras.
  base_env = [
    { name = "NODE_ENV", value = "production" },
    { name = "ARIA_DEPLOY_ENV", value = var.environment },
    { name = "PORT", value = tostring(var.container_port) },
    { name = "HOSTNAME", value = "0.0.0.0" },
    { name = "NEXT_PUBLIC_APP_URL", value = "http://localhost:${var.host_port}" },
    { name = "NEXT_PUBLIC_APP_NAME", value = "ARIA Evaluator" },
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
    # Rebuild whenever the website source changes (middleware, pages, lib, …) so
    # `terraform apply` / `npm run local:up` reflect code edits, not just Dockerfile bumps.
    source_sha = sha1(join("", [
      for f in fileset(local.effective_build_context, "src/**") : filesha1("${local.effective_build_context}/${f}")
    ]))
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
      "CMD", "node", "-e",
      "require('http').get('http://localhost:${var.container_port}/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
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
