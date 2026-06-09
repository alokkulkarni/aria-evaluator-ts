terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.0"
    }
  }

  # Backend configured automatically by scripts/tf-init.sh
  # For first-time local runs without S3: terraform init -backend=false
  # For S3 backend: ../../scripts/tf-init.sh
  backend "s3" {}  # Configured via -backend-config flags at init time
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = merge(
      var.tags,
      {
        ManagedBy            = "terraform"
        Project              = "aria-evaluator"
        Environment          = var.environment
        AppName              = var.app_name
        "aria:tenant_id"     = var.tenant_id
        "aria:pricing_tier"  = var.pricing_tier
        "aria:pricing_track" = var.pricing_track
      },
    )
  }
}
