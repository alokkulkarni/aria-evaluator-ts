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
  # Run: ../../scripts/tf-init.sh  (or from repo root: ./scripts/tf-init.sh prod)
  backend "s3" {
    bucket         = "placeholder"
    key            = "tenants/placeholder/terraform.tfstate"
    region         = "eu-west-2"
    dynamodb_table = "aria-evaluator-tf-locks"
    encrypt        = true
  }
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
