# ARIA Evaluator — AWS Monthly Cost Estimate

**Region:** eu-west-2 (London)
**Last updated:** June 2026
**Deployment:** 1 ECS Fargate task (always-on), dev + prod environments

---

## 1. Infrastructure Costs (Fixed — always-on)

These costs run 24/7 regardless of evaluation volume.

### ECS Fargate

| Environment | CPU | Memory | vCPU $/hr | Mem $/hr | Monthly |
|---|---|---|---|---|---|
| **Dev** | 256 (0.25 vCPU) | 512 MB | $0.04445 | $0.004865 | **$9.89** |
| **Prod** | 512 (0.5 vCPU) | 1024 MB | $0.04445 | $0.004865 | **$19.77** |

> Formula: `vCPU × $0.04445 × 730hrs` + `GB × $0.004865 × 730hrs`

### Application Load Balancer

| Item | Rate | Monthly (per env) |
|---|---|---|
| ALB fixed charge | $0.0252/hr × 730 hrs | $18.40 |
| LCU charge (light traffic) | ~1 LCU × $0.008/hr × 730 hrs | $5.84 |
| **ALB total** | | **$24.00** |

### CloudFront (PriceClass_100 — US/EU only)

| Item | Rate | Monthly |
|---|---|---|
| HTTPS requests | First 10M/month free | ~$0–2 |
| Data transfer out | $0.0085/GB (first 1TB free) | ~$0 |
| **CloudFront total** | | **~$1–2** |

### Other Services

| Service | Dev/month | Prod/month |
|---|---|---|
| S3 state bucket (~500 MB — SQLite, reports, transcripts) | $0.50 | $1.00 |
| ECR image storage (~2 GB) | $0.15 | $0.15 |
| CloudWatch Logs (7-day dev / 30-day prod) | $0.60 | $0.90 |

### Infrastructure Subtotal

| | Dev | Prod |
|---|---|---|
| ECS Fargate | $9.89 | $19.77 |
| ALB | $24.00 | $24.00 |
| CloudFront | $1.00 | $2.00 |
| S3 | $0.50 | $1.00 |
| ECR | $0.15 | $0.15 |
| CloudWatch | $0.60 | $0.90 |
| **Total fixed/month** | **$36.14** | **$47.82** |

---

## 2. Usage-Based Costs (Scale with evaluation volume)

### 2a. Amazon Bedrock — Token usage per scenario

Every evaluation run makes three batches of Bedrock calls:

| Phase | Purpose | Input tokens | Output tokens |
|---|---|---|---|
| Agent Driver (5 turns) | LLM-powered customer simulation | ~10,000 | ~1,000 |
| Judge SESSION batch | Scores goal_success, task_completion, security dims | ~8,000 | ~1,500 |
| Judge TRACE batch (5 agent turns) | Scores correctness, helpfulness, clarity etc. per turn | ~15,000 | ~2,500 |
| **Total per chat scenario** | | **~33,000** | **~5,000** |
| **Total per voice scenario** | Longer transcripts (+40%) | **~46,000** | **~7,000** |

### 2b. Amazon Polly — Neural TTS (voice runs only)

| Rate | Per voice scenario | 300 runs/month | 1,200 runs/month |
|---|---|---|---|
| $16.00 / 1M chars (neural) | ~400 chars = $0.0064 | $1.92 | $7.68 |

### 2c. Amazon Transcribe Streaming (voice runs only)

| Rate | Per voice scenario (~3 min) | 300 runs/month | 1,200 runs/month |
|---|---|---|---|
| $0.024 / minute | $0.072 | $21.60 | $86.40 |

### 2d. Bedrock Lambda Proxy (currently `bedrock_lambda_enabled = false`)

If enabled:

| Item | Rate | Monthly (light use) |
|---|---|---|
| Lambda invocations | First 1M free | $0 |
| Lambda compute (512 MB, 5s avg) | ~$0.000008/invocation | < $1 |
| API Gateway HTTP API | $1.00 / 1M requests | < $1 |
| **Lambda + APIGW total** | | **< $2** |

---

## 3. Bedrock Model Pricing Reference

All models available in eu-west-2 via cross-region inference profiles:

| Model | Model ID (Bedrock) | Input $/1M tokens | Output $/1M tokens | Quality fit |
|---|---|---|---|---|
| **Claude Sonnet 4.5** *(current default)* | `eu.anthropic.claude-sonnet-4-5-20250929-v1:0` | $3.00 | $15.00 | ⭐⭐⭐⭐⭐ |
| **Claude Sonnet 4.6** | `eu.anthropic.claude-sonnet-4-6` | $3.00 | $15.00 | ⭐⭐⭐⭐⭐ |
| **Claude Haiku 4.5** *(light model)* | `eu.anthropic.claude-haiku-4-5-20251014-v1:0` | $1.00 | $5.00 | ⭐⭐⭐⭐ |
| **Amazon Nova Pro** | `eu.amazon.nova-pro-v1:0` | $0.80 | $3.20 | ⭐⭐⭐⭐ |
| **Llama 3.3 70B** | `meta.llama3-3-70b-instruct-v1:0` | $0.99 | $0.99 | ⭐⭐⭐ |
| **Mistral Large 2** | `mistral.mistral-large-2407-v1:0` | $3.00 | $9.00 | ⭐⭐⭐⭐ |
| **Amazon Nova Lite** | `eu.amazon.nova-lite-v1:0` | $0.06 | $0.24 | ⭐⭐⭐ |
| **Amazon Nova Micro** | `eu.amazon.nova-micro-v1:0` | $0.035 | $0.14 | ⭐⭐ |

