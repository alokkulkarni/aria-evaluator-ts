locals {
  name_prefix = "${var.app_name}-${var.environment}"

  # ── Resolve build context ──────────────────────────────────────────────────
  # The Dockerfile lives at the repo root, which is four levels above this
  # module directory:
  #   modules/docker-local/  →  modules/  →  terraform/  →  infra/  →  repo root
  #
  # When the caller explicitly sets app_dockerfile_context we use that value.
  # Otherwise we derive the repo root automatically so `terraform apply` always
  # builds the image locally instead of trying to pull from Docker Hub.
  repo_root = abspath("${path.module}/../../../..")

  effective_build_context = (
    var.app_dockerfile_context != ""
    ? var.app_dockerfile_context
    : local.repo_root
  )

  # ── AWS credentials detection ──────────────────────────────────────────────
  # Checks both ~/.aws/credentials (key-based) and ~/.aws/config (SSO / named profiles).
  # When true, ~/.aws is mounted read-only into every container that needs AWS access.
  aws_dir_available = (
    fileexists(pathexpand("~/.aws/credentials")) ||
    fileexists(pathexpand("~/.aws/config"))
  )

  # ── Scenarios bind-mount detection ────────────────────────────────────────
  # True when the caller has specified an absolute path to a host directory
  # containing scenario YAML files.  The directory is mounted read-only so
  # the container can read pre-built scenarios at startup.
  scenarios_dir_available = var.local_scenarios_dir != ""

  # ── Local DB bind-mount detection ─────────────────────────────────────────
  local_db_available = var.local_db_path != ""

  # ── Base environment variables ─────────────────────────────────────────────
  # Mirrors the ECS base_environment pattern (modules/ecs/main.tf).
  # AWS_S3_STATE_BUCKET is deliberately left empty — the entrypoint script
  # detects this and skips all S3 restore/sync operations for local runs.
  base_environment = [
    { name = "NODE_ENV",               value = "production" },
    { name = "API_PORT",               value = tostring(var.container_port) },
    { name = "AWS_S3_STATE_BUCKET",    value = "" },
    { name = "AUTH_DEFAULT_ADMIN_ENABLED", value = "true" },
    { name = "DATABASE_URL",           value = "file:/app/state/data/aria-evaluator.db" },
    { name = "EVAL_REPORT_OUTPUT_DIR", value = "/app/state/reports" },
    { name = "SCENARIOS_DIR",          value = "/app/state/scenarios" },
  ]

  # When the caller passes a bedrock_proxy_url (the separately-deployed proxy's
  # host-accessible URL), inject it as BEDROCK_LAMBDA_ENDPOINT so aria-evaluator
  # can reach the proxy across Docker network boundaries.
  # Use http://host.docker.internal:<port> when the proxy runs in a separate
  # Docker network on the same machine.
  proxy_environment = var.bedrock_proxy_url != "" ? [
    { name = "BEDROCK_LAMBDA_ENDPOINT", value = var.bedrock_proxy_url }
  ] : []

  all_environment = concat(local.base_environment, local.proxy_environment, var.extra_environment_vars)

  # docker_container.env expects "NAME=VALUE" strings
  env_list = [for e in local.all_environment : "${e.name}=${e.value}"]
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

# ── Persistent state volume ────────────────────────────────────────────────────
# Single volume mounted at /app/state — contains the SQLite database, evaluation
# reports, transcripts, and scenario files.  Persists across container restarts.

resource "docker_volume" "state" {
  name = "${local.name_prefix}-state"

  labels {
    label = "managed-by"
    value = "terraform"
  }
}

# ── Application image ──────────────────────────────────────────────────────────
# Always builds the image locally from local.effective_build_context.
# This prevents Terraform from attempting a Docker Hub pull for a local-only
# image name like "aria-evaluator:local" that does not exist in any registry.
#
# Build context resolution (in priority order):
#   1. var.app_dockerfile_context  — explicit absolute path set by the caller
#   2. auto-detected repo root     — four levels above this module directory
#
# To force a full rebuild without changing the Dockerfile, taint the resource:
#   terraform taint module.docker_local.docker_image.app

resource "docker_image" "app" {
  name         = var.app_image_name
  keep_locally = true

  build {
    context    = local.effective_build_context
    dockerfile = var.app_dockerfile
    # Tag the built image so it is addressable by name:tag locally.
    tag = [var.app_image_name]
  }

  # Rebuild when the Dockerfile or npm dependency manifest changes.
  # For a full source rebuild (e.g. after src/ changes), either:
  #   a) change app_image_name to a new tag, or
  #   b) run: terraform taint module.docker_local.docker_image.app && terraform apply
  triggers = {
    dockerfile_sha   = filesha1("${local.effective_build_context}/${var.app_dockerfile}")
    package_lock_sha = filesha1("${local.effective_build_context}/package-lock.json")
  }
}

# ── Application container ──────────────────────────────────────────────────────

resource "docker_container" "app" {
  name  = local.name_prefix
  image = docker_image.app.image_id

  # Restart automatically unless the operator explicitly stops it
  restart = "unless-stopped"

  networks_advanced {
    name = docker_network.app.name
  }

  ports {
    internal = var.container_port
    external = var.host_port
    protocol = "tcp"
  }

  # Mount the state volume at /app/state so the entrypoint can place the SQLite
  # database at /app/state/data/aria-evaluator.db and write reports/scenarios.
  volumes {
    volume_name    = docker_volume.state.name
    container_path = "/app/state"
  }

  # Automatically mount host AWS credentials so the application can call AWS
  # services (Amazon Connect, Bedrock judge model, S3, etc.) without any extra
  # configuration.  Triggered when ~/.aws/credentials or ~/.aws/config exists.
  # The mount is read-only — containers cannot modify host credentials.
  dynamic "volumes" {
    for_each = local.aws_dir_available ? [1] : []
    content {
      host_path      = pathexpand("~/.aws")
      container_path = "/root/.aws"
      read_only      = true
    }
  }

  # Bind-mount host scenarios directory so pre-built YAML scenario files are
  # visible inside the container without needing to copy them into the volume.
  # Read-only — write new scenarios via the UI which stores them in the state volume.
  dynamic "volumes" {
    for_each = local.scenarios_dir_available ? [1] : []
    content {
      host_path      = var.local_scenarios_dir
      container_path = "/app/state/scenarios"
      read_only      = false
    }
  }

  # Optional: bind-mount a host SQLite DB file to preserve run history across
  # terraform destroy / apply cycles.
  dynamic "volumes" {
    for_each = local.local_db_available ? [1] : []
    content {
      host_path      = var.local_db_path
      container_path = "/app/state/data/aria-evaluator.db"
      read_only      = false
    }
  }

  env = local.env_list

  healthcheck {
    test = [
      "CMD", "node", "-e",
      "require('http').get('http://localhost:${var.container_port}/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
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
}

# The Bedrock proxy is now a completely standalone service with its own Docker
# network and Terraform state.  See:
#   infra/terraform/modules/docker-bedrock-proxy/
#   infra/terraform/environments/bedrock-proxy-local/
#
# To connect the evaluator to a locally-running proxy, pass:
#   bedrock_proxy_url = "http://host.docker.internal:8765"
# in your terraform.tfvars (or as a -var flag).
