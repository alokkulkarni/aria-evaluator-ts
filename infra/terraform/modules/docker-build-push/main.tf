# ── Docker Build & Push ───────────────────────────────────────────────────────
# Builds a Docker image locally and pushes it to ECR as part of `terraform apply`.
#
# Triggers on:
#   • Dockerfile content changes
#   • package-lock.json changes
#   • force_rebuild variable increment
#
# For source-only changes, taint to force rebuild:
#   terraform taint 'module.<name>.null_resource.build_and_push'
#   terraform apply

variable "ecr_repository_url" {
  description = "Full ECR repository URL (e.g. 123456789.dkr.ecr.eu-west-2.amazonaws.com/aria-evaluator)"
  type        = string
}

variable "image_tag" {
  description = "Tag for the Docker image (e.g. v1.0.0, latest, git-sha)"
  type        = string
  default     = "latest"
}

variable "dockerfile" {
  description = "Path to Dockerfile relative to build_context"
  type        = string
  default     = "Dockerfile"
}

variable "build_context" {
  description = "Absolute path to the Docker build context directory"
  type        = string
}

variable "platform" {
  description = "Docker build platform target"
  type        = string
  default     = "linux/amd64"
}

variable "aws_region" {
  description = "AWS region for ECR login"
  type        = string
  default     = "eu-west-2"
}

variable "build_args" {
  description = "Map of Docker build args to pass via --build-arg"
  type        = map(string)
  default     = {}
}

variable "force_rebuild" {
  description = "Increment to force a rebuild of unchanged source"
  type        = number
  default     = 1
}

locals {
  full_image_uri = "${var.ecr_repository_url}:${var.image_tag}"

  # Build --build-arg flags from map
  build_arg_flags = join(" ", [
    for k, v in var.build_args : "--build-arg ${k}=${v}"
  ])
}

resource "null_resource" "build_and_push" {
  triggers = {
    dockerfile_sha   = filesha1("${var.build_context}/${var.dockerfile}")
    package_lock_sha = fileexists("${var.build_context}/package-lock.json") ? filesha1("${var.build_context}/package-lock.json") : "none"
    image_tag        = var.image_tag
    force_rebuild    = var.force_rebuild
  }

  provisioner "local-exec" {
    environment = {
      DOCKER_BUILDKIT = "1"
    }

    # CodeBuild runs local-exec through /bin/sh (dash), which doesn't support
    # `set -o pipefail`. Force bash so the `set -euo pipefail` line works.
    interpreter = ["/bin/bash", "-c"]

    command = <<-EOT
      set -euo pipefail

      echo "==> Authenticating with ECR..."
      aws ecr get-login-password --region ${var.aws_region} | \
        docker login --username AWS --password-stdin ${split("/", var.ecr_repository_url)[0]}

      echo "==> Building ${local.full_image_uri}..."
      docker build \
        --platform ${var.platform} \
        --tag "${local.full_image_uri}" \
        ${local.build_arg_flags} \
        --file "${var.build_context}/${var.dockerfile}" \
        "${var.build_context}"

      echo "==> Pushing ${local.full_image_uri}..."
      docker push "${local.full_image_uri}"

      echo "==> Done."
    EOT
  }
}

output "image_uri" {
  description = "Full ECR image URI (repo:tag) that was built and pushed"
  value       = local.full_image_uri
  depends_on  = [null_resource.build_and_push]
}