### Cost per scenario by model

| Model | Cost / chat scenario | Cost / voice scenario | vs Sonnet 4.5 |
|---|---|---|---|
| Claude Sonnet 4.5/4.6 | $0.174 | $0.243 | baseline |
| Claude Haiku 4.5 | $0.058 | $0.081 | 33% |
| Amazon Nova Pro | $0.042 | $0.059 | 24% |
| Llama 3.3 70B | $0.037 | $0.052 | 21% |
| Mistral Large 2 | $0.144 | $0.202 | 83% |
| Amazon Nova Lite | $0.003 | $0.004 | 1.7% |
| Amazon Nova Micro | $0.002 | $0.003 | 1.1% |

---

## 4. Monthly Total — DEV Environment

**Assumption:** 50 scenarios/day = 1,500/month, 20% voice (1,200 chat + 300 voice)
**Polly + Transcribe (300 voice runs):** $1.92 + $21.60 = **$23.52/month**

| Model | Chat Bedrock | Voice Bedrock | Polly + Transcribe | Infrastructure | **Monthly Total** |
|---|---|---|---|---|---|
| **Claude Sonnet 4.5** | $208.80 | $72.90 | $23.52 | $36.14 | **$341** |
| **Claude Sonnet 4.6** | $208.80 | $72.90 | $23.52 | $36.14 | **$341** |
| **Claude Haiku 4.5** | $69.60 | $24.30 | $23.52 | $36.14 | **$154** |
| **Amazon Nova Pro** | $50.40 | $17.70 | $23.52 | $36.14 | **$128** |
| **Llama 3.3 70B** | $44.40 | $15.60 | $23.52 | $36.14 | **$120** |
| **Mistral Large 2** | $172.80 | $60.60 | $23.52 | $36.14 | **$293** |
| **Amazon Nova Lite** | $3.60 | $1.20 | $23.52 | $36.14 | **$64** |
| **Amazon Nova Micro** | $2.40 | $0.90 | $23.52 | $36.14 | **$63** |

---

## 5. Monthly Total — PROD Environment

**Assumption:** 200 scenarios/day = 6,000/month, 20% voice (4,800 chat + 1,200 voice)
**Polly + Transcribe (1,200 voice runs):** $7.68 + $86.40 = **$94.08/month**

| Model | Chat Bedrock | Voice Bedrock | Polly + Transcribe | Infrastructure | **Monthly Total** |
|---|---|---|---|---|---|
| **Claude Sonnet 4.5** | $835.20 | $291.60 | $94.08 | $47.82 | **$1,269** |
| **Claude Sonnet 4.6** | $835.20 | $291.60 | $94.08 | $47.82 | **$1,269** |
| **Claude Haiku 4.5** | $278.40 | $97.20 | $94.08 | $47.82 | **$518** |
| **Amazon Nova Pro** | $201.60 | $70.80 | $94.08 | $47.82 | **$414** |
| **Llama 3.3 70B** | $177.60 | $62.40 | $94.08 | $47.82 | **$382** |
| **Mistral Large 2** | $691.20 | $242.40 | $94.08 | $47.82 | **$1,076** |
| **Amazon Nova Lite** | $14.40 | $4.80 | $94.08 | $47.82 | **$161** |
| **Amazon Nova Micro** | $9.60 | $3.60 | $94.08 | $47.82 | **$155** |

---

## 6. Visual Cost Comparison

### DEV (1,500 scenarios/month)

```
Nova Micro   ████ $63
Nova Lite    ████ $64
Llama 3.3    ████████ $120
Nova Pro     ████████ $128
Haiku 4.5    ████████████ $154
Mistral L2   ███████████████ $293
Sonnet 4.5   █████████████████ $341
```

### PROD (6,000 scenarios/month)

```
Nova Micro   ████████ $155
Nova Lite    ████████ $161
Llama 3.3    ████████████████████ $382
Nova Pro     █████████████████████ $414
Haiku 4.5    ██████████████████████████ $518
Mistral L2   ██████████████████████████████████████████████ $1,076
Sonnet 4.5   ███████████████████████████████████████████████████ $1,269
```

---

## 7. Cost Driver Analysis

Bedrock is **80–90% of the total bill**. Infrastructure is nearly constant.

