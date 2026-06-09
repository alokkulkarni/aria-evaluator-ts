terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.0"
    }
  }

  backend "s3" {} # Configured via -backend-config flags at init time
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "aria-evaluator"
      Environment = "dev"
      ManagedBy   = "terraform"
    }
  }
}
