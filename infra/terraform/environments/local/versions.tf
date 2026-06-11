terraform {
  required_version = ">= 1.6"

  required_providers {
    docker = {
      source  = "kreuzwerker/docker"
      version = "~> 3.0"
    }
    null = {
      source  = "hashicorp/null"
      version = "~> 3.2"
    }
  }
}

# Connect to the local Docker daemon
# Set DOCKER_HOST env var to override (e.g. a remote daemon or Colima socket)
provider "docker" {
  host = "unix:///var/run/docker.sock"
}
