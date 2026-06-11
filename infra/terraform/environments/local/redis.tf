# infra/terraform/environments/local/redis.tf
# Local development Redis configuration (Docker-based)

# For local development, use Docker Compose instead:
# docker-compose up redis
#
# However, if you want to manage local Redis via Terraform:

# Ensure the Redis data directory exists
resource "null_resource" "ensure_redis_data_dir" {
  provisioner "local-exec" {
    command = "mkdir -p '${abspath("${path.module}/../../../data/redis")}'"
  }
}

resource "docker_image" "redis" {
  name          = "redis:7-alpine"
  keep_locally  = true
  pull_triggers = [var.docker_pull_trigger]
}

resource "docker_container" "redis" {
  name    = "aria-redis-local"
  image   = docker_image.redis.image_id
  restart = "unless-stopped"

  ports {
    internal = 6379
    external = 6379
  }

  volumes {
    host_path      = abspath("${path.module}/../../../data/redis")
    container_path = "/data"
  }

  command = ["redis-server", "--appendonly", "yes"]

  env = [
    "REDIS_PASSWORD=",
  ]

  # Health check
  healthcheck {
    test     = ["CMD", "redis-cli", "ping"]
    interval = "5s"
    timeout  = "3s"
    retries  = 5
  }

  depends_on = [null_resource.ensure_redis_data_dir]
}

output "redis_container_id" {
  value       = docker_container.redis.id
  description = "Redis container ID"
}

output "redis_connection_string" {
  value       = "redis://localhost:6379"
  description = "Local Redis connection string"
}

output "redis_host" {
  value       = "localhost"
  description = "Redis hostname"
}

output "redis_port" {
  value       = 6379
  description = "Redis port"
}

output "redis_data_volume_path" {
  value       = abspath("${path.module}/../../../data/redis")
  description = "Host path where Redis data is stored"
}
