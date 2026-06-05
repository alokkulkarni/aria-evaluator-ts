# ARIA Evaluator — SaaS Platform Design

**Date:** 2026-06-05
**Last updated:** 2026-06-05 — added customer region selection (data sovereignty)
**Scope:** Full SaaS platform wrapping the existing ARIA Evaluator product
**Status:** Design approved — awaiting Phase 1 implementation sign-off

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Overview & Principles](#2-system-overview--principles)
3. [Architecture — Layers and Boundaries](#3-architecture--layers-and-boundaries)
4. [Component Design](#4-component-design)
5. [Region Selection & Data Sovereignty](#5-region-selection--data-sovereignty)
6. [Data Model](#6-data-model)
7. [Pricing & Packages](#7-pricing--packages)
8. [Tenant Isolation Model](#8-tenant-isolation-model)
9. [AWS Tagging Strategy](#9-aws-tagging-strategy)
10. [Domain & Routing Architecture](#10-domain--routing-architecture)
11. [End-to-End User Flows](#11-end-to-end-user-flows)
12. [Folder Structure](#12-folder-structure)
13. [Infrastructure Topology](#13-infrastructure-topology)
14. [Security Design](#14-security-design)
15. [Implementation Plan — Phases & Tasks](#15-implementation-plan--phases--tasks)
16. [Open Decisions](#16-open-decisions)

---

## 1. Executive Summary

ARIA Evaluator becomes a fully productised SaaS platform. A prospective customer visits the main marketing website, reviews pricing, signs up, **selects their preferred deployment region for data sovereignty**, and within 5–10 minutes has their own isolated ARIA Evaluator instance running on AWS in that region — provisioned entirely automatically via Terraform, tagged to their account, and accessible via a subdomain. They are signed in automatically on first access. They can add colleagues. When their instance sits idle for 3 hours it suspends itself, saving cost. Waking it up is transparent: login, 60-second restart, dashboard loads.

---

## 2. System Overview & Principles

### Core principles

1. **Hard multi-tenant isolation** — every customer gets their own VPC, ECS cluster, EFS, S3 bucket, IAM role. No shared runtime. No shared database.
2. **Zero-touch provisioning** — customer signs up, we spin up their AWS infrastructure automatically via Terraform. No manual steps.
3. **SSO bridge** — the main website handles identity (Cognito). ARIA instances accept short-lived signed tokens. The existing local auth backdoor is preserved for dev/internal use.
4. **Cost-aware by design** — auto-suspend saves infrastructure cost during idle periods. Package limits prevent unbounded usage. Tagging enables per-tenant cost attribution via AWS Cost Explorer.
5. **Backdoor preserved** — the existing ARIA admin/dev login mechanism remains fully functional for internal teams running standalone instances.
6. **Website is just a CloudFront + S3 static site** — no server-side rendering infra needed for marketing pages; API calls go to the control plane Lambda/API Gateway.
7. **Data sovereignty by design** — every tenant chooses their deployment region at sign-up. All data for that tenant — database, transcripts, reports, logs — lives exclusively in the chosen region. Region cannot be changed after provisioning (migration is a future roadmap item).

### Non-goals for initial release

- Region migration after provisioning (data in one region stays there; migration tooling is a roadmap item)
- Per-tenant dedicated AWS accounts (single shared AWS account initially; dedicated account option is Enterprise roadmap)
- Real-time billing / Stripe webhook reconciliation (post-MVP)

---

## 3. Architecture — Layers and Boundaries

```javascript
+--------------------------------------------------------------------------------+
|  LAYER 1 — PUBLIC WEBSITE (CloudFront + S3)                                    |
|  ariaeval.io                                                                   |
|  Next.js static export · Marketing · Pricing · Sign up · Sign in · Dashboard  |
+----------------------------------+---------------------------------------------+
                                   |  HTTPS API calls
+----------------------------------v---------------------------------------------+
|  LAYER 2 — CONTROL PLANE (API Gateway + Lambda)                                |
|  api.ariaeval.io                                                                |
|  Auth (Cognito) · Tenant registry (DynamoDB) · Provisioning queue (SQS)        |
|  Usage tracking · Package enforcement · SSO token issuer · Suspend/resume       |
+----------------------------------+---------------------------------------------+
                                   |  SQS message -> Terraform runner
+----------------------------------v---------------------------------------------+
|  LAYER 3 — TENANT PROVISIONER (ECS Fargate task — short-lived)                 |
|  Terraform runner · One task per provisioning job                              |
|  Reads tenant config from DynamoDB · Applies prod Terraform · Reports back     |
+----------------------------------+---------------------------------------------+
                                   |  Creates isolated stack per tenant
+----------------------------------v---------------------------------------------+
|  LAYER 4 — PER-TENANT ARIA INSTANCES (one isolated stack per customer)         |
|  <tenant>.ariaeval.io                                                           |
|  VPC · ECS Fargate · ALB · CloudFront · S3 · SQLite on EFS                    |
|  Accepts SSO tokens · Sends heartbeats · Enforces package limits               |
+--------------------------------------------------------------------------------+
```

---

## 4. Component Design

### 4.1 Main Website

**Technology:** Next.js 14 (App Router) with static export
**Deployment:** CloudFront + S3
**Auth:** AWS Cognito User Pool
**Styling:** Tailwind CSS + shadcn/ui

**Pages:**

| Route | Description |
| --- | --- |
| `/` | Hero landing page — product overview, headline metrics, CTA |
| `/features` | Feature deep-dive |
| `/pricing` | Pricing table — Starter / Professional / Enterprise |
| `/customers` | Case studies, logos |
| `/docs` | Product documentation |
| `/sign-up` | Account creation — name, email, company, password, **region selection**, pricing tier |
| `/sign-in` | Login |
| `/dashboard` | **Authenticated** — instance status, provision button, user management |
| `/dashboard/instance` | Instance details — URL, status, usage metrics, suspend/resume |
| `/dashboard/users` | Add/remove users |
| `/dashboard/billing` | Current plan, usage, upgrade |
| `/dashboard/settings` | Account settings |
| `/verify-email` | Post-signup email verification |
| `/reset-password` | Password reset |

**Key UI components:**

- **InstanceStatusCard** — Provisioning / Running / Suspended / Starting; shows region flag + display name
- **RegionSelector** — card-based picker (see §5); shows flag, friendly name, compliance note; never shows AWS codes
- **PricingTable** — interactive tier comparison with Stripe Checkout (Phase 2)
- **UsageBar** — visual usage vs. limit
- **ProvisionProgress** — SSE-driven live updates during terraform apply

---

### 4.2 Control Plane API

**Technology:** Node.js + Express on AWS Lambda via API Gateway
**Database:** Amazon DynamoDB
**Queue:** Amazon SQS FIFO
**Auth:** AWS Cognito JWT on every authenticated endpoint
**Secrets:** AWS Secrets Manager

**Endpoints:**

```javascript
POST   /auth/register             Create Cognito user + tenant record
POST   /auth/confirm              Confirm email verification code
POST   /auth/login                Issue Cognito tokens
POST   /auth/refresh              Refresh access token
POST   /auth/forgot-password      Trigger forgot-password flow
POST   /auth/reset-password       Complete password reset

GET    /tenant/me                 Get current tenant details + instance status
POST   /tenant/provision          Enqueue a provisioning job
GET    /tenant/provision/status   Poll provisioning progress (or SSE)
POST   /tenant/suspend            Manually suspend instance
POST   /tenant/resume             Resume suspended instance

GET    /tenant/users              List users
POST   /tenant/users/invite       Invite a user (email)
DELETE /tenant/users/:userId      Remove user access

GET    /tenant/usage              Current period usage counters
GET    /tenant/billing            Current plan + overage status

POST   /instance/heartbeat        Called by ARIA instance every 10 min
POST   /instance/sso-token        Issue short-lived SSO JWT for redirect login
GET    /instance/sso-verify       ARIA instance validates an SSO token

GET    /packages                  List available pricing packages (public)
GET    /regions                   List available deployment regions with display names (public)

# Internal — called by provisioner task only
POST   /internal/provision/complete    Report provisioning success + outputs
POST   /internal/provision/failed      Report provisioning failure
```

---

### 4.3 Tenant Provisioner

**Technology:** TypeScript Node.js in Docker, run as ECS Fargate task (not Lambda — terraform apply takes 10–15 min)
**Trigger:** SQS FIFO message
**Terraform state:** `s3://aria-saas-tf-state-<aws_region>/<tenant_id>/terraform.tfstate`
**DynamoDB lock table:** `aria-saas-tf-locks-<aws_region>` (one per region)

**Provisioning flow:**

```javascript
1. ECS task starts (triggered by SQS message)
2. Pull tenant config from DynamoDB (tenant_id, pricing_tier, aws_region, etc.)
3. Resolve aws_region from tenant record (e.g. "eu-west-2")
4. Write per-tenant tfvars:
   - tenant_id, tenant_name (slug), aws_region, user_email, company_name
   - pricing_tier -> ECS cpu/memory/storage limits
   - tags (full set — see §9, includes aria:region + aria:region_display_name)
   - bucket_suffix, initial_admin_email + initial_admin_token
5. terraform init \
     -backend-config="bucket=aria-saas-tf-state-<aws_region>" \
     -backend-config="key=<tenant_id>/terraform.tfstate" \
     -backend-config="region=<aws_region>"
6. terraform apply -auto-approve -var-file=tenant.tfvars
7. Capture outputs: instance_url, alb_dns_name, ecs_cluster_arn,
                    ecs_service_arn, cloudfront_distribution_id
8. POST /internal/provision/complete with outputs
9. ECS task terminates
```

> **Note:** The provisioner ECS task runs in the platform home region but provisions tenant resources in the tenant's chosen region. Terraform's `aws_region` tfvar drives the AWS provider target.

**Per-tier resource mapping:**

| Pricing Tier | ECS CPU | ECS Memory | Desired Count | EFS Storage | ALB Type |
| --- | --- | --- | --- | --- | --- |
| Starter | 512 | 1024 MB | 1 | 10 GB | Shared (path-based) |
| Professional | 1024 | 2048 MB | 1 | 30 GB | Dedicated subdomain |
| Enterprise | 2048 | 4096 MB | 2 (HA) | 100 GB | Dedicated subdomain + WAF |

---

### 4.4 ARIA Instance — Modifications Required

**a) SSO token acceptance**
New endpoint `GET /auth/sso?token=<jwt>` — verifies JWT against control plane public key, creates session, falls through to normal login if no token (backdoor preserved).

**b) Heartbeat emission**
Background job every 10 min: `POST <CONTROL_PLANE_URL>/instance/heartbeat` with HMAC-signed payload.

**c) Package limit enforcement**
Env vars at provision time: `MAX_SCENARIOS`, `MAX_RUNS_PER_MONTH`, `MAX_USERS`, `MAX_STORAGE_GB`. UI shows usage bars + overage messaging with upgrade link.

**d) Admin bootstrap via SSO**
`INITIAL_ADMIN_EMAIL` env var: ARIA creates that user as admin automatically (no password needed — SSO token provides auth). Backdoor remains when env var is NOT set.

**e) User management within instance**
Instance admin can invite users; they receive invite email linking back to main website sign-up/sign-in, which SSO-redirects them to the instance.

---

### 4.5 Auto-Suspend / Reinstate Engine

**Suspend:**

```javascript
EventBridge Scheduler: every 15 minutes
  -> SuspendCheckLambda:
     - Query DynamoDB: all instances with status = RUNNING
     - For each: last_heartbeat_at > 3 hours ago?
       YES -> ECS UpdateService(desiredCount=0, region=tenant.aws_region)
               DynamoDB: instance.status = SUSPENDED
       NO  -> skip
```

**Resume (triggered by user login):**

```javascript
User logs in -> check instance.status
  SUSPENDED?
    -> ECS UpdateService(desiredCount=1, region=tenant.aws_region)
    -> instance.status = STARTING
    -> return { status: "starting", estimated_seconds: 60 }
  
Website: "Your workspace is waking up..." (polls /tenant/me every 5s)
  -> ECS task HEALTHY -> ALB health check passes
  -> instance.status = RUNNING
  -> SSO redirect to instance
```

**Estimated wake-up:** 45–90 seconds.

---

### 4.6 Usage Enforcement

| Counter | Limit key | Checked at |
| --- | --- | --- |
| `scenarios_created` | `MAX_SCENARIOS` | Scenario creation |
| `runs_this_month` | `MAX_RUNS_PER_MONTH` | Run start |
| `users_count` | `MAX_USERS` | User invite |
| `storage_gb` | `MAX_STORAGE_GB` | Report/transcript save |

Overage: `HTTP 402` with `{ error: "LIMIT_EXCEEDED", limit, current, max, upgradeUrl }`.

---

### 4.7 Auth & SSO Bridge

**Auth authority:** AWS Cognito User Pool (one pool, all tenants)

| Token | Issuer | TTL | Purpose |
| --- | --- | --- | --- |
| Cognito Access Token | Cognito | 1 hour | Authenticate control plane API calls |
| Cognito ID Token | Cognito | 1 hour | User identity on website |
| SSO Instance Token | Control Plane | 5 minutes | Single-use redirect login to instance |
| Heartbeat HMAC | Control Plane | Permanent | Instance liveness verification |

**SSO flow:**

```javascript
1. User authenticated to website (Cognito session valid)
2. Calls POST /instance/sso-token
3. Control plane issues SSO JWT (RS256):
   { iss, sub, email, display_name, role, tenant_id, instance_id, exp, jti }
   jti stored in DynamoDB (single-use enforcement)
4. Returns: { sso_url: "https://<tenant>.ariaeval.io/auth/sso?token=<jwt>" }
5. Browser redirects -> ARIA verifies -> creates session -> /dashboard
```

**Backdoor:** `SAAS_MODE=false` (or unset) → ARIA uses existing local auth.

---

## 5. Region Selection & Data Sovereignty

### Why region selection matters

Enterprise customers in Europe, APAC, and regulated industries need assurance that all evaluation data — transcripts, credentials, judge outputs, reports — stays within a specific geographic boundary. Region selection at sign-up is a first-class data sovereignty feature and a key differentiator for enterprise procurement.

### Supported regions and display names

Users **never** see an AWS region code. The UI shows a human-readable name, flag, and compliance note. The internal mapping:

| Display Name | Region Tag | AWS Code | Tiers Available |
| --- | --- | --- | --- |
| Europe — London | `eu-london` | `eu-west-2` | All tiers |
| Europe — Ireland | `eu-ireland` | `eu-west-1` | Professional, Enterprise |
| Europe — Frankfurt | `eu-frankfurt` | `eu-central-1` | Professional, Enterprise |
| US East — Virginia | `us-east` | `us-east-1` | All tiers |
| US West — Oregon | `us-west` | `us-west-2` | Professional, Enterprise |
| Asia Pacific — Sydney | `ap-sydney` | `ap-southeast-2` | Professional, Enterprise |
| Asia Pacific — Singapore | `ap-singapore` | `ap-southeast-1` | Enterprise |
| Asia Pacific — Tokyo | `ap-tokyo` | `ap-northeast-1` | Enterprise |

> **Starter tier** is limited to `eu-london` and `us-east` to reduce infrastructure bootstrapping complexity. Professional and Enterprise tiers unlock all available regions.

### Region data structure

```typescript
interface RegionOption {
  regionTag: string;          // "eu-london" — used in UI and API requests
  awsCode: string;            // "eu-west-2" — used internally only, never shown to users
  displayName: string;        // "Europe — London"
  flag: string;               // emoji flag
  complianceNote: string;     // "UK GDPR & data residency compliant"
  availableTiers: string[];   // ["starter","professional","enterprise"]
  bedrockGeo: string;         // "eu" | "us" | "ap" — inference profile prefix
}
```

The `/regions` public endpoint returns the full list. The sign-up form calls it to populate the region picker and filter options based on the selected pricing tier.

### Sign-up form steps

```javascript
Step 1: Account details — name, email, company, password
Step 2: Choose your plan — Starter / Professional / Enterprise
Step 3: Choose your deployment region
         [Card per region: flag, display name, compliance note;
          greyed-out if not available for selected tier]
Step 4: Confirm & sign up
```

### Region flow through the system

```javascript
Sign-up form: regionTag = "eu-london"
  -> POST /auth/register { ..., region: "eu-london" }
  -> Control plane resolves: "eu-london" -> { awsCode: "eu-west-2", bedrockGeo: "eu" }
  -> DynamoDB aria_tenants:
       aws_region          = "eu-west-2"
       region_display_name = "Europe — London"
       bedrock_geo         = "eu"
  -> Provisioner reads tenant record
       tfvar: aws_region = "eu-west-2"
       tags: aria:region = "eu-west-2", aria:region_display_name = "Europe — London"
       S3 state bucket: aria-saas-tf-state-eu-west-2
       terraform provider: region = "eu-west-2"
  -> All tenant AWS resources in eu-west-2 only
  -> ARIA instance env: BEDROCK_REGION = "eu-west-2"
       -> judge inference profile: eu.anthropic.claude-...
  -> Control plane ECS API calls for this tenant:
       ecs.eu-west-2.amazonaws.com
```

### Multi-region infrastructure bootstrapping

Before any tenant can be provisioned in a region, the platform operator runs a one-time bootstrap:

1. Create S3 bucket `aria-saas-tf-state-<aws_region>` (versioning + encryption)
2. Create DynamoDB lock table `aria-saas-tf-locks-<aws_region>`
3. Ensure ARIA ECR image is accessible (cross-region replication or per-region ECR)
4. Provision wildcard ACM certificate `*.ariaeval.io` in the region (for ALB use)

All 8 regions are bootstrapped once during platform launch (Phase 4). Regions can be added later without impacting existing tenants.

### Control plane region awareness

The control plane API runs in a single home region but issues AWS SDK calls against each tenant's region:

```typescript
const ecs = new ECSClient({ region: tenant.aws_region });
await ecs.send(new UpdateServiceCommand({
  cluster: tenant.ecs_cluster_arn,
  service: tenant.ecs_service_arn,
  desiredCount: 0,
}));
```

`aws_region` in DynamoDB is the source of truth for all per-tenant SDK calls.

### ACM certificate strategy

| Component | Certificate location | Coverage |
| --- | --- | --- |
| CloudFront distribution (per tenant) | `us-east-1` ACM (one shared wildcard) | `*.ariaeval.io` |
| ALB (per tenant, in tenant's region) | Regional ACM wildcard, pre-provisioned per region | `*.ariaeval.io` |

No per-tenant certificate creation at provisioning time — both CloudFront and ALBs use pre-provisioned wildcard certs.

---

## 6. Data Model

### DynamoDB Tables

**`aria_tenants`**

```javascript
PK: tenant_id (UUID)
SK: "METADATA"

tenant_id               string   UUID
company_name            string
admin_email             string
pricing_tier            string   starter | professional | enterprise
status                  string   PENDING | PROVISIONING | RUNNING | SUSPENDED | STARTING | FAILED
created_at              ISO8601
instance_url            string   https://<tenant>.ariaeval.io
instance_id             string
ecs_cluster_arn         string
ecs_service_arn         string
cloudfront_id           string
aws_region              string   AWS region code from customer's sign-up choice (e.g. "eu-west-2")
region_display_name     string   Human-readable name stored for UI display (e.g. "Europe — London")
bedrock_geo             string   "eu" | "us" | "ap" — inference profile prefix
last_heartbeat_at       ISO8601
provision_started_at    ISO8601
provision_completed_at  ISO8601
GSI1PK: admin_email
```

**`aria_users`**

```javascript
PK: tenant_id
SK: user_id (Cognito sub)

user_id       string
email         string
display_name  string
role          string   owner | admin | member
invited_by    string
invited_at    ISO8601
confirmed_at  ISO8601
status        string   INVITED | ACTIVE | SUSPENDED
GSI1PK: email
```

**`aria_usage`**

```javascript
PK: tenant_id
SK: period (e.g. "2026-06")

scenarios_total   number
runs_this_period  number
storage_gb        number
updated_at        ISO8601
```

**`aria_provision_jobs`**

```javascript
PK: job_id (UUID)
SK: "JOB"

job_id            string
tenant_id         string
status            string   QUEUED | RUNNING | COMPLETE | FAILED
started_at        ISO8601
completed_at      ISO8601
error_message     string
terraform_outputs map
GSI1PK: tenant_id
```

**`aria_sso_tokens`**

```javascript
PK: jti (UUID)
TTL: exp + 60s

jti          string
tenant_id    string
user_id      string
used         boolean
issued_at    ISO8601
expires_at   ISO8601
```

**`aria_events`** (audit log, append-only)

```javascript
PK: tenant_id
SK: event_id (ULID)

event_type    string   PROVISION_STARTED | PROVISION_COMPLETE | USER_INVITED |
                       INSTANCE_SUSPENDED | INSTANCE_RESUMED | LIMIT_EXCEEDED |
                       PLAN_UPGRADED | etc.
actor_user_id string
metadata      map
timestamp     ISO8601
```

---

## 7. Pricing & Packages

### Tiers

| Feature | Starter | Professional | Enterprise |
| --- | --- | --- | --- |
| **Price (monthly)** | $49 | $199 | $999 |
| **Price (annual, 20% off)** | $470 | $1,910 | $9,590 |
| **Scenarios (total)** | 50 | 200 | Unlimited |
| **Runs per month** | 500 | 2,000 | Unlimited |
| **Users per instance** | 3 | 10 | Unlimited |
| **Storage** | 5 GB | 20 GB | 100 GB |
| **Transcript retention** | 30 days | 90 days | 365 days |
| **Judge model** | Claude Haiku | Claude Sonnet | Claude Sonnet + custom |
| **Providers** | OpenAPI, Lex | All providers | All + priority support |
| **Deployment regions** | Europe — London, US East | All 8 regions | All 8 regions |
| **Auto-suspend** | 3 hours | 3 hours | Configurable |
| **SLA** | Best effort | 99.5% uptime | 99.9% + dedicated support |
| **ECS resources** | 512 CPU / 1GB | 1024 CPU / 2GB | 2048 CPU / 4GB |
| **AWS WAF** | No | No | Yes |
| **Dedicated subdomain** | Shared ALB | Yes | Yes |
| **Custom domain** | No | No | Yes |
| **Fine-tune pipeline** | No | No | Yes |

### Add-ons (future)

- Additional storage: $5/GB/month
- Additional runs: $0.10/run over limit
- Dedicated AWS account: custom (Enterprise only)
- Priority provisioning (< 5 min SLA): +$50/month

### Free tier

- 14-day free trial on Professional tier
- No credit card required
- Converts to Starter automatically if not upgraded after 14 days

---

## 8. Tenant Isolation Model

Each provisioned tenant gets a **fully isolated AWS stack** within a shared AWS account:

```javascript
Shared Resources (platform-level)
+-- Cognito User Pool
+-- API Gateway + Lambda (control plane)
+-- DynamoDB tables (tenant registry, usage, events)
+-- SQS FIFO queue (provisioning jobs)
+-- ECS cluster: aria-provisioner
+-- S3: aria-saas-tf-state-<region> (one per region, prefixed by tenant_id)
+-- ECR: shared ARIA app image

Per-Tenant Resources (isolated, created by Terraform in tenant's chosen region)
+-- VPC (unique CIDR per tenant)
|   +-- Public subnets (2 AZs)
|   +-- Private subnets (2 AZs — future)
+-- ECS Cluster: aria-<tenant_id>
|   +-- ECS Service + Task Definition
+-- ALB: aria-<tenant_id>-alb
+-- CloudFront Distribution: <tenant>.ariaeval.io
+-- EFS File System (SQLite + state)
+-- S3 Bucket: aria-<tenant_id>-state
+-- IAM Role: aria-<tenant_id>-ecs-task-role
+-- CloudWatch Log Group: /ecs/aria-<tenant_id>
+-- Secrets Manager: aria/<tenant_id>/config
+-- EventBridge Rule: aria-<tenant_id>-heartbeat
```

**Data isolation guarantees:**

- Separate VPCs: no network path between tenants
- Separate S3 buckets: IAM policies scoped to tenant's task role only
- Separate SQLite on separate EFS file systems
- Separate Secrets Manager entries: IAM boundary prevents cross-tenant access
- Separate CloudWatch log groups

---

## 9. AWS Tagging Strategy

Every AWS resource in the tenant Terraform stack is tagged:

| Tag Key | Value | Source |
| --- | --- | --- |
| `aria:tenant_id` | `ten-abc123xyz` | DynamoDB -> tfvars |
| `aria:company` | `Acme Corp` | Sign-up form -> tfvars |
| `aria:admin_email` | `admin@acme.com` | Sign-up form -> tfvars |
| `aria:pricing_tier` | `professional` | Selected tier -> tfvars |
| `aria:instance_id` | `inst-def456uvw` | Generated at provision time |
| `aria:provisioned_at` | `2026-06-05T09:00:00Z` | Terraform timestamp |
| `aria:region` | `eu-west-2` | Customer's chosen region (AWS code) |
| `aria:region_display_name` | `Europe — London` | Customer's chosen region (display) |
| `aria:environment` | `saas-prod` | Fixed |
| `Project` | `aria-evaluator` | Fixed |
| `ManagedBy` | `terraform` | Fixed |
| `CostCenter` | `<tenant_id>` | Per-tenant cost attribution |

AWS Cost Explorer can group by `aria:tenant_id` or `aria:region` for per-tenant and per-region cost analysis.

---

## 10. Domain & Routing Architecture

**Main website:** `ariaeval.io`

- CloudFront -> S3 bucket (static website)
- ACM certificate: `ariaeval.io` + `*.ariaeval.io` in `us-east-1`

**Control plane API:** `api.ariaeval.io`

- CloudFront -> API Gateway -> Lambda

**Tenant instances:** `<tenant_slug>.ariaeval.io`

- All tenant subdomains: `*.ariaeval.io` DNS
- Each tenant has its own CloudFront distribution; origin = tenant ALB in the tenant's chosen region
- CloudFront is global — the subdomain works from anywhere; data at rest is in the tenant's region only

**Wildcard certificate strategy (multi-region):**

| Component | Certificate location | Coverage |
| --- | --- | --- |
| CloudFront (all tenants) | `us-east-1` ACM, one shared wildcard | `*.ariaeval.io` |
| ALB (per tenant, per region) | Regional ACM wildcard, pre-provisioned per region during bootstrap | `*.ariaeval.io` |

No per-tenant certificate creation at provisioning time.

**Subdomain slug:** derived from `company_name`, lowercased, spaces-to-hyphens, max 20 chars, 6-char hash suffix on collision.

**Custom domains (Enterprise):** user provides domain (`eval.acme.com`); CNAME value generated; on verification, CloudFront distribution updated with custom domain + new ACM cert.

---

## 11. End-to-End User Flows

### Flow 1 — Sign Up and Provision

```javascript
1. User visits ariaeval.io/sign-up
2. Step 1: Name, email, company, password
3. Step 2: Select pricing tier (Starter / Professional / Enterprise)
4. Step 3: Select deployment region
           - RegionSelector shows flag, display name, compliance note
           - Options filtered by tier (Starter: only eu-london, us-east)
           - User selects e.g. "Europe — London"
5. Step 4: Confirm & submit
           POST /auth/register { ..., region: "eu-london" }
           -> Control plane: "eu-london" -> { aws_region: "eu-west-2", bedrock_geo: "eu" }
           -> Cognito: create user (unconfirmed)
           -> DynamoDB: tenant (status=PENDING, aws_region="eu-west-2",
                        region_display_name="Europe — London")
                        user (role=owner)
           -> Email verification sent
6. User verifies email -> POST /auth/confirm
   -> Cognito: confirm user
   -> DynamoDB: tenant.status = PROVISIONING
   -> SQS: enqueue provisioning job
   -> Redirect to /dashboard ("Provisioning your workspace...")
7. Provisioner ECS task picks up job (~30s)
   -> Writes tfvars (including aws_region="eu-west-2")
   -> terraform apply in eu-west-2 (5–10 min)
   -> POST /internal/provision/complete
      -> DynamoDB: tenant (instance_url, ecs_cluster_arn, status=RUNNING)
8. Dashboard polls /tenant/me -> detects status=RUNNING
   -> POST /instance/sso-token -> sso_url
   -> Browser redirects to https://acme.ariaeval.io/auth/sso?token=...
9. ARIA instance: verifies token -> session -> /dashboard

Total: 6–12 minutes from email confirm to ARIA dashboard.
```

---

### Flow 2 — Returning User (Instance Running)

```javascript
1. Sign in -> /dashboard -> status=RUNNING
2. Click "Open Workspace"
3. POST /instance/sso-token -> sso_url -> redirect -> ARIA dashboard
Total: ~3 seconds
```

---

### Flow 3 — Returning User (Instance Suspended)

```javascript
1. Sign in -> /dashboard -> status=SUSPENDED
2. Click "Wake Up"
3. POST /tenant/resume
   -> ECS UpdateService(desiredCount=1, region=tenant.aws_region)
   -> DynamoDB: status=STARTING
4. "Waking up... (~60 seconds)" (polls /tenant/me every 5s)
5. ECS healthy -> status=RUNNING -> SSO redirect
Total: ~60–90 seconds
```

---

### Flow 4 — Inviting a Team Member

```javascript
[Instance owner, in dashboard]
1. /dashboard/users -> "Invite User" -> email + role
2. POST /tenant/users/invite
   -> Check users_count < MAX_USERS
   -> DynamoDB: user (status=INVITED)
   -> Send invite email with sign-up link

[Invited user]
3. Clicks link -> ariaeval.io/sign-up?invite=<token>
   OR ariaeval.io/sign-in (existing account)
4. On sign-in: resolve invite_token -> associate with tenant
   -> DynamoDB: user.status=ACTIVE
   -> SSO redirect to instance
```

---

### Flow 5 — Auto-Suspend (Background)

```javascript
[EventBridge fires SuspendCheckLambda every 15 min]

For each RUNNING instance:
  last_heartbeat_at > 3 hours ago?
  YES -> ECS UpdateService(desiredCount=0, region=tenant.aws_region)
          DynamoDB: status=SUSPENDED
          Notification email to tenant admin: "Workspace suspended after inactivity"
  NO  -> skip
```

---

### Flow 6 — Limit Exceeded

```javascript
User attempts to start a run -> /runs/start
  -> ARIA instance checks runs_this_month < MAX_RUNS_PER_MONTH
  -> EXCEEDED -> HTTP 402 + { error: "LIMIT_EXCEEDED", ... }
  -> UI: non-dismissible banner "Monthly run limit reached. [Upgrade Plan]"
  -> [Upgrade Plan] -> ariaeval.io/dashboard/billing
     -> Stripe Checkout for plan upgrade
     -> On success: control plane re-provisions with new tier limits
```

---

## 12. Folder Structure

```javascript
aria-evaluator-ts/                    <- existing ARIA Evaluator repo
+-- src/                              <- existing ARIA app (unmodified core)
+-- infra/
|   +-- terraform/
|       +-- environments/
|           +-- prod/                 <- existing prod Terraform (used as tenant base)
|           +-- saas-platform/        <- NEW: control plane + provisioner infra
|               +-- main.tf
|               +-- variables.tf
|               +-- cognito.tf
|               +-- dynamodb.tf
|               +-- sqs.tf
|               +-- lambda.tf
|               +-- apigateway.tf
|               +-- iam.tf
|           +-- tenant-module/        <- NEW: per-tenant Terraform module
|               +-- main.tf
|               +-- variables.tf
|               +-- vpc.tf
|               +-- ecs.tf
|               +-- alb.tf
|               +-- cloudfront.tf
|               +-- efs.tf
|               +-- s3.tf
|               +-- iam.tf
|               +-- secrets.tf
+-- docs/                             <- documentation (existing + this doc)

aria-saas-website/                    <- NEW: separate root folder
+-- app/                              <- Next.js App Router
|   +-- (marketing)/                  <- public pages (layout)
|   |   +-- page.tsx                  <- hero
|   |   +-- pricing/page.tsx
|   |   +-- features/page.tsx
|   +-- (auth)/
|   |   +-- sign-up/page.tsx
|   |   +-- sign-in/page.tsx
|   |   +-- verify-email/page.tsx
|   |   +-- reset-password/page.tsx
|   +-- dashboard/
|       +-- page.tsx                  <- instance status
|       +-- instance/page.tsx
|       +-- users/page.tsx
|       +-- billing/page.tsx
|       +-- settings/page.tsx
+-- components/
|   +-- RegionSelector.tsx
|   +-- PricingTable.tsx
|   +-- InstanceStatusCard.tsx
|   +-- UsageBar.tsx
|   +-- ProvisionProgress.tsx
+-- lib/
|   +-- api.ts                        <- control plane API client
|   +-- auth.ts                       <- Cognito auth helpers
|   +-- regions.ts                    <- region display name mappings
+-- public/
+-- next.config.js                    <- static export config
+-- package.json

aria-saas-control-plane/             <- NEW: control plane API
+-- src/
|   +-- handlers/                     <- Lambda/Express route handlers
|   |   +-- auth.ts
|   |   +-- tenant.ts
|   |   +-- instance.ts
|   |   +-- packages.ts
|   |   +-- regions.ts
|   +-- services/
|   |   +-- cognito.ts
|   |   +-- dynamodb.ts
|   |   +-- sqs.ts
|   |   +-- sso.ts
|   |   +-- suspend.ts
|   +-- lib/
|   |   +-- regions.ts                <- regionTag -> awsCode mapping (source of truth)
|   |   +-- tiers.ts
+-- package.json

aria-saas-provisioner/               <- NEW: Terraform runner
+-- src/
|   +-- runner.ts                     <- main SQS consumer + terraform wrapper
|   +-- tfvars.ts                     <- builds tenant.tfvars
|   +-- reporter.ts                   <- calls /internal/provision/complete|failed
+-- Dockerfile
+-- package.json
```

---

## 13. Infrastructure Topology

```javascript
+-- AWS Account (platform)
|   +-- us-east-1 (platform home region)
|   |   +-- Cognito User Pool
|   |   +-- ACM: *.ariaeval.io (CloudFront certs)
|   |
|   +-- eu-west-2 (control plane home region)
|   |   +-- API Gateway + Lambda (control plane)
|   |   +-- DynamoDB tables
|   |   +-- SQS FIFO queue
|   |   +-- ECS cluster: aria-provisioner
|   |   +-- ECR: aria-evaluator image
|   |   +-- S3: aria-saas-tf-state-eu-west-2
|   |   +-- S3: ariaeval.io static website (+ CloudFront)
|   |
|   +-- eu-west-1  (bootstrapped, available for tenants)
|   +-- eu-central-1
|   +-- us-east-1
|   +-- us-west-2
|   +-- ap-southeast-2
|   +-- ap-southeast-1
|   +-- ap-northeast-1
|       (each has: S3 state bucket, DynamoDB lock table, ACM wildcard cert)
|
+-- Per-tenant stacks (one per customer, in their chosen region)
    +-- eu-west-2
    |   +-- Tenant A (Acme Corp): VPC + ECS + ALB + CF + EFS + S3 + IAM
    |   +-- Tenant B (BetaCo):    VPC + ECS + ALB + CF + EFS + S3 + IAM
    +-- us-east-1
        +-- Tenant C (GammaTech): VPC + ECS + ALB + CF + EFS + S3 + IAM
```

---

## 14. Security Design

| Concern | Mitigation |
| --- | --- |
| Cross-tenant data access | Hard VPC + IAM isolation; separate EFS + S3 per tenant |
| SSO token replay | Single-use JTI stored in DynamoDB; 5-min TTL |
| SSO token forgery | RS256 signed with Secrets Manager private key; public key rotatable |
| Heartbeat spoofing | HMAC-SHA256 signed with instance-specific key |
| Terraform state exposure | Per-tenant S3 prefix + bucket policy; provisioner role has only own-prefix access |
| Package limit bypass | Limits enforced both locally in ARIA instance AND in control plane |
| Provisioner privilege escalation | Provisioner ECS task role has narrowly scoped terraform-apply permissions; no console access |
| DynamoDB injection | All writes go through typed SDK calls; no raw string construction |
| Cognito token forgery | Standard JWT RS256 verification; public key fetched from Cognito JWKS endpoint |
| Idle data exposure | Auto-suspend stops ECS task; EFS data persists but is inaccessible without running task + IAM role |

---

## 15. Implementation Plan — Phases & Tasks

### Phase 1 — Control Plane (Weeks 1–2)

| Task | Description |
| --- | --- |
| 1.1 | Cognito User Pool + App Client (hosted UI or custom) |
| 1.2 | DynamoDB tables: aria\\_tenants, aria\\_users, aria\\_usage, aria\\_sso\\_tokens, aria\\_events |
| 1.3 | Control plane API: auth endpoints (register, confirm, login, refresh, forgot/reset) |
| 1.4 | Control plane API: tenant endpoints (me, provision/status, suspend, resume) |
| 1.5 | Control plane API: user management endpoints (list, invite, remove) |
| 1.6 | Control plane API: `/regions` endpoint — returns region display name list |
| 1.7 | SSO token issuer: RS256 key pair in Secrets Manager, `/instance/sso-token`, `/instance/sso-verify` |
| 1.8 | SQS FIFO queue + provisioning job schema |
| 1.9 | EventBridge + SuspendCheckLambda (stub — real ECS calls in Phase 3) |

### Phase 2 — ARIA Instance Modifications (Weeks 2–3)

| Task | Description |
| --- | --- |
| 2.1 | `GET /auth/sso?token=<jwt>` endpoint — verify + session create + backdoor fallback |
| 2.2 | Heartbeat background job (10-min interval, HMAC signed) |
| 2.3 | Package limit env vars (`MAX_SCENARIOS`, `MAX_RUNS_PER_MONTH`, etc.) + enforcement |
| 2.4 | Usage bar UI components in ARIA settings/dashboard |
| 2.5 | Admin bootstrap from `INITIAL_ADMIN_EMAIL` |
| 2.6 | `SAAS_MODE` env var gate |
| 2.7 | Internal user invite flow (links back to main website) |

### Phase 3 — Tenant Provisioner (Weeks 3–4)

| Task | Description |
| --- | --- |
| 3.1 | Provisioner Docker container: SQS consumer + terraform wrapper |
| 3.2 | `tenant-module` Terraform module wrapping existing prod modules |
| 3.3 | Per-tenant tfvars generator (including `aws_region` from DynamoDB) |
| 3.4 | Multi-region state backend config (`-backend-config=region=<aws_region>`) |
| 3.5 | `/internal/provision/complete` + `/failed` handlers in control plane |
| 3.6 | Provisioner ECS task definition + IAM role in `saas-platform` Terraform |
| 3.7 | SuspendCheckLambda: real ECS `UpdateService` calls per tenant's region |

### Phase 4 — Website (Weeks 4–6)

| Task | Description |
| --- | --- |
| 4.1 | Next.js project scaffold with static export |
| 4.2 | Hero / Marketing pages (responsive, Tailwind + shadcn/ui) |
| 4.3 | Pricing table component (interactive tier comparison) |
| 4.4 | Sign-up flow: 4-step form — details, plan, **region selection (RegionSelector)**, confirm |
| 4.5 | Sign-in + Cognito integration |
| 4.6 | Dashboard: InstanceStatusCard, ProvisionProgress (SSE), UsageBar |
| 4.7 | User management UI |
| 4.8 | Billing page (read-only initially; Stripe in Phase 6) |
| 4.9 | CloudFront + S3 deployment Terraform |

### Phase 5 — Multi-Region Bootstrap (Week 6)

| Task | Description |
| --- | --- |
| 5.1 | Bootstrap S3 state buckets in all 8 regions |
| 5.2 | Bootstrap DynamoDB lock tables in all 8 regions |
| 5.3 | Provision wildcard ACM certs (`*.ariaeval.io`) in all 8 regions |
| 5.4 | ECR cross-region replication OR per-region ECR push in CI |
| 5.5 | End-to-end provisioning test for each supported region |

### Phase 6 — Payments, Polish, Launch (Weeks 7–9)

| Task | Description |
| --- | --- |
| 6.1 | Stripe Checkout integration |
| 6.2 | Billing webhooks: Stripe -> control plane -> DynamoDB plan update |
| 6.3 | Email sequences: welcome, provisioning complete, idle warning, limit warning |
| 6.4 | CloudWatch dashboards: per-tenant cost, provisioning success rate |
| 6.5 | Load testing: 10 concurrent provisioning jobs |
| 6.6 | Security review: IAM boundary analysis, cross-tenant access testing |
| 6.7 | Terms of service, privacy policy, cookie notice |
| 6.8 | Custom domain support (Enterprise) |

---

## 16. Open Decisions

| ID | Topic | Options | Decision |
| --- | --- | --- | --- |
| OD-1 | Control plane deployment | Lambda vs ECS Fargate | **Lambda** — lower cost at early scale |
| OD-2 | ALB sharing (Starter tier) | Shared ALB vs per-tenant ALB | **Shared ALB** for Starter, per-tenant for Professional+ |
| OD-3 | Terraform state backend | S3 same account vs dedicated account | **Same account** initially |
| OD-4 | SQLite storage | EFS (current) vs RDS Postgres | **EFS** — preserves existing ARIA design |
| OD-5 | Payment processor | Stripe vs Marketplace vs manual | **Stripe** |
| OD-6 | Website rendering | Static export vs SSR | **Static export** |
| OD-7 | Tenant slug collision | Hash suffix vs user-chosen subdomain | **Auto-generated + 6-char hash** |
| OD-8 | Suspend grace period | Fixed 3h vs configurable | **Fixed 3h for Starter/Pro, configurable for Enterprise** |
| OD-9 | Region selection scope | All tiers vs tier-restricted | **Starter: eu-london + us-east only; Professional/Enterprise: all 8 regions** |
| OD-10 | Region migration | Supported at launch vs roadmap | **Roadmap only** — region is immutable after provisioning in V1 |

---

*End of design document. Awaiting Phase 1 implementation sign-off.*