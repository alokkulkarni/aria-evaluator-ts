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

  # These placeholders are intentionally committed. The deployment provisioner
  # replaces them at runtime with -backend-config CLI flags so no tenant-specific
  # backend coordinates are hardcoded in git history.
  backend "s3" {
    bucket         = "REPLACE_WITH_BOOTSTRAP_BUCKET"
    key            = "tenants/REPLACE_WITH_TENANT_ID/terraform.tfstate"
    region         = "REPLACE_WITH_REGION"
    dynamodb_table = "aria-evaluator-tf-locks"
    encrypt        = true
    kms_key_id     = "REPLACE_WITH_KMS_KEY_ARN"
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
