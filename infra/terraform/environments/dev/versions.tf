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

  # Backend configured automatically by scripts/tf-init.sh
  # Run: ../../scripts/tf-init.sh  (or from repo root: ./scripts/tf-init.sh dev)
  backend "s3" {
    bucket         = "placeholder"
    key            = "tenants/dev/terraform.tfstate"
    region         = "eu-west-2"
    dynamodb_table = "aria-evaluator-tf-locks"
    encrypt        = true
  }
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
