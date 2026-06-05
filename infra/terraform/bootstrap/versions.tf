terraform {
  required_version = ">= 1.6.0"

  # Bootstrap uses the local backend intentionally so the remote state bucket
  # and lock table can be created before any S3 backend is configured.
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = merge(
      var.tags,
      {
        ManagedBy   = "terraform"
        Project     = "aria-evaluator"
        AppName     = "aria-evaluator"
        Environment = "bootstrap"
      },
    )
  }
}
