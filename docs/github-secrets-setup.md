# GitHub Secrets & Environments Setup

This document lists all secrets and environments required by the ARIA Evaluator CI/CD pipelines.

---

## GitHub Environments

Create these environments in **Settings → Environments**. Prod environments should require manual approval.

| Environment | Protection Rules |
|---|---|
| `bootstrap` | Require reviewers (1+) |
| `evaluator-dev` | None |
| `evaluator-prod` | Require reviewers, restrict to `main` branch |
| `control-plane-dev` | None |
| `control-plane-prod` | Require reviewers, restrict to `main` branch |
| `website-dev` | None |
| `website-prod` | Require reviewers, restrict to `main` branch |

---

## Repository Secrets

These are shared across all environments. Set at **Settings → Secrets and variables → Actions → Repository secrets**.

| Secret | Description | Example |
|---|---|---|
| _(none required)_ | All secrets are environment-scoped — see below | |

---

## Environment Secrets

### All Environments (bootstrap, dev, prod)

| Secret | Description | How to obtain |
|---|---|---|
| `AWS_DEPLOY_ROLE_ARN` | IAM role ARN for OIDC-based AWS auth | Create an IAM role with `sts:AssumeRoleWithWebIdentity` trust for `token.actions.githubusercontent.com`. See [AWS OIDC setup](#aws-oidc-setup). |
| `AWS_REGION` | AWS region (default: `eu-west-2`) | Your deployment region |
| `TF_BUCKET_SUFFIX` | Unique suffix for the TF state bucket | From `terraform output state_bucket_name` after bootstrap (the part after `aria-evaluator-tf-state-`) |

### Bootstrap Environment

| Secret | Description |
|---|---|
| `SES_SENDER_DOMAIN` | Domain for SES email sending (e.g. `ariaeval.io`). Leave empty to skip. |

### Evaluator Environments (dev, prod)

| Secret | Description |
|---|---|
| `KMS_KEY_ARN` | KMS key ARN from bootstrap (`terraform output kms_key_arn`) |
| `ECR_REPOSITORY_URL` | ECR repo URL from bootstrap (`terraform output ecr_repository_url`) |
| `TENANT_ID` | Tenant identifier for this deployment (e.g. `demo`, `acme-corp`) |

### Control-Plane Environments (dev, prod)

| Secret | Description |
|---|---|
| `KMS_KEY_ARN` | Same KMS key ARN from bootstrap |
| `ECR_REPOSITORY_URL` | Same ECR repo URL from bootstrap |
| `TENANT_ID` | Control plane tenant ID (e.g. `control-plane`) |

### Website Environments (dev, prod)

| Secret | Description |
|---|---|
| `KMS_KEY_ARN` | Same KMS key ARN from bootstrap |
| `ECR_REPOSITORY_URL` | Same ECR repo URL from bootstrap |
| `DOMAIN_NAME` | Website domain (e.g. `ariaeval.io` for prod, `dev.ariaeval.io` for dev) |
| `ROUTE53_ZONE_ID` | Route53 hosted zone ID for the domain |
| `ACM_CERT_ARN_US_EAST_1` | ACM certificate ARN in us-east-1 (for CloudFront) |
| `NEXTAUTH_SECRET` | NextAuth.js signing secret (generate with `openssl rand -base64 32`) |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID (from Google Cloud Console) |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `GH_OAUTH_CLIENT_ID` | GitHub OAuth App client ID |
| `GH_OAUTH_CLIENT_SECRET` | GitHub OAuth App client secret |

---

## AWS OIDC Setup

Instead of storing long-lived AWS access keys, use OIDC federation with GitHub Actions.

### 1. Create an OIDC Identity Provider

```bash
aws iam create-open-id-connect-provider \
  --url "https://token.actions.githubusercontent.com" \
  --client-id-list "sts.amazonaws.com" \
  --thumbprint-list "6938fd4d98bab03faadb97b34396831e3780aea1"
```

### 2. Create an IAM Role per Environment

```bash
# Example for prod deployment role
cat > trust-policy.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:YOUR_ORG/aria-evaluator-ts:environment:evaluator-prod"
        }
      }
    }
  ]
}
EOF

aws iam create-role \
  --role-name aria-github-deploy-prod \
  --assume-role-policy-document file://trust-policy.json
```

### 3. Attach Required Policies

The deploy role needs permissions for:
- **ECS**: `ecs:*` (service updates, task definitions)
- **ECR**: `ecr:GetAuthorizationToken`, `ecr:BatchCheckLayerAvailability`, `ecr:PutImage`, etc.
- **S3**: `s3:PutObject`, `s3:DeleteObject`, `s3:ListBucket` (TF state + website assets)
- **CloudFront**: `cloudfront:CreateInvalidation`
- **DynamoDB**: `dynamodb:PutItem`, `dynamodb:GetItem`, `dynamodb:DeleteItem` (TF locks)
- **IAM**: `iam:PassRole` (for ECS task roles)
- **KMS**: `kms:Decrypt`, `kms:Encrypt`, `kms:GenerateDataKey*`
- **CloudFormation/Terraform state**: Full access to the TF state bucket

Recommended: Create a managed policy `AriaDeployPolicy` and attach it to each role.

---

## Mapping from Previous `TF_VAR_` Exports

If you were previously running Terraform locally with exported environment variables, here's the mapping to GitHub Secrets:

| Previous `export` | GitHub Secret | Environment |
|---|---|---|
| `TF_VAR_bucket_suffix` | `TF_BUCKET_SUFFIX` | All |
| `TF_VAR_kms_key_arn` | `KMS_KEY_ARN` | All except bootstrap |
| `TF_VAR_ecr_repository_url` | `ECR_REPOSITORY_URL` | All except bootstrap |
| `TF_VAR_tenant_id` | `TENANT_ID` | Evaluator, Control-Plane |
| `TF_VAR_nextauth_secret` | `NEXTAUTH_SECRET` | Website |
| `TF_VAR_google_client_id` | `GOOGLE_CLIENT_ID` | Website |
| `TF_VAR_google_client_secret` | `GOOGLE_CLIENT_SECRET` | Website |
| `TF_VAR_github_client_id` | `GH_OAUTH_CLIENT_ID` | Website |
| `TF_VAR_github_client_secret` | `GH_OAUTH_CLIENT_SECRET` | Website |
| `TF_VAR_domain_name` | `DOMAIN_NAME` | Website |
| `TF_VAR_route53_zone_id` | `ROUTE53_ZONE_ID` | Website |
| `TF_VAR_acm_certificate_arn_us_east_1` | `ACM_CERT_ARN_US_EAST_1` | Website |
| `TF_VAR_ses_sender_domain` | `SES_SENDER_DOMAIN` | Bootstrap |

---

## Quick Setup Checklist

1. [ ] Create GitHub Environments (7 total) with appropriate protection rules
2. [ ] Set up AWS OIDC provider in your AWS account
3. [ ] Create IAM deploy roles per environment with OIDC trust
4. [ ] Run bootstrap Terraform locally once: `cd infra/terraform/bootstrap && terraform apply`
5. [ ] Copy bootstrap outputs into GitHub Environment secrets
6. [ ] Configure OAuth credentials (Google, GitHub) for website environments
7. [ ] Generate NextAuth secret: `openssl rand -base64 32`
8. [ ] Test with a `plan`-only infra run before `apply`
