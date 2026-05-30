# ARIA Evaluator

AI evaluation platform for testing AI contact-centre agents against scenario libraries.
Supports **Amazon Connect**, **AWS Bedrock** (via Lambda proxy), and **OpenAPI** HTTP/HTTPS endpoints.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Evaluation Providers](#evaluation-providers)
3. [Quick Start — Local Docker](#quick-start--local-docker)
4. [Quick Start — AWS (dev/prod)](#quick-start--aws)
5. [Bedrock Lambda Proxy](#bedrock-lambda-proxy)
6. [OpenAPI Provider](#openapi-provider)
7. [Environment Variables Reference](#environment-variables-reference)
8. [Directory Layout](#directory-layout)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         aria-evaluator                              │
│  React UI ──► TypeScript API ──► Evaluation Engine                  │
│                                        │                            │
│                          ┌─────────────┼───────────────┐            │
│                          ▼             ▼               ▼            │
│                    Amazon Connect   Bedrock        OpenAPI          │
│                    (WebRTC/voice)   Lambda Proxy   Endpoint         │
└─────────────────────────────────────────────────────────────────────┘
```

Two deployment targets share the same application image:

| Mode | Infrastructure | State |
|---|---|---|
| **Local Docker** | `docker run` via Terraform + `kreuzwerker/docker` | Named Docker volume |
| **AWS (dev/prod)** | ECS Fargate + ALB + CloudFront | S3 bucket |

---

## Evaluation Providers

### Amazon Connect
Tests voice/chat flows through the WebRTC SDK.  
Requires: `CONNECT_INSTANCE_ID`, `CONNECT_REGION`, `CONNECT_CONTACT_FLOW_NAME`.

### Bedrock Lambda Proxy
Tests Bedrock models through a thin Python Lambda (or local proxy container).  
The Lambda accepts POST `/chat` with a message list and returns the model reply.  
No API key needed on AWS — IAM role provides identity.

### OpenAPI
Tests any HTTP/HTTPS endpoint described by an OpenAPI 3.x spec.  
Optional headers (API keys, bearer tokens) are read from the spec's `securitySchemes`
or supplied as extra key-value pairs in the UI.

---

## Quick Start — Local Docker

### Prerequisites

- Docker Desktop (or Docker Engine) running
- Terraform ≥ 1.5
- AWS credentials (only required if connecting to Amazon Connect or Bedrock)

### 1. Build the application image

```bash
# From the repo root
docker build -t aria-evaluator:local .
```

### 2. (Optional) Build the Bedrock proxy image

Only needed if you want to call Bedrock directly from your laptop
(Option B — see [Bedrock Lambda Proxy](#bedrock-lambda-proxy)).

```bash
docker build \
  -f lambda/bedrock_proxy/Dockerfile.local \
  -t aria-bedrock-proxy:local \
  lambda/bedrock_proxy/
```

### 3. Configure Terraform

```bash
cd infra/terraform/environments/local
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars — set your Connect/Bedrock values
```

### 4. Deploy

```bash
terraform init
terraform apply
```

The app starts at **http://localhost:3001** (default; change `host_port` in `terraform.tfvars`).

### 5. Destroy

```bash
terraform destroy
```

> **Data:** persistent state (SQLite, scenarios, reports) lives in the Docker volume
> `aria-evaluator-local-state`. `terraform destroy` removes the volume — back up first if needed.

---

## Quick Start — AWS

### Prerequisites

- AWS CLI configured (`aws configure` or env vars)
- Terraform ≥ 1.5
- Docker (to push images to ECR)

### 1. Bootstrap state bucket and ECR

```bash
cd infra/terraform/environments/dev
cp terraform.tfvars.example terraform.tfvars   # fill in bucket_suffix etc.
terraform init
terraform apply -target=module.state_bucket -target=module.ecr
```

### 2. Build and push image

```bash
# Replace <account> and <region>
aws ecr get-login-password --region eu-west-2 \
  | docker login --username AWS \
    --password-stdin <account>.dkr.ecr.eu-west-2.amazonaws.com

docker build -t <account>.dkr.ecr.eu-west-2.amazonaws.com/aria-evaluator:latest .
docker push <account>.dkr.ecr.eu-west-2.amazonaws.com/aria-evaluator:latest
```

### 3. Deploy remaining infrastructure

```bash
# Update app_image_uri in terraform.tfvars with the ECR URI from step 2
terraform apply
```

### 4. Deploy Bedrock Lambda (optional)

```bash
cd infra/terraform/modules/bedrock-lambda
# Or include it in the dev environment by setting bedrock_lambda_enabled = true
```

---

## Bedrock Lambda Proxy

`lambda/bedrock_proxy/handler.py` — Python 3.12 Lambda that proxies Bedrock Converse API calls.

### API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Returns `{"status":"ok","model":"..."}` |
| `POST` | `/chat` | Sends messages to the Bedrock model |

### POST `/chat` request body

```json
{
  "messages": [
    {"role": "user", "content": "Hello"}
  ],
  "system": "Optional system prompt override",
  "max_tokens": 1024
}
```

### Response

```json
{
  "message": "Hello! How can I help you today?",
  "model": "eu.anthropic.claude-sonnet-4-5-20250929-v1:0",
  "usage": { "inputTokens": 10, "outputTokens": 22 }
}
```

### Environment variables (Lambda / proxy container)

| Variable | Required | Description |
|----------|----------|-------------|
| `BEDROCK_MODEL_ID` | Yes | Model ID, cross-region inference profile, or ARN |
| `BEDROCK_REGION` | No | AWS region (default: `us-east-1`) |
| `SYSTEM_PROMPT` | No | Default system prompt for all conversations |
| `MAX_TOKENS` | No | Max response tokens (default: `2048`) |
| `TEMPERATURE` | No | Sampling temperature (default: `0.7`) |
| `TOP_P` | No | Nucleus sampling p (default: `0.9`) |
| `ALLOWED_ORIGINS` | No | CORS origins, comma-separated (default: `*`) |

### Running locally (without Terraform)

```bash
# Build
docker build -f lambda/bedrock_proxy/Dockerfile.local \
  -t aria-bedrock-proxy:local lambda/bedrock_proxy/

# Run (mounts ~/.aws for credentials)
docker run --rm -p 8765:8000 \
  -v ~/.aws:/root/.aws:ro \
  -e BEDROCK_MODEL_ID="eu.anthropic.claude-sonnet-4-5-20250929-v1:0" \
  -e BEDROCK_REGION="eu-west-2" \
  -e SYSTEM_PROMPT="You are a helpful assistant." \
  aria-bedrock-proxy:local
```

The proxy is then available at `http://localhost:8765`.

---

## OpenAPI Provider

Point aria-evaluator at any OpenAPI 3.x spec to evaluate an HTTP/HTTPS AI endpoint.

1. In the UI, select **OpenAPI** as the evaluation provider.
2. Upload or paste the spec URL (JSON or YAML).
3. The evaluator reads `servers[0].url` as the base URL.
4. Optional headers (API keys, bearer tokens) can be:
   - Read automatically from `securitySchemes` in the spec
   - Added manually as key-value pairs in the connection settings panel

The provider calls the endpoint identified by the operation tagged with
`x-aria-chat: true` or falls back to the first `POST` operation.

---

## Environment Variables Reference

Full list for the main application container:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | HTTP listen port |
| `DATABASE_URL` | `file:./state/data/aria.db` | Prisma/SQLite connection string |
| `CONNECT_INSTANCE_ID` | — | Amazon Connect instance UUID |
| `CONNECT_REGION` | `us-east-1` | Connect AWS region |
| `CONNECT_CONTACT_FLOW_NAME` | — | Contact flow to dial |
| `CONNECT_WEBRTC_FLOW_ID` | — | WebRTC flow UUID |
| `BEDROCK_REGION` | `us-east-1` | Region for the judge model |
| `JUDGE_MODEL_ID` | — | Bedrock model used to score responses |
| `BEDROCK_LAMBDA_ENDPOINT` | — | URL of the Bedrock proxy (if using Option A) |
| `EVAL_PROVIDER_DEFAULT` | `connect` | Default provider: `connect`, `bedrock`, `openapi` |
| `EVAL_CUSTOMER_ID` | `CUST-001` | Synthetic customer identifier |
| `EVAL_CUSTOMER_NAME` | `Test User` | Synthetic customer name |
| `EVAL_RESPONSE_TIMEOUT_SECONDS` | `120` | Max wait for agent response |
| `POLLY_VOICE_ID` | `Joanna` | Amazon Polly voice for TTS |
| `VOICE_PRE_SEND_DELAY_MS` | `1000` | Delay before sending voice |
| `AWS_S3_STATE_BUCKET` | _(empty)_ | S3 bucket for state sync (ECS only; empty = local mode) |
| `AWS_S3_STATE_PREFIX` | `aria-evaluator` | S3 key prefix for state |
| `AWS_S3_SYNC_INTERVAL` | `30` | State sync interval in seconds |

---

## Directory Layout

```
aria-evaluator-ts/
├── src/                        # TypeScript API + React UI
│   ├── api/                    # Express routes
│   ├── evaluator/              # Evaluation engine + providers
│   │   ├── providers/
│   │   │   ├── connectProvider.ts
│   │   │   ├── bedrockProvider.ts
│   │   │   └── openApiProvider.ts
│   │   └── evaluationEngine.ts
│   └── ui/                     # React frontend
├── lambda/
│   └── bedrock_proxy/
│       ├── handler.py          # Lambda handler (API GW v2 event format)
│       ├── server.py           # Local HTTP wrapper around handler.py
│       ├── Dockerfile.local    # Local Docker image for proxy
│       └── template.yaml       # SAM deployment template
├── infra/
│   ├── docker/
│   │   └── ecs-entrypoint.sh   # Shared entrypoint (AWS + local)
│   └── terraform/
│       ├── modules/
│       │   ├── ecs/            # ECS Fargate module
│       │   ├── networking/     # VPC + subnets
│       │   ├── alb/            # Application Load Balancer
│       │   ├── cloudfront/     # CloudFront distribution
│       │   ├── bedrock-lambda/ # Bedrock proxy Lambda + API GW
│       │   └── docker-local/   # Local Docker deployment module
│       └── environments/
│           ├── dev/            # AWS dev environment
│           ├── prod/           # AWS prod environment
│           └── local/          # Local Docker environment
├── prisma/                     # Database schema + migrations
└── Dockerfile                  # Shared application image
```
