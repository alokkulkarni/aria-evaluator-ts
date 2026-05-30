terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  # Uncomment and configure once you have an S3 backend bucket.
  # backend "s3" {
  #   bucket         = "aria-evaluator-tf-state"
  #   key            = "prod/terraform.tfstate"
  #   region         = "eu-west-2"
  #   dynamodb_table = "aria-evaluator-tf-locks"
  #   encrypt        = true
  # }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "aria-evaluator"
      Environment = "prod"
      ManagedBy   = "terraform"
    }
  }
}