| Cost driver | Dev share | Prod share |
|---|---|---|
| Bedrock (LLM judge + agent driver) | ~83% | ~88% |
| Polly + Transcribe (voice only) | ~7% | ~7% |
| Infrastructure (ECS, ALB, CF, S3) | ~10% | ~4% |

**The three biggest levers:**

1. **Scenario volume** — doubling daily runs doubles the bill linearly
2. **Model choice** — switching from Sonnet to Haiku saves ~55% of total cost at equivalent volume
3. **Voice vs chat ratio** — voice runs cost ~40% more per scenario (larger transcripts → more Bedrock tokens, plus Polly + Transcribe)

---

## 8. Model Recommendations by Use Case

| Use case | Recommended model | Monthly cost (prod, 6K scenarios) | Notes |
|---|---|---|---|
| **Compliance-critical** (FCA banking, vulnerability detection) | Claude Sonnet 4.5 | **$1,269** | Highest reasoning quality; best for escalation + vulnerability dimensions |
| **Best quality/cost balance** | Haiku 4.5 for judge + Sonnet for agent driver | **~$420** | Haiku handles structured scoring well; Sonnet needed for realistic customer simulation |
| **Cost-optimised, good quality** | Amazon Nova Pro | **$414** | Strong reasoning, AWS-native, 24% cost of Sonnet |
| **Budget-conscious** | Llama 3.3 70B | **$382** | Open-weight model, flat input=output pricing, no vendor lock-in |
| **Maximum savings, basic quality** | Nova Lite | **$161** | Suitable for simple chat scenarios; weaker on compliance dimensions |
| **Not recommended for judge** | Nova Micro | — | Text-only, insufficient reasoning for FCA compliance dimensions |

---

## 9. Cost Reduction Strategies

| Strategy | Estimated monthly saving | Implementation effort |
|---|---|---|
| Use Haiku 4.5 for judge (keep Sonnet for agent driver) | $550–700/month (prod) | Change `JUDGE_MODEL_ID` env var |
| Switch fully to Nova Pro | $855/month (prod vs Sonnet) | Change `JUDGE_MODEL_ID` + test quality |
| Use Batch inference (50% discount) for non-realtime scoring | ~$400/month (prod) | Requires async pipeline changes |
| Set `desired_count = 0` when not actively evaluating | $10–20/month | Manual ECS task stop |
| Use FARGATE_SPOT for dev | ~$7/month saving | Change ECS capacity provider in dev tfvars |
| Reduce voice scenario ratio from 20% to 10% | ~$40/month (prod) | Run voice only for voice-specific scenarios |
| Reduce CloudWatch retention to 3 days (dev) | < $0.50/month | Change `log_retention_days` in tfvars |

---

## 10. Scaling Reference

How costs scale with evaluation volume (prod, Claude Sonnet 4.5, 20% voice):

| Scenarios/day | Scenarios/month | Bedrock cost | Polly+Transcribe | Infra | **Monthly total** |
|---|---|---|---|---|---|
| 10 | 300 | $55.10 | $4.70 | $47.82 | **~$108** |
| 50 | 1,500 | $275.60 | $23.52 | $47.82 | **~$347** |
| 100 | 3,000 | $551.20 | $47.04 | $47.82 | **~$646** |
| 200 | 6,000 | $1,102.40 | $94.08 | $47.82 | **~$1,244** |
| 500 | 15,000 | $2,756.00 | $235.20 | $47.82 | **~$3,039** |

> **Rule of thumb with Sonnet 4.5:** ~$0.20 per chat scenario, ~$0.28 per voice scenario, plus ~$48/month fixed infrastructure.

---

## 11. Notes and Assumptions

- All prices are **USD**, for **eu-west-2 (London)**, on-demand pricing (no reserved capacity)
- Fargate rates: $0.04445/vCPU-hour, $0.004865/GB-hour (eu-west-2, Linux x86)
- ALB: $0.0252/hour + $0.008/LCU-hour
- CloudFront: Free tier covers first 1TB transfer + 10M requests/month
- Bedrock Claude cross-region profiles (eu.*) are priced the same as direct model pricing
- Token estimates assume average 10-turn conversations; complex scenarios with longer contexts will cost more
- Voice scenarios assume ~3 minutes of audio per scenario for Transcribe billing
- Polly neural (Amy, en-GB): $16.00/1M characters; ~400 chars per customer speaking turn
- Nova Micro and Nova Lite pricing from AWS blog: $0.035/$0.14 and $0.06/$0.24 per 1M tokens respectively
- Bedrock Lambda proxy cost is negligible (<$2/month) when `bedrock_lambda_enabled = true` at evaluation-tool scale
- Amazon Connect usage costs (contact minutes, chat messages) are **not included** — these depend on your Connect instance plan
- AWS Transcribe Streaming: $0.024/minute for standard transcription in eu-west-2

*Content was paraphrased for compliance with licensing restrictions.*
