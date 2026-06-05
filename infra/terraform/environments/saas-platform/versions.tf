terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  # Remote state — update bucket/key/region once bootstrap is applied
  # backend "s3" {
  #   bucket         = "aria-evaluator-terraform-state"
  #   key            = "saas-platform/security/terraform.tfstate"
  #   region         = "eu-west-2"
  #   dynamodb_table = "aria-evaluator-tf-locks"
  #   encrypt        = true
  # }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      ManagedBy   = "terraform"
      Project     = "aria-evaluator"
      Environment = var.environment
    }
  }
}
