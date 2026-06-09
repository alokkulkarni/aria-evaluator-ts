# ARIA Evaluator — Terraform Infrastructure

Terraform for ARIA Evaluator now uses a bootstrap + tenant-stack model for SaaS multi-tenancy.

## Layout

- `bootstrap/` — one-time shared infrastructure:
  - Terraform state S3 bucket
  - DynamoDB lock table
  - shared ECR repository
  - shared `aria-heartbeats` DynamoDB table
  - shared KMS key for secrets
- `modules/tenant-module/` — per-tenant stack wrapper
- `modules/*` — reusable building blocks (networking, ALB, ECS, IAM, CloudFront, WAF, observability, EFS, suspend Lambdas)
- `environments/prod/` — thin wrapper that instantiates one tenant module

## Bootstrap first

Bootstrap uses the **local backend intentionally** so it can create the remote backend resources:

```bash
cd infra/terraform/bootstrap
terraform init
terraform apply -var='bucket_suffix=<unique-suffix>'
```

Capture these bootstrap outputs for tenant deployments:

- `state_bucket_name`
- `locks_table_name`
- `heartbeat_table_name`
- `heartbeat_table_arn`
- `kms_key_arn`
- `ecr_repository_url`

## Tenant deployments

Each tenant gets its own state file under:

```text
tenants/<tenant_id>/terraform.tfstate
```

The committed `environments/prod/versions.tf` backend block contains placeholders on purpose. Supply real values at deploy time with `terraform init -backend-config=...`.

Example tenant flow:

```bash
cd infra/terraform/environments/prod
terraform init \
  -backend-config="bucket=<bootstrap-state-bucket>" \
  -backend-config="key=tenants/<tenant_id>/terraform.tfstate" \
  -backend-config="region=<region>" \
  -backend-config="dynamodb_table=aria-evaluator-tf-locks" \
  -backend-config="kms_key_id=<bootstrap-kms-key-arn>"

terraform apply -var-file=terraform.tfvars
```

### Control-plane backend init (automated)

For `environments/control-plane-prod`, backend values are read automatically from
`terraform.tfvars` via helper script (you can still override via env vars):

```bash
cd infra/terraform/environments/control-plane-prod
./init-backend.sh
terraform plan -var-file=terraform.tfvars
terraform apply -var-file=terraform.tfvars
```

Optional overrides:
- `TERRAFORM_STATE_KEY` (defaults to `control-plane/prod/terraform.tfstate`)
- `TERRAFORM_STATE_BUCKET`
- `TERRAFORM_STATE_LOCK_TABLE`
- `TERRAFORM_STATE_KMS_KEY_ARN`
- `AWS_REGION`

## Production architecture highlights

- Shared ECR and shared heartbeat table from bootstrap
- Per-tenant VPC, ALB, ECS service, S3 bucket, CloudFront, optional WAF, optional EFS
- CloudFront → ALB origin protection via `X-CF-Origin-Secret`
- WAF attached to CloudFront only (us-east-1)
- VPC Flow Logs and ECS Container Insights enabled
- Per-tenant observability stack (logs, alarms, dashboard, optional X-Ray)
- Per-tenant suspension automation with EventBridge + Lambda + DynamoDB conditional writes

## Secrets

Sensitive values are stored in AWS Secrets Manager and referenced by ARN from Terraform variables. Do not commit tenant secrets to `terraform.tfvars`.
