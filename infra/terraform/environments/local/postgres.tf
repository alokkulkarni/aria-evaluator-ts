# infra/terraform/environments/local/postgres.tf
# Local development PostgreSQL (Docker-based). Phase 1 of the multi-tenant
# migration moves the app off SQLite onto Postgres everywhere — Aurora Serverless
# v2 for dev/prod and this container for local — so there is one provider and one
# migration history. See docs/MULTI_TENANT_SPEC.md.
#
# The app container reaches this DB via host.docker.internal:5432 (the published
# port), mirroring how it reaches the local Redis container.

resource "null_resource" "ensure_postgres_data_dir" {
  provisioner "local-exec" {
    command = "mkdir -p '${abspath("${path.module}/../../../data/postgres")}'"
  }
}

resource "docker_image" "postgres" {
  name          = "postgres:16-alpine"
  keep_locally  = true
  pull_triggers = [var.docker_pull_trigger]
}

resource "docker_container" "postgres" {
  name    = "aria-postgres-local"
  image   = docker_image.postgres.image_id
  restart = "unless-stopped"

  ports {
    internal = 5432
    external = 5432
  }

  volumes {
    host_path      = abspath("${path.module}/../../../data/postgres")
    container_path = "/var/lib/postgresql/data"
  }

  env = [
    "POSTGRES_USER=aria",
    "POSTGRES_PASSWORD=aria",
    "POSTGRES_DB=aria",
  ]

  healthcheck {
    test     = ["CMD-SHELL", "pg_isready -U aria"]
    interval = "5s"
    timeout  = "3s"
    retries  = 10
  }

  depends_on = [null_resource.ensure_postgres_data_dir]
}

output "postgres_container_id" {
  value       = docker_container.postgres.id
  description = "Postgres container ID"
}

output "postgres_connection_string" {
  value       = "postgresql://aria:aria@localhost:5432/aria?schema=public"
  description = "Local Postgres connection string for host access (e.g. npm run dev)"
}
