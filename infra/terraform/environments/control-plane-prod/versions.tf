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

  # Backend configured automatically by scripts/tf-init.sh
  # Run: ../../scripts/tf-init.sh  (or from repo root: ./scripts/tf-init.sh control-plane-prod)
  backend "s3" {
    bucket         = "placeholder"
    key            = "control-plane/prod/terraform.tfstate"
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
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}
