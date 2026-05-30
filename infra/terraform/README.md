# ARIA Evaluator — Terraform Infrastructure

Modular Terraform for deploying `aria-evaluator-ts` on AWS ECS Fargate with CloudFront.

## Structure

```
infra/terraform/
├── modules/                    # Reusable base modules
│   ├── networking/             # VPC, subnets, IGW, route tables, security groups
│   ├── ecr/                    # ECR repository
│   ├── s3/                     # S3 state bucket
│   ├── iam/                    # ECS task execution + task IAM roles
│   ├── ecs/                    # ECS cluster, task definition, Fargate service
│   ├── alb/                    # Application Load Balancer, listener, target group
│   └── cloudfront/             # CloudFront distribution + cache policies
├── environments/
│   ├── dev/                    # Dev environment deployment
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   ├── outputs.tf
│   │   ├── versions.tf
│   │   └── terraform.tfvars
│   └── prod/                   # Prod environment deployment
│       ├── main.tf
│       ├── variables.tf
│       ├── outputs.tf
│       ├── versions.tf
│       └── terraform.tfvars
└── README.md
```

## Quick Start

### 1. Bootstrap (first time only)

```bash
# Create S3 backend bucket and DynamoDB lock table manually, or use the bootstrap script
cd infra/terraform/environments/dev
terraform init
terraform plan -var-file=terraform.tfvars
terraform apply -var-file=terraform.tfvars
```

### 2. Build and push Docker image

```bash
# Get ECR URI from Terraform output
ECR_URI=$(terraform output -raw ecr_repository_uri)
aws ecr get-login-password --region eu-west-2 | docker login --username AWS --password-stdin $ECR_URI
docker build --platform linux/amd64 -t $ECR_URI:latest .
docker push $ECR_URI:latest
```

### 3. Deploy ECS service with image

```bash
terraform apply -var="app_image_uri=$ECR_URI:latest" -var-file=terraform.tfvars
```

## Environment Variables

All sensitive values are passed via `terraform.tfvars` (never committed) or environment variables.
See `terraform.tfvars.example` in each environment directory.

## Remote State

Configure `backend.tf` in each environment with your S3 bucket and DynamoDB table for state locking.
