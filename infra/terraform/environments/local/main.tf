# ── Local environment: full docker-compose stack ─────────────────────────────
# `terraform apply` here brings up the whole local stack in one command via the
# repo-root docker-compose.yml: the app + PostgreSQL + Redis (+ an optional
# Bedrock proxy). Postgres/Redis are internal to the compose network; only the
# app is published, at http://localhost:3001.
#
# Configuration lives in the repo-root `.env` (copy from `.env.example`); compose
# loads it automatically. This module only passes AWS_REGION and the compose
# profile through, and runs `docker compose` for you.
#
# First login: a default admin is auto-created; its password is printed to the
# app logs:  docker compose logs aria-evaluator | grep -A4 "default admin"

locals {
  repo_root = abspath("${path.module}/../../../..")
  profiles  = var.enable_bedrock_proxy ? "bedrock" : ""
}

resource "null_resource" "stack" {
  # Re-run `docker compose up --build` when the compose file, the image inputs,
  # the app source, or the DB schema change (matches the docker-local module's
  # rebuild triggers so code edits are picked up).
  triggers = {
    compose_sha    = filesha1("${local.repo_root}/docker-compose.yml")
    dockerfile_sha = filesha1("${local.repo_root}/Dockerfile.local")
    package_lock   = filesha1("${local.repo_root}/package-lock.json")
    schema_sha     = filesha1("${local.repo_root}/prisma/schema.prisma")
    source_sha = sha1(join("", [
      for f in fileset(local.repo_root, "src/**") : filesha1("${local.repo_root}/${f}")
    ]))
    profiles  = local.profiles
    repo_root = local.repo_root
  }

  # Bring the stack up (build the image, start postgres/redis/app in order).
  provisioner "local-exec" {
    working_dir = local.repo_root
    environment = {
      AWS_REGION       = var.aws_region
      COMPOSE_PROFILES = local.profiles
      DOCKER_BUILDKIT  = "1"
    }
    command = "docker compose up -d --build --remove-orphans"
  }

  # Tear the stack down on `terraform destroy`. (Add `-v` manually to also wipe
  # the postgres/redis/state volumes.)
  provisioner "local-exec" {
    when        = destroy
    working_dir = self.triggers.repo_root
    command     = "docker compose down"
  }
}
