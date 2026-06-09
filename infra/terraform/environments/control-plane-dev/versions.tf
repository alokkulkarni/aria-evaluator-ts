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
  }

  backend "s3" {} # Configured via -backend-config flags at init time
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "aria-evaluator"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}
