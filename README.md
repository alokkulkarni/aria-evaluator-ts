# ARIA Evaluator

**AI safety and quality evaluation platform for conversational AI agents.**  
Run structured scenarios against any AI agent, score every response with an intelligent LLM judge, and surface results through a live browser dashboard or CLI.

Supports **Amazon Connect** (voice + chat), **AWS Lex**, **Azure Direct Line**, **Strands/AgentCore**, **GitHub Copilot Chat**, **OpenAPI** HTTP endpoints, and **WebSocket** bots.

---

## Table of Contents

1. [What ARIA Does](#what-aria-does)
2. [Architecture Overview](#architecture-overview)
3. [Evaluation Providers](#evaluation-providers)
4. [Judge Configuration](#judge-configuration)
5. [Quick Start — Local Docker](#quick-start--local-docker)
6. [Quick Start — AWS (dev/prod)](#quick-start--aws)
7. [Bedrock Lambda Proxy](#bedrock-lambda-proxy)
8. [OpenAPI Provider](#openapi-provider)
9. [Environment Variables Reference](#environment-variables-reference)
10. [Directory Layout](#directory-layout)

---

## What ARIA Does

ARIA runs scripted or AI-driven conversations against a live AI agent and evaluates the agent's behaviour across multiple safety and quality dimensions.

```
Scenario YAML → Conversation Engine → Agent Under Test
                                           │
                                    Transcript + Logs
                                           │
                                     LLM Judge (Bedrock)
                                           │
                              Scores across 15+ dimensions
                                           │
                              HTML/JSON Report + UI Dashboard
```

**Scenario types:** `adversarial`, `functional`, `escalation`, `edge_cases`, `banking`

**Judge dimensions:** correctness, faithfulness, helpfulness, relevance, conciseness, tone, clarity, goal success, task completion, guardrail compliance, prompt injection resistance, escalation appropriateness, handover quality, vulnerability detection, and more.

**Adversarial coverage:** prompt injection, indirect prompt injection, jailbreak techniques, social engineering, identity/authority abuse, script and code injection, decision integrity attacks, RAG poisoning, trusted upstream poisoning, system card sourced attacks.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         ARIA Evaluator                              │
│  React UI ──► TypeScript API ──► Evaluation Engine                  │
│                                        │                            │
│              ┌─────────────────────────┼──────────────────────┐     │
│              ▼             ▼           ▼          ▼           ▼     │
│         Amazon         AWS Lex    OpenAPI /   Azure /      Strands  │
│         Connect                  WebSocket   Copilot     /AgentCore │
│       (WebRTC/voice)                                                 │
│                                                                      │
│              ┌─────────────────────────────────────────────┐        │
│              │          LLM Judge (Amazon Bedrock)          │        │
│              │  Region-aware · Inference-profile-ready      │        │
│              │  Role-aware system prompt · 10 guardrails    │        │
│              └─────────────────────────────────────────────┘        │
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

### AWS Lex
Tests Lex V2 bots directly via the runtime API.  
Requires: `LEX_BOT_ID`, `LEX_BOT_ALIAS_ID`, `LEX_REGION`.

### Azure Direct Line / GitHub Copilot Chat
Tests Azure Bot Service agents and GitHub Copilot Chat endpoints.  
Configured via API key or OAuth token in Settings.

### Strands / AgentCore
Tests AWS Strands agents and Amazon Bedrock AgentCore endpoints.

### Bedrock Lambda Proxy
Tests Bedrock models through a thin Python Lambda (or local proxy container).  
The Lambda accepts POST `/chat` with a message list and returns the model reply.  
No API key needed on AWS — IAM role provides identity.

### OpenAPI
Tests any HTTP/HTTPS endpoint described by an OpenAPI 3.x spec.  
Optional headers (API keys, bearer tokens) are read from the spec's `securitySchemes`
or supplied as extra key-value pairs in the UI.

---

## Judge Configuration

ARIA uses an LLM judge backed by Amazon Bedrock to score every conversation. The judge is configured independently of the agent under test.

### Judge model selection

The judge model is selected in **Settings → Judge LLM**. Available model groups:

| Group | Models | Notes |
|---|---|---|
| Claude 4 (Sonnet) | `claude-sonnet-4-5` | Default — best quality/cost balance |
| Claude 4 (Haiku) | `claude-haiku-4-5` | Fastest and lowest cost |
| Claude 3.5 | `claude-3-5-sonnet`, `claude-3-5-haiku` | Previous generation |
| Amazon Nova | `nova-pro`, `nova-lite`, `nova-micro` | AWS-native models |
| Legacy Claude 3 | `claude-3-haiku`, `claude-3-sonnet` | On-demand; no inference profile required |

### Region-aware inference profiles

Newer models (Claude 3.5+, Claude 4.x, Amazon Nova) **require cross-region inference profile IDs** — they cannot be invoked with bare model IDs, even within their native region. ARIA handles this automatically.

When you select a judge region, ARIA applies the correct geo prefix:

| AWS Region | Geo prefix | Example model ID |
|---|---|---|
| `eu-west-2`, `eu-west-1`, `eu-central-1` | `eu.` | `eu.anthropic.claude-sonnet-4-5-20251001-v1:0` |
| `us-east-1`, `us-west-2` | `us.` | `us.anthropic.claude-sonnet-4-5-20251001-v1:0` |
| `ap-northeast-1`, `ap-southeast-1` | `ap.` | `ap.anthropic.claude-sonnet-4-5-20251001-v1:0` |

Legacy Claude 3 models (Haiku, Sonnet) use bare IDs and work in any region without a prefix.

### Judge environment variables

| Variable | Default | Description |
|---|---|---|
| `JUDGE_BEDROCK_REGION` | `eu-west-2` | AWS region for judge Bedrock calls. Takes precedence over `BEDROCK_REGION`. Configurable in Settings UI. |
| `JUDGE_MODEL_PRESET` | _(claude-sonnet-4-5)_ | Bare model ID stored by Settings; geo prefix applied automatically at runtime |
| `JUDGE_SYSTEM_PROMPT` | _(built-in)_ | Override the full judge system prompt |
| `JUDGE_MAX_TOKENS` | `1200` | Max tokens per judge call. Multi-turn trace batch scales dynamically. |
| `JUDGE_TEMPERATURE` | `0` | Judge temperature (0 = deterministic) |

### Judge system prompt

The default judge system prompt includes:
- **Role**: senior AI evaluation judge specialising in conversational AI quality and safety
- **Skill**: dimension-based evaluation across functional, escalation, security, and edge-case scenarios
- **10 guardrails** covering correct evaluation behaviour for all scenario types — not just adversarial

### Token efficiency

ARIA is designed to minimise judge token usage:
- Security scenarios with no trace dimensions make zero trace calls (previously wasted 1,500+ tokens per agent turn on newer models)
- Quality trace evaluation uses a single batched Bedrock call with compound dimension keys, instead of one call per turn
- Default `maxTokens` is 1,200 (previously 2,000); multi-turn batches scale to a max of 4,000
- Every judge call prints `[Xin/Yout]` in the run terminal for live token visibility

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
| `BEDROCK_REGION` | `us-east-1` | Fallback AWS region for Bedrock (used if `JUDGE_BEDROCK_REGION` not set) |
| `JUDGE_BEDROCK_REGION` | `eu-west-2` | AWS region for the LLM judge. Overrides `BEDROCK_REGION`. Configurable in Settings UI without restart. |
| `JUDGE_MODEL_ID` | — | Override judge model bare ID (bypasses Settings preset) |
| `JUDGE_SYSTEM_PROMPT` | _(built-in)_ | Override the full judge system prompt |
| `JUDGE_MAX_TOKENS` | `1200` | Max tokens per judge Bedrock call |
| `JUDGE_TEMPERATURE` | `0` | Judge sampling temperature |
| `BEDROCK_LAMBDA_ENDPOINT` | — | URL of the Bedrock proxy (if using Lambda proxy option) |
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
