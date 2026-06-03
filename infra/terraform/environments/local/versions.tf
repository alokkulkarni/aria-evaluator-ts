terraform {
  required_version = ">= 1.6"

  required_providers {
    docker = {
      source  = "kreuzwerker/docker"
      version = "~> 3.0"
    }
    null = {
      source  = "hashicorp/null"
      version = "~> 3.0"
    }
  }
}

# Connect to the local Docker daemon (default socket — no additional config needed).
# Set DOCKER_HOST env var to override (e.g. a remote daemon or Colima socket).
provider "docker" {}
