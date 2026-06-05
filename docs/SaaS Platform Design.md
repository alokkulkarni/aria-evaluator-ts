# ARIA Evaluator — SaaS Platform Design

**Date:** 2026-06-05
**Last updated:** 2026-06-05 — region selection; expanded auto-suspend; per-instance observability; pricing restructure (Individual/Enterprise/Free/God Mode)
**Scope:** Full SaaS platform wrapping the existing ARIA Evaluator product
**Status:** Design approved — awaiting Phase 1 implementation sign-off

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Overview & Principles](#2-system-overview--principles)
3. [Architecture — Layers and Boundaries](#3-architecture--layers-and-boundaries)
4. [Component Design](#4-component-design)

4.1 Main Website4.2 Control Plane API4.3 Tenant Provisioner4.4 ARIA Instance — Modifications Required4.5 Auto-Suspend / Reinstate Engine \*(expanded)\*4.6 Usage Enforcement4.7 Auth & SSO Bridge4.8 Per-Instance Observability \*(new)\*4.9 God Mode — Internal Override *(new)*

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

Auto-suspend is a core cost-control feature. Every tenant instance emits a heartbeat every 10 minutes. A background scheduler checks all running instances every 15 minutes and suspends any idle beyond the tier's threshold.

#### Instance lifecycle state machine

```javascript
  [provision complete]
                      |
                      v
+-------+        +---------+        +---------+
| FAILED|<-------| STARTING|------->| RUNNING |
+-------+ tmout  +----^----+ healthy+----+----+
                      |                  |
            [resume]  |                  | [idle > threshold]
                      |                  v
                 +-----------+    +------------+
                 | SUSPENDED |<---| SUSPENDING |
                 +-----------+    +------------+
```

States:

- **STARTING** — ECS desiredCount=1; task launching; ALB health check pending
- **RUNNING** — ALB health check passing; instance sending heartbeats
- **SUSPENDING** — ECS desiredCount=0; connection draining in progress (30s grace)
- **SUSPENDED** — ECS task stopped; EFS data intact; no compute cost; CloudFront returns 503 "workspace suspended" page
- **FAILED** — provisioning or resume failed; operator CloudWatch alarm fires

#### Suspend process (detailed)

```javascript
EventBridge Scheduler: fires every 15 minutes (shared rule, all tenants)
  |
  v
SuspendCheckLambda:
  1. Scan DynamoDB aria_tenants WHERE status IN (RUNNING, SUSPENDING)
  2. For each RUNNING instance:
     a. idle_seconds = now - last_heartbeat_at
     b. threshold = tier_suspend_threshold(pricing_tier)
        free: 1h | starter: 3h | individual: 3h
        professional: 3h | enterprise: configurable (default 3h)
     c. if idle_seconds > threshold - 30min AND NOT suspend_warning_sent:
          -> Email admin: "Your workspace suspends in 30 minutes"
          -> DynamoDB: suspend_warning_sent_at = now
     d. if idle_seconds > threshold:
          -> ECS UpdateService(desiredCount=0, region=tenant.aws_region)
          -> DynamoDB: status=SUSPENDING, suspended_at=now
          -> CloudWatch: put metric SuspendEvent{tenant_id, region, tier}
          -> aria_events: INSTANCE_SUSPENDED
  3. For each SUSPENDING instance:
     a. Check ECS service runningCount == 0
        YES -> DynamoDB: status=SUSPENDED
        NO  -> skip (hard-stop after 10 min if still draining)
```

#### Resume process (detailed)

```javascript
User logs in to main website:
  1. Control plane checks tenant.status
  2. IF SUSPENDED:
     a. ECS UpdateService(desiredCount=1, region=tenant.aws_region)
     b. DynamoDB: status=STARTING, resume_started_at=now
     c. Return { status: "starting", estimated_wait_seconds: 75 }
  3. Website: "Waking up your workspace..." progress bar
     Polls GET /tenant/me every 5s
  4. ECS task reaches HEALTHY (ALB /health check passes):
     a. Control plane: runningCount=1 AND healthStatus=HEALTHY
     b. DynamoDB: status=RUNNING, resumed_at=now,
                  suspend_warning_sent_at=null (reset for next cycle)
     c. aria_events: INSTANCE_RESUMED
  5. Website: POST /instance/sso-token -> redirect
  Total wake time: 45-90 seconds
```

#### Grace period and edge cases

| Scenario | Behaviour |
| --- | --- |
| User logs in while STARTING | Returns `{ status: "starting" }` — website polls; no duplicate ECS call |
| Two users log in during STARTING | Both poll; first to see RUNNING gets SSO; second follows within 5s |
| Instance fails to start in 5 min | status=FAILED; admin email sent; CloudWatch alarm fires |
| Instance crashes mid-session (no heartbeat) | Treated as idle; SuspendCheckLambda suspends after threshold period |
| Enterprise configurable threshold | `suspend_threshold_hours` field in DynamoDB; min 1h, max 24h |
| Free plan threshold | 1 hour — aggressive to minimise platform cost for non-paying users |

#### Cost impact (Fargate, eu-west-2)

| Usage pattern | Monthly cost (512 CPU/1GB) |
| --- | --- |
| Running 24/7 | \\\\\\~$12.60 |
| Running 8h/day | \\\\\\~$4.20 |
| 4h/day active (auto-suspend) | \\\\\\~$1.68 |
| Auto-suspend recovers | 60–85% of idle compute cost |

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

### 4.8 Per-Instance Observability

Every tenant instance gets its own dedicated observability stack provisioned by Terraform at the same time as the instance itself. Observability resources are tagged identically to the instance (see §9) so they are discoverable per tenant, per organisation, and per region in AWS Console and Cost Explorer.

#### What is provisioned per tenant (by Terraform)

```javascript
CloudWatch Log Group: /ecs/aria/<tenant_id>
  - Retention: 30 days (Free/Starter), 90 days (Individual/Professional), 365 days (Enterprise)
  - Log streams: one per ECS task revision

CloudWatch Dashboard: aria-<tenant_id>-dashboard
  Widgets:
  - ECS Task CPU utilisation (%)
  - ECS Task memory utilisation (%)
  - ALB request count (5min)
  - ALB 4xx / 5xx error rate (%)
  - ALB target response time (p50, p95, p99)
  - EFS throughput (bytes/s)
  - EFS burst credit balance
  - Instance status (RUNNING / SUSPENDED — driven by custom metric)
  - Run count this month vs limit (custom metric from ARIA heartbeat)
  - Active user count (custom metric)

CloudWatch Alarms (per tenant):
  - ECS task stopped unexpectedly -> SNS -> admin email
  - ALB 5xx rate > 5% over 5 min -> SNS -> admin email
  - EFS burst credit < 10% -> SNS -> operator alert
  - CPU > 85% sustained 10 min -> SNS -> operator alert
  - Resume failure (status=FAILED after 5 min STARTING) -> SNS -> operator PagerDuty

CloudWatch Metrics (custom, published by ARIA instance heartbeat):
  Namespace: ARIA/Instance
  Dimensions: TenantId, PricingTier, Region
  Metrics:
  - RunsThisMonth (count)
  - ScenariosTotal (count)
  - ActiveUsers (count)
  - StorageUsedGB (gauge)
  - HeartbeatAge (seconds since last heartbeat — derived)

X-Ray Tracing (Professional + Enterprise only):
  - ARIA Express app instrumented with AWS X-Ray SDK
  - Traces: API requests, Bedrock judge calls, scenario runs
  - Sampling: 5% (Professional), 10% (Enterprise)
```

#### Observability Terraform module

The tenant Terraform module (`tenant-module/`) includes a dedicated `observability.tf` file:

```hcl
# observability.tf (tenant-module)
resource "aws_cloudwatch_log_group" "aria" {
  name              = "/ecs/aria/${var.tenant_id}"
  retention_in_days = var.log_retention_days  # from pricing tier
  tags              = local.tenant_tags
}

resource "aws_cloudwatch_dashboard" "aria" {
  dashboard_name = "aria-${var.tenant_id}"
  dashboard_body = templatefile("${path.module}/dashboard.json.tpl", {
    tenant_id  = var.tenant_id
    region     = var.aws_region
    cluster    = aws_ecs_cluster.aria.name
    service    = aws_ecs_service.aria.name
    alb_arn    = aws_lb.aria.arn_suffix
    efs_id     = aws_efs_file_system.aria.id
  })
}

resource "aws_cloudwatch_metric_alarm" "task_stopped" {
  alarm_name          = "aria-${var.tenant_id}-task-stopped"
  comparison_operator = "LessThanThreshold"
  metric_name         = "RunningTaskCount"
  namespace           = "ECS/ContainerInsights"
  dimensions = {
    ClusterName = aws_ecs_cluster.aria.name
    ServiceName = aws_ecs_service.aria.name
  }
  threshold           = 1
  evaluation_periods  = 2
  period              = 60
  alarm_actions       = [aws_sns_topic.aria_alerts.arn]
  tags                = local.tenant_tags
}
```

#### Tag propagation for observability resources

All CloudWatch dashboards, alarms, log groups, and SNS topics created by the tenant module carry the full tag set from §9, including `aria:tenant_id`, `aria:company`, `aria:pricing_tier`, `aria:region`. This means:

- **AWS Console** — filter CloudWatch dashboards by `aria:company` tag to see a specific org's dashboard
- **Cost Explorer** — tag `aria:tenant_id` on log groups enables per-tenant observability cost attribution
- **AWS Resource Groups** — create a resource group per tenant to see all observability + compute in one view
- **CloudWatch Container Insights** — enabled on every ECS cluster; provides CPU/memory/network at task level, tagged to tenant

#### Dashboard access for tenant admins (future)

Phase 6+: tenant admins can be granted read-only access to their own CloudWatch dashboard via a pre-signed URL or embedded iframe in the ARIA Settings UI. IAM policy scoped to `Condition: { StringEquals: { "aws:ResourceTag/aria:tenant_id": "${tenant_id}" } }`.

---

### 4.9 God Mode — Internal Team Override

God Mode is a hidden, non-advertised override for internal development and QA teams that bypasses all tier limits, usage counters, suspend timers, and billing enforcement. It is **never shown or mentioned in any public UI, documentation, or marketing material**.

#### Activation

God Mode is activated by setting a secret environment variable on a running ARIA instance (or in the container at provision time for internal instances):

```javascript
ARIA_GOD_MODE=true
ARIA_GOD_MODE_TOKEN=<sha256-of-secret-passphrase>
```

Both must be set. `ARIA_GOD_MODE_TOKEN` is a SHA-256 hash of an internal passphrase managed in AWS Secrets Manager (key: `aria/internal/god-mode-token`). The ARIA app verifies the token at startup to prevent accidental activation via misconfiguration.

#### What God Mode bypasses

| Enforcement point | Normal behaviour | God Mode |
| --- | --- | --- |
| `MAX_SCENARIOS` | 403 over limit | No limit |
| `MAX_RUNS_PER_MONTH` | 402 over limit | No limit |
| `MAX_USERS` | 402 over limit | No limit |
| `MAX_STORAGE_GB` | 403 over limit | No limit |
| Auto-suspend heartbeat | Suspend after idle threshold | Never suspended |
| SSO enforcement | Cognito token required | Optional (backdoor still works) |
| Heartbeat emission | POSTs every 10 min | Disabled (no false heartbeat to control plane) |
| Package limit UI banners | Shown when approaching limits | Never shown |
| Trial expiry | Converts to Starter after 14 days | Never expires |
| Bedrock model restrictions | Tier-restricted judge model | Any model |

#### God Mode in the control plane

When the control plane provisions an internal instance (e.g., for CI pipelines or dev testing), it can inject God Mode variables:

```typescript
// In provisioner tfvars generator:
if (tenant.is_internal) {
  tfvars.god_mode = true;
  tfvars.god_mode_token = resolveFromSecretsManager('aria/internal/god-mode-token');
}
```

Internal tenants are identified by `aria_tenants.is_internal = true` — a field set only by the operator, never via the public sign-up flow.

#### God Mode visibility rules

- No UI indicator, banner, or label when God Mode is active
- ARIA logs a single line at startup: `[internal] extended access active` (deliberately vague)
- No reference to "God Mode" in any user-facing string, help text, or API response
- Control plane audit events do log `god_mode_active: true` for internal billing reconciliation — but this is visible only to operators, not tenants
- The `ARIA_GOD_MODE` env var is never returned by any API endpoint or included in any tenant-facing output

#### Internal CI use

For automated testing in CI/CD pipelines (GitHub Actions, etc.):

```yaml
# .github/workflows/e2e.yml
env:
  ARIA_GOD_MODE: "true"
  ARIA_GOD_MODE_TOKEN: ${{ secrets.ARIA_GOD_MODE_TOKEN }}
```

This allows CI to run unlimited scenario suites without hitting billing limits.

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
pricing_tier            string   free | individual | enterprise_starter | enterprise_pro | enterprise_unlimited
pricing_track           string   individual | enterprise
status                  string   PENDING | PROVISIONING | RUNNING | SUSPENDING | SUSPENDED | STARTING | FAILED
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
suspended_at            ISO8601
resumed_at              ISO8601
resume_started_at       ISO8601
suspend_warning_sent_at ISO8601  (null = reset each resume cycle)
suspend_threshold_hours number   defaults: free=1, all others=3, enterprise=configurable 1-24
trial_started_at        ISO8601  (null if not in trial)
trial_ends_at           ISO8601  (null if not in trial)
is_internal             boolean  operator-set only; never exposed via public API; enables God Mode
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

Plans are structured across two tracks: **Individual** (solo developers, small teams) and **Enterprise** (organisations, regulated industries). Both tracks include a progression from Free through paid tiers.

### Plan tracks overview

```javascript
INDIVIDUAL TRACK              ENTERPRISE TRACK
+------------------+          +----------------------+
| Free             |          | Enterprise Starter   |
| (always free)    |          | (team use)           |
+------------------+          +----------------------+
| Individual       |          | Enterprise Pro       |
| (paid solo)      |          | (department-wide)    |
+------------------+          +----------------------+
                              | Enterprise Unlimited |
                              | (org-wide)           |
                              +----------------------+
```

---

### Free Plan (Individual Track — Always Free)

The Free Plan is a **permanent free tier**, not a trial. It gives individual developers full access to ARIA's feature set with strict limits that cap infrastructure cost to near-zero. No credit card required. No expiry.

**Hard limits (enforced by platform; cannot be overridden by user):**

| Limit | Value | Reason |
| --- | --- | --- |
| Scenarios | 5 total | Prevents runaway scenario creation |
| Runs per month | 10 | Caps Bedrock judge invocations |
| Turns per run | 5 | Limits transcript size |
| Users per instance | 1 (owner only) | Prevents team abuse of free tier |
| Storage | 500 MB | Caps EFS + S3 cost |
| Transcript retention | 7 days | Auto-deleted after 7 days |
| Judge model | Claude Haiku only | Lowest cost judge |
| Providers | OpenAPI only | Limits scope |
| Deployment regions | Europe — London or US East (one choice, fixed at sign-up) | One region only |
| Auto-suspend threshold | 1 hour | Aggressive to minimise idle cost |
| Observability | Basic (CloudWatch logs only; no dashboard, no alarms) | Reduces CloudWatch cost |
| Concurrent runs | 1 | No parallel execution |

**What Free users CAN do (full feature access within limits):**

- Use all scenario types (functional, adversarial, escalation, edge, security)
- Use all judge dimensions and all judge configuration options
- View full transcripts and judge reports
- Use the judge system prompt editor
- Access the settings UI (all tabs)
- Export run reports (within retention window)

**What triggers an upgrade prompt:**

- Attempting to create a 6th scenario → prompt to upgrade
- Attempting to start run 11 in a month → prompt to upgrade
- Attempting to invite a user → prompt to upgrade

**Free plan infrastructure cost (to platform):**

- ECS 512 CPU / 512 MB (smallest viable) — \~$6.30/month running 24/7
- With 1h auto-suspend, \~2h/day avg active → \~$0.84/month
- EFS: 500 MB → $0.03/month
- Platform absorbs this cost per free user; break-even is \~6 free users converting to paid per 100 free users

---

### Individual Plan (Individual Track — Paid)

For solo developers, security researchers, and consultants evaluating AI agents professionally.

| Feature | Value |
| --- | --- |
| **Price** | $49/month or $470/year (20% off) |
| **Scenarios** | 100 total |
| **Runs per month** | 1,000 |
| **Turns per run** | 20 |
| **Users per instance** | 1 (owner only — individual use) |
| **Storage** | 10 GB |
| **Transcript retention** | 90 days |
| **Judge model** | Claude Haiku or Sonnet (user choice) |
| **Providers** | All providers |
| **Deployment regions** | Europe — London, US East (2 regions) |
| **Auto-suspend** | 3 hours |
| **Observability** | CloudWatch logs + dashboard |
| **SLA** | Best effort |
| **ECS resources** | 512 CPU / 1GB |

---

### Enterprise Starter (Enterprise Track)

For small engineering teams (up to 10 users) evaluating AI agents across a project or department.

| Feature | Value |
| --- | --- |
| **Price** | $199/month or $1,910/year |
| **Scenarios** | 500 total |
| **Runs per month** | 5,000 |
| **Turns per run** | Unlimited |
| **Users per instance** | 10 |
| **Storage** | 50 GB |
| **Transcript retention** | 180 days |
| **Judge model** | Claude Sonnet |
| **Providers** | All providers |
| **Deployment regions** | All 8 regions |
| **Auto-suspend** | 3 hours |
| **Observability** | Full (dashboard + alarms + 90-day log retention) |
| **SLA** | 99.5% uptime |
| **ECS resources** | 1024 CPU / 2GB |
| **X-Ray tracing** | Yes (5% sampling) |

---

### Enterprise Pro (Enterprise Track)

For larger engineering organisations needing higher throughput, HA, and compliance-grade observability.

| Feature | Value |
| --- | --- |
| **Price** | $599/month or $5,750/year |
| **Scenarios** | 2,000 total |
| **Runs per month** | 20,000 |
| **Turns per run** | Unlimited |
| **Users per instance** | 50 |
| **Storage** | 200 GB |
| **Transcript retention** | 365 days |
| **Judge model** | Claude Sonnet + Haiku (configurable per run) |
| **Providers** | All + priority support |
| **Deployment regions** | All 8 regions |
| **Auto-suspend** | Configurable (1–24h) |
| **Observability** | Full + X-Ray (10% sampling) + CloudWatch Insights |
| **SLA** | 99.9% uptime |
| **ECS resources** | 2048 CPU / 4GB |
| **AWS WAF** | Yes |
| **Dedicated subdomain** | Yes |
| **Fine-tune pipeline** | Yes |

---

### Enterprise Unlimited (Enterprise Track)

For large enterprises needing organisation-wide deployment with no usage caps and full white-glove support.

| Feature | Value |
| --- | --- |
| **Price** | Custom / negotiated annually |
| **Scenarios** | Unlimited |
| **Runs per month** | Unlimited |
| **Users per instance** | Unlimited |
| **Storage** | 1 TB+ (configurable) |
| **Transcript retention** | Configurable (up to 7 years for compliance) |
| **Judge models** | Any Bedrock model including fine-tuned |
| **Providers** | All + custom |
| **Deployment regions** | All 8 regions + custom region on request |
| **Auto-suspend** | Configurable or disabled |
| **Observability** | Full + dedicated CloudWatch account if required |
| **SLA** | 99.9% + dedicated support + 4-hour incident response |
| **ECS resources** | Configurable (up to 8192 CPU / 16GB) |
| **AWS WAF** | Yes + custom rules |
| **Custom domain** | Yes |
| **Dedicated AWS account** | Optional (isolate from other tenants entirely) |
| **Fine-tune pipeline** | Yes |
| **SAML/SSO integration** | Yes (replaces Cognito for enterprise IdP) |

---

### Pricing tier → internal key mapping

| Display Name | Internal `pricing_tier` key | Track |
| --- | --- | --- |
| Free | `free` | individual |
| Individual | `individual` | individual |
| Enterprise Starter | `enterprise_starter` | enterprise |
| Enterprise Pro | `enterprise_pro` | enterprise |
| Enterprise Unlimited | `enterprise_unlimited` | enterprise |

---

### Free trial

- Any paid plan can be trialled for **14 days** from sign-up
- No credit card required during trial
- Full access to that plan's features and limits during trial
- At day 14: if no payment method added, account downgrades to Free plan (not deleted)
- Trial reminder emails at day 7 and day 13

---

### Add-ons (all paid plans)

- Additional storage: $5/GB/month
- Additional runs: $0.10/run over limit (not available on Free)
- Dedicated AWS account: custom pricing (Enterprise Unlimited only)
- Priority provisioning (< 5 min SLA): +$50/month

---

### Plan limit enforcement in `aria_tenants`

The following fields are written to DynamoDB at provision time and injected as env vars into the ARIA instance:

```javascript
pricing_tier          string    "free" | "individual" | "enterprise_starter" | ...
pricing_track         string    "individual" | "enterprise"
MAX_SCENARIOS         number
MAX_RUNS_PER_MONTH    number    (-1 = unlimited)
MAX_TURNS_PER_RUN     number    (-1 = unlimited)
MAX_USERS             number    (-1 = unlimited)
MAX_STORAGE_GB        number
MAX_CONCURRENT_RUNS   number
LOG_RETENTION_DAYS    number
suspend_threshold_hours number
```

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

Every AWS resource in the tenant Terraform stack is tagged — including observability resources (CloudWatch log groups, dashboards, alarms, SNS topics):

| Tag Key | Value | Source |
| --- | --- | --- |
| `aria:tenant_id` | `ten-abc123xyz` | DynamoDB -> tfvars |
| `aria:company` | `Acme Corp` | Sign-up form -> tfvars |
| `aria:admin_email` | `admin@acme.com` | Sign-up form -> tfvars |
| `aria:pricing_tier` | `enterprise_starter` | Selected tier -> tfvars |
| `aria:pricing_track` | `enterprise` | Derived from tier -> tfvars |
| `aria:instance_id` | `inst-def456uvw` | Generated at provision time |
| `aria:provisioned_at` | `2026-06-05T09:00:00Z` | Terraform timestamp |
| `aria:region` | `eu-west-2` | Customer's chosen region (AWS code) |
| `aria:region_display_name` | `Europe — London` | Customer's chosen region (display) |
| `aria:environment` | `saas-prod` | Fixed |
| `aria:resource_type` | `compute` / `observability` / `storage` / `network` | Per-resource category |
| `Project` | `aria-evaluator` | Fixed |
| `ManagedBy` | `terraform` | Fixed |
| `CostCenter` | `<tenant_id>` | Per-tenant cost attribution |

**AWS Cost Explorer groupings:**

- Group by `aria:tenant_id` → per-tenant total cost
- Group by `aria:region` → cost by deployment region
- Group by `aria:pricing_tier` → revenue vs cost analysis per tier
- Group by `aria:resource_type` → compute vs observability vs storage split per tenant

**AWS Resource Groups:**
A Resource Group `aria-tenant-<tenant_id>` can be created with tag filter `aria:tenant_id = <tenant_id>` to show all resources (compute, observability, storage, network) for a tenant in one view.

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
| 1.1 | Cognito User Pool + App Client |
| 1.2 | DynamoDB tables: aria\\\\\\_tenants (with new fields), aria\\\\\\_users, aria\\\\\\_usage, aria\\\\\\_sso\\\\\\_tokens, aria\\\\\\_events |
| 1.3 | Control plane API: auth endpoints (register, confirm, login, refresh, forgot/reset) |
| 1.4 | Control plane API: tenant endpoints (me, provision/status, suspend, resume) |
| 1.5 | Control plane API: user management endpoints |
| 1.6 | Control plane API: `/regions` + `/packages` public endpoints |
| 1.7 | SSO token issuer (RS256 key pair in Secrets Manager) |
| 1.8 | SQS FIFO queue + provisioning job schema |
| 1.9 | EventBridge + SuspendCheckLambda — full state machine (RUNNING -> SUSPENDING -> SUSPENDED) |
| 1.10 | Free plan enforcement: `is_internal` flag, pricing\\_track field, tier limit constants |

### Phase 2 — ARIA Instance Modifications (Weeks 2–3)

| Task | Description |
| --- | --- |
| 2.1 | `GET /auth/sso?token=<jwt>` — verify + session + backdoor fallback |
| 2.2 | Heartbeat background job (10-min, HMAC signed) |
| 2.3 | All plan limit env vars + enforcement at each check point |
| 2.4 | Usage bar UI in ARIA settings/dashboard |
| 2.5 | Admin bootstrap from `INITIAL_ADMIN_EMAIL` |
| 2.6 | `SAAS_MODE` env var gate |
| 2.7 | User invite flow linking back to main website |
| 2.8 | **God Mode**: `ARIA_GOD_MODE` + `ARIA_GOD_MODE_TOKEN` env var check at startup; bypass all limits when active; no UI indicator |
| 2.9 | `/health` endpoint for ALB health checks (must respond 200 within 5s) |

### Phase 3 — Tenant Provisioner + Observability (Weeks 3–4)

| Task | Description |
| --- | --- |
| 3.1 | Provisioner Docker container: SQS consumer + terraform wrapper |
| 3.2 | `tenant-module` Terraform wrapping existing prod modules |
| 3.3 | `observability.tf` in tenant-module: CloudWatch log group, dashboard, alarms, SNS topic — all tagged |
| 3.4 | Dashboard template (`dashboard.json.tpl`): ECS CPU/memory, ALB metrics, EFS, custom ARIA metrics |
| 3.5 | X-Ray instrumentation in ARIA Express app (disabled on Free/Individual, 5% on Enterprise Starter, 10% on Enterprise Pro+) |
| 3.6 | Per-tenant tfvars generator with all new fields (aws\\_region, pricing\\_tier, pricing\\_track, log\\_retention\\_days, is\\_internal, god\\_mode vars) |
| 3.7 | Multi-region state backend config |
| 3.8 | `/internal/provision/complete` + `/failed` handlers |
| 3.9 | SuspendCheckLambda: full SUSPENDING->SUSPENDED transition with ECS drain check |
| 3.10 | God Mode provisioner path: inject `ARIA_GOD_MODE` vars for `is_internal=true` tenants |

### Phase 4 — Website (Weeks 4–6)

| Task | Description |
| --- | --- |
| 4.1 | Next.js project scaffold with static export |
| 4.2 | Hero / Marketing pages (Tailwind + shadcn/ui) |
| 4.3 | PricingTable component (Individual + Enterprise tracks, Free plan, annual toggle) |
| 4.4 | Sign-up flow: 4-step form — details, plan (track selector), region (RegionSelector), confirm |
| 4.5 | Sign-in + Cognito integration |
| 4.6 | Dashboard: InstanceStatusCard (shows region + status), ProvisionProgress (SSE), UsageBar |
| 4.7 | InstanceStatusCard: SUSPENDING state + "workspace suspended" page on CloudFront 503 |
| 4.8 | User management UI |
| 4.9 | Billing page |
| 4.10 | CloudFront + S3 deployment Terraform |

### Phase 5 — Multi-Region Bootstrap (Week 6)

| Task | Description |
| --- | --- |
| 5.1 | Bootstrap S3 state buckets in all 8 regions |
| 5.2 | Bootstrap DynamoDB lock tables in all 8 regions |
| 5.3 | Provision wildcard ACM certs (`*.ariaeval.io`) in all 8 regions (for ALB use) |
| 5.4 | ECR cross-region replication |
| 5.5 | Bootstrap CloudWatch alarm SNS topics (operator alerts) in all 8 regions |
| 5.6 | End-to-end provisioning test in each supported region |
| 5.7 | God Mode Secrets Manager key (`aria/internal/god-mode-token`) seeded in all regions |

### Phase 6 — Payments, Polish, Launch (Weeks 7–9)

| Task | Description |
| --- | --- |
| 6.1 | Stripe Checkout integration (Individual + Enterprise tracks, annual toggle) |
| 6.2 | Billing webhooks: Stripe -> control plane -> tier upgrade/downgrade |
| 6.3 | Trial expiry flow: reminder emails at day 7 + 13; downgrade to Free at day 14 |
| 6.4 | Email sequences: welcome, provisioning complete, 30-min suspend warning, limit warnings |
| 6.5 | CloudWatch operator dashboards: provisioning success rate, suspend events, cross-tenant metrics |
| 6.6 | Load testing: 10 concurrent provisioning jobs across 3 regions |
| 6.7 | Security review: IAM boundary analysis, God Mode token rotation, cross-tenant access testing |
| 6.8 | Terms of service, privacy policy, cookie notice |
| 6.9 | Custom domain support (Enterprise Unlimited) |
| 6.10 | Tenant admin CloudWatch dashboard embedded view (pre-signed URL in ARIA Settings) |

---

## 16. Open Decisions

| ID | Topic | Decision |
| --- | --- | --- |
| OD-1 | Control plane deployment | **Lambda + API Gateway** — lower cost at early scale; swap to ECS if p99 latency is an issue |
| OD-2 | ALB sharing | **Shared ALB for Free/Individual** (host-based routing), **per-tenant ALB for Enterprise** |
| OD-3 | Terraform state backend | **S3 in same account** initially; dedicated account option for Enterprise Unlimited |
| OD-4 | SQLite storage | **EFS** — preserves existing ARIA design; RDS only if multi-writer needs arise |
| OD-5 | Payment processor | **Stripe** — fastest integration, global support |
| OD-6 | Website rendering | **Static export** — CloudFront delivery; SSR only if personalised pages needed |
| OD-7 | Tenant slug collision | **Auto-generated from company name + 6-char hash** |
| OD-8 | Suspend grace period | **Free: 1h; Individual + Enterprise Starter/Pro: 3h; Enterprise Unlimited: configurable 1–24h** |
| OD-9 | Region availability per tier | **Free + Individual: eu-london + us-east; Enterprise Starter+: all 8 regions** |
| OD-10 | Region migration | **Roadmap only** — region is immutable after provisioning in V1 |
| OD-11 | Free plan infrastructure | **Smallest ECS Fargate (512 CPU/512MB)** + 1h auto-suspend; platform absorbs \\~$1/month per free user |
| OD-12 | God Mode visibility | **Completely hidden from UI and public API**; operator-only audit log entry |
| OD-13 | Observability tier differentiation | **Free: logs only; Individual: logs + dashboard; Enterprise: full (dashboard + alarms + X-Ray)** |

---

*End of design document. Awaiting Phase 1 implementation sign-off.*