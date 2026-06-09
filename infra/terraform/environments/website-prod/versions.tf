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

  # Backend configured automatically by scripts/tf-init.sh
  # For first-time local runs without S3: terraform init
  # For S3 backend: ../../scripts/tf-init.sh (or from repo root: ./scripts/tf-init.sh website-prod)
  backend "s3" {}  # Configured via -backend-config flags at init time
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      ManagedBy   = "terraform"
      Project     = "aria-evaluator"
      Environment = "prod"
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
      Environment = "prod"
      Component   = "main-website"
    }
  }
}
