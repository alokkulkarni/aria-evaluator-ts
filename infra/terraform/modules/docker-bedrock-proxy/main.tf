locals {
  # Resolve the repo root (4 levels up from this module directory).
  # modules/docker-bedrock-proxy → modules → terraform → infra → repo root
  repo_root = abspath("${path.module}/../../../..")

  # Build context — allow caller override, otherwise auto-detect
  build_context = var.dockerfile_context != "" ? var.dockerfile_context : "${local.repo_root}/lambda/bedrock_proxy"

  name_prefix = "${var.app_name}-${var.environment}"

  # Detect AWS credentials on the host machine (covers key files and SSO config)
  aws_dir_available = (
    fileexists(pathexpand("~/.aws/credentials")) ||
    fileexists(pathexpand("~/.aws/config"))
  )
}

# ── Isolated Docker network ────────────────────────────────────────────────────
# Deliberately separate from the evaluator network so the two services must
# communicate via the host loopback (host.docker.internal) — mimicking a
# realistic cross-service boundary.
resource "docker_network" "proxy" {
  name = "${local.name_prefix}-network"
}

# ── Proxy Docker image ─────────────────────────────────────────────────────────
resource "docker_image" "proxy" {
  name = var.image_name

  build {
    context    = local.build_context
    dockerfile = "Dockerfile.local"
  }

  # Rebuild the image (destroy + recreate) whenever source files change
  triggers = {
    handler_hash    = filesha1("${local.build_context}/handler.py")
    server_hash     = filesha1("${local.build_context}/server.py")
    dockerfile_hash = filesha1("${local.build_context}/Dockerfile.local")
  }

  keep_locally = false
}

# ── Proxy container ────────────────────────────────────────────────────────────
resource "docker_container" "proxy" {
  name  = "${local.name_prefix}-container"
  image = docker_image.proxy.image_id

  networks_advanced {
    name = docker_network.proxy.name
  }

  # Expose on the requested host port
  ports {
    internal = var.container_port
    external = var.host_port
  }

  # ── Environment variables forwarded to the Lambda handler ──────────────────
  env = [
    "BEDROCK_MODEL_ID=${var.model_id}",
    "BEDROCK_REGION=${var.region}",
    "SYSTEM_PROMPT=${var.system_prompt}",
    "MAX_TOKENS=${var.max_tokens}",
    "BEDROCK_READ_TIMEOUT=${var.bedrock_read_timeout}",
    "BEDROCK_MAX_RETRIES=${var.bedrock_max_retries}",
    "PORT=${var.container_port}",
  ]

  # ── AWS credentials (read-only) ────────────────────────────────────────────
  dynamic "volumes" {
    for_each = local.aws_dir_available ? toset(["enabled"]) : toset([])
    content {
      host_path      = pathexpand("~/.aws")
      container_path = "/root/.aws"
      read_only      = true
    }
  }

  # ── Linux Docker compatibility ─────────────────────────────────────────────
  # On Linux (non-Desktop) Docker, host.docker.internal is not automatically
  # resolvable.  Adding this host entry makes `host.docker.internal` resolve to
  # the Docker bridge gateway so containers can reach host services.
  # On macOS/Windows Docker Desktop this entry is harmless.
  host {
    host = "host.docker.internal"
    ip   = "host-gateway"
  }

  # ── Health check ──────────────────────────────────────────────────────────
  healthcheck {
    test         = ["CMD", "python3", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:${var.container_port}/health')"]
    interval     = "15s"
    timeout      = "5s"
    retries      = 3
    start_period = "10s"
  }

  restart = "unless-stopped"

  # Force container replacement when the image changes
  lifecycle {
    replace_triggered_by = [docker_image.proxy]
  }
}
