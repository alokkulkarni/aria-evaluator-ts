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

  # ── Base environment variables ─────────────────────────────────────────────
  # Mirrors the ECS base_environment pattern (modules/ecs/main.tf).
  # AWS_S3_STATE_BUCKET is deliberately left empty — the entrypoint script
  # detects this and skips all S3 restore/sync operations for local runs.
  base_environment = [
    { name = "NODE_ENV",               value = "production" },
    { name = "API_PORT",               value = tostring(var.container_port) },
    { name = "AWS_S3_STATE_BUCKET",    value = "" },
    { name = "DATABASE_URL",           value = "file:/app/state/data/aria-evaluator.db" },
    { name = "EVAL_REPORT_OUTPUT_DIR", value = "/app/state/reports" },
    { name = "SCENARIOS_DIR",          value = "/app/state/scenarios" },
  ]

  all_environment = concat(local.base_environment, var.extra_environment_vars)

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
    dockerfile = "Dockerfile"
    # Tag the built image so it is addressable by name:tag locally.
    tag = [var.app_image_name]
  }

  # Rebuild automatically when the Dockerfile changes.
  # For a full source rebuild (e.g. after src/ changes), either:
  #   a) change app_image_name to a new tag, or
  #   b) run: terraform taint module.docker_local.docker_image.app && terraform apply
  triggers = {
    dockerfile_sha = filesha1("${local.effective_build_context}/Dockerfile")
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

# ── Local Bedrock proxy (optional) ────────────────────────────────────────────
# Wraps lambda/bedrock_proxy/handler.py as a plain HTTP server so the local
# evaluator can call Bedrock without deploying to AWS.
# The proxy uses the Docker host's AWS credentials (IAM role, env vars, or
# ~/.aws/credentials) — no API key is needed when IAM permissions are correct.

resource "docker_image" "bedrock_proxy" {
  count        = var.bedrock_proxy_enabled ? 1 : 0
  name         = var.bedrock_proxy_image_name
  keep_locally = true

  # Build context: use the explicit path if provided, otherwise derive it from
  # the repo root (same auto-detection as the main app image).
  build {
    context = (
      var.bedrock_proxy_dockerfile_context != ""
      ? var.bedrock_proxy_dockerfile_context
      : "${local.repo_root}/lambda/bedrock_proxy"
    )
    dockerfile = "Dockerfile.local"
    tag        = [var.bedrock_proxy_image_name]
  }

  triggers = var.bedrock_proxy_enabled ? {
    handler_sha    = filesha1("${local.repo_root}/lambda/bedrock_proxy/handler.py")
    server_sha     = filesha1("${local.repo_root}/lambda/bedrock_proxy/server.py")
    dockerfile_sha = filesha1("${local.repo_root}/lambda/bedrock_proxy/Dockerfile.local")
  } : {}
}

resource "docker_container" "bedrock_proxy" {
  count  = var.bedrock_proxy_enabled ? 1 : 0
  name   = "${local.name_prefix}-bedrock-proxy"
  image  = docker_image.bedrock_proxy[0].image_id

  restart = "unless-stopped"

  networks_advanced {
    name = docker_network.app.name
  }

  ports {
    internal = 8000
    external = var.bedrock_proxy_host_port
    protocol = "tcp"
  }

  env = [
    "BEDROCK_MODEL_ID=${var.bedrock_model_id}",
    "BEDROCK_REGION=${var.bedrock_region}",
    "SYSTEM_PROMPT=${var.bedrock_system_prompt}",
    "MAX_TOKENS=${tostring(var.bedrock_max_tokens)}",
    "ALLOWED_ORIGINS=*",
    "LOG_LEVEL=INFO",
    "PORT=8000",
  ]

  # Mount Docker host AWS credentials (read-only) so boto3 can authenticate.
  # Uses the same aws_dir_available check as the main app container — covers
  # both key-based (~/.aws/credentials) and SSO-based (~/.aws/config) setups.
  dynamic "volumes" {
    for_each = local.aws_dir_available ? [1] : []
    content {
      host_path      = pathexpand("~/.aws")
      container_path = "/root/.aws"
      read_only      = true
    }
  }

  healthcheck {
    test = [
      "CMD", "python3", "-c",
      "import urllib.request; urllib.request.urlopen('http://localhost:8000/health').read()"
    ]
    interval     = "20s"
    timeout      = "5s"
    start_period = "15s"
    retries      = 3
  }

  labels {
    label = "managed-by"
    value = "terraform"
  }
}
