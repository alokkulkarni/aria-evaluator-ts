terraform {
  required_version = ">= 1.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.30"
    }
    random = {
      source  = "hashicorp/random"
      version = ">= 3.5"
    }
  }

  backend "s3" {}  # Configured via -backend-config flags at init time
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      ManagedBy   = "terraform"
      Project     = "aria-evaluator"
      Environment = "dev"
      Component   = "main-website"
    }
  }
}

# Required for CloudFront WAF (always us-east-1)
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = {
      ManagedBy   = "terraform"
      Project     = "aria-evaluator"
      Environment = "dev"
      Component   = "main-website"
    }
  }
}
