# ARIA Evaluator — Multi-Tenant Architecture Spec & Plan

Status: **draft / in progress** · Owner: platform · Last updated: 2026-06-16

This document specifies the migration of `aria-evaluator-app` from a
**one-dedicated-stack-per-customer** model (provisioned by the control-plane via
CodeBuild) to a **shared multi-tenant platform** with **per-tenant compute
isolation** and an autoscaling, concurrent database.

The control-plane **signup, signin, OAuth, and dashboard UI stay unchanged.**
Only the provisioning/handoff logic behind the dashboard changes.

---

## 1. Decisions (locked)

| # | Decision | Choice |
|---|----------|--------|
| Customers | Migrate existing customers? | **No — greenfield.** No data migration / ETL. |
| Database | Engine | **Aurora Serverless v2 (PostgreSQL)** for **dev + prod**; **SQLite** for **local**. |
| Compute | Noisy-neighbour strategy | **Per-tenant ECS service** inside one shared stack + **run/scenario quotas** + per-tenant autoscaling. |
| Isolation | Data isolation | **Pooled** shared Aurora with **row-level `tenantId`** scoping (defense-in-depth), per-tenant compute. |
| Calibration data | Tenant-scoped vs global | `CalibrationDataset`/`Label` **tenant-scoped**; LMSYS `Pairwise*` **global benchmark** (no tenantId). *(confirm)* |

---

## 2. Today vs. target

### Today (instance-per-customer)
- Control-plane (`src/control-plane/server.ts`) signup → `POST /tenant/provision` →
  CodeBuild → `terraform apply` of `modules/tenant-module` = a **full dedicated
  stack per customer** (VPC, ALB, ECS svc `desired=1`, S3, EFS, CloudFront,
  suspend/resume lambdas).
- Evaluator DB = **SQLite file synced to S3 every 30s** (`infra/docker/ecs-entrypoint.sh:21,45`)
  — single-writer, fundamentally one task.
- **No tenant concept** in the schema; each DB implicitly belongs to one customer.
- Artifacts (reports/transcripts/audio/scenarios/run-logs/settings) on **local FS**.
- Dashboard "Open Workspace" → `POST /instance/sso-token` → redirect to
  `{instanceUrl}/auth/sso?token=` → evaluator verifies vs control-plane and
  upserts a local `User`. **`tenantId` is passed by SSO but discarded**
  (`src/api/auth.ts:1220,1269`).

### Target (shared stack, per-tenant compute, pooled data)
```
   Customer ──signup/signin/dashboard──▶ Control-plane (UI unchanged)
                                          • creates Tenant (+ per-tenant ECS svc)
                                          • "Open" → mints SSO token, 302 → tenant route
                                                     │
            ┌──────────────────── ONE SHARED STACK ──┼───────────────────────────┐
            │  Route53 / ALB ──(host or path per tenant)──▶ per-tenant target grp  │
            │      │                                                                │
            │      ▼                                                                │
            │  ECS Fargate: ONE SERVICE PER TENANT (own tasks, own autoscaling)     │
            │      │  every request carries tenantId (per-service env or SSO)       │
            │      ▼                                                                 │
            │  Prisma (auto-scoped by tenantId) ──▶ Aurora Serverless v2 (Postgres) │
            │  Artifacts ──▶ S3 (s3://bucket/<tenantId>/…)                          │
            │  Sessions/queue/SSE/leader-locks ──▶ Redis (mandatory)               │
            └──────────────────────────────────────────────────────────────────────┘
```

**Why this shape:** the expensive, slow-to-provision infra (VPC, ALB, Aurora,
Redis, S3, observability) is shared and stood up **once**. Each tenant gets a
**cheap, fast ECS service** for compute isolation. Data is pooled in Aurora with
row-level `tenantId` so a shared admin/analytics surface is still possible and so
the DB scales as one (Aurora SS v2 autoscales ACUs with load).

**Tenant scaling limits to respect:** ECS services per cluster, ALB rules/target
groups per ALB (~100/listener), and Aurora connections. Per-tenant ECS suits
tens–low-hundreds of tenants. Beyond that, fall back to a shared autoscaling
service (the row-level scoping already supports it).

---

## 3. Tenancy model

**Pooled DB + row-level `tenantId`.** A new `Tenant` table is the root; every
tenant-owned row carries (directly or via a denormalized column) a `tenantId`.

**Enforcement = three layers:**
1. **Request-scoped tenant context** (`AsyncLocalStorage`) set by auth middleware —
   sourced from the per-tenant service's `TENANT_ID` env (model: per-tenant ECS)
   or the SSO claim (model: shared service).
2. **Central Prisma guard** in `src/db/client.ts` — auto-injects
   `where: { tenantId }` on reads / `data: { tenantId }` on writes for scoped models.
   *(Phase 0 ships this guard in **log-only** mode; enforcement lands in Phase 3.)*
3. **Per-route guards** on every `findUnique/findFirst`-by-id (e.g.
   `runs.ts:364,389`, `/api/runs/compare`) so a guessed id can't cross tenants.

**Uniqueness:** global `@unique` (`User.username`, `Scenario.filePath`,
`Schedule.name`, …) → composite `@@unique([tenantId, …])`.

### Models that get a direct `tenantId` (tenant roots)
`User`, `Scenario`, `Run`, `Baseline`, `Experiment`, `Schedule`, `AuditLog`,
`AuthSession`, `CalibrationDataset`.

### Child rows (inherit tenant via parent FK; denormalize on hot paths)
- via `Run`: `Job`, `RunEvent`, `Turn`, `EvalResult`, `RunTelemetry`,
  `SecurityAttack`, `Report`
- via `EvalResult`→`Run`: `Review` (denormalize `tenantId` for the queue)
- via `Scenario`: `ScenarioRevision`
- via `Experiment`: `ExperimentLeg`, `ExperimentRun`
- via `Schedule`: `ScheduleRun`
- via `CalibrationDataset`: `CalibrationLabel`, `JudgeCalibration`

### Global / not tenant-scoped
`BootstrapState` (install singleton); `PairwiseDataset/Item/Verdict/Calibration`
(LMSYS public benchmark — shared judge calibration). **Confirm** whether pairwise
should be per-tenant.

---

## 4. Noisy-neighbour mitigations

1. **Per-tenant ECS service** — one tenant's heavy run load cannot starve
   another's API/worker CPU (separate tasks).
2. **Run & scenario quotas** (per tenant, enforced before queueing — extends the
   existing `checkRunQuota()`):
   - max **concurrent runs** per tenant,
   - max **scenarios per run**,
   - max **turns per run** / max conversation length,
   - daily/monthly **run budget**.
   Quota fields live on `Tenant` (added with the quota work).
3. **Per-tenant ECS autoscaling** (target-tracking on CPU/memory/req-count — the
   policy already exists, just disabled: `modules/ecs/main.tf:202`).
4. **Aurora Serverless v2 autoscaling** — DB compute (ACUs) scales with load, so
   the shared DB absorbs spikes; pair with per-tenant connection caps via RDS Proxy.

---

## 5. What changes, by area

### A. Database (the gating change)
- Stand up **Aurora Serverless v2 PostgreSQL** (dev + prod) + **RDS Proxy**
  (autoscaled tasks × Prisma pool will exhaust raw connections).
- `prisma/schema.prisma` provider → `postgresql` for dev/prod; **local keeps
  SQLite**. Prisma can't `env()` the provider, so local uses a provider swap
  (the local entrypoint already runs `db push`; it will `sed` the provider to
  `sqlite` before pushing, or use a `schema.local.prisma`). *(finalized in Phase 1)*
- `ecs-entrypoint.sh`: drop the S3 restore/sync loop and the `file:` URL;
  `DATABASE_URL` → Aurora; keep `migrate deploy` (already in place).

### B. Data isolation — see §3.

### C. Artifacts: local FS → S3
reports, transcripts, audio, run logs, scenarios, `runtime-settings.json` →
`s3://bucket/<tenantId>/…` via SDK. Touches `src/runtime/paths.ts`,
`src/report/generator.ts`, `src/conversation/runner.ts`,
`src/adapters/connect-voice.ts`, `src/jobs/run-logs.ts`,
`src/api/runtime-settings.ts`, and the `reports`/`scenarios`/`runs` routes.

### D. Auth & tenant propagation (SSO flow preserved)
- Persist `tenantId` on `User` in `upsertSsoUser` (`auth.ts:1162`) — the claim is
  already returned by control-plane `/auth/verify-sso-token` (`server.ts:1602`).
- Add `tenantId` to `AuthContext` (`auth.ts:48`), set the `AsyncLocalStorage`
  context in `attachAuthContext` (`auth.ts:531`), cache it in Redis.
- Non-SSO paths (password/bootstrap/default-admin) resolve to the per-service
  `TENANT_ID` or a system tenant.

### E. Multi-instance safety
- **Scheduler + heartbeat** (`src/jobs/schedule-executor.ts`, `heartbeat.ts`):
  add **leader election** (Redis lock or Postgres advisory lock /
  `FOR UPDATE SKIP LOCKED`) so only one task fires per tenant.
- **Jobs** thread `tenantId` through `Job.payloadJson` (workers run outside the
  request context).
- **SSE** (`src/api/sse-bus.ts`): make Redis pub/sub **mandatory** (today it
  silently falls back to local-only); optional ALB stickiness.

### F. Infra & autoscaling
- One shared stack (VPC, ALB, Aurora, Redis, S3, observability) provisioned once.
- Per-tenant **ECS service + target group + ALB routing rule** (host- or
  path-based) — created on tenant creation (terraform `for_each` over tenants, or
  control-plane via the ECS SDK).
- Retire per-tenant **suspend/resume lambdas** and per-tenant **CodeBuild**.

### G. Control-plane (UI unchanged)
- `POST /tenant/provision` → create a `Tenant` row + a per-tenant ECS service in
  the shared cluster (no VPC/ALB/CloudFront/RDS/lambda per tenant); mark `running`
  pointing at the tenant's shared-stack route.
- SSO-token minting / "Open Workspace" unchanged; `instanceUrl` = the tenant's
  route on the shared ALB.
- `DELETE /account` → tenant **data purge** (delete rows by `tenantId` + tear down
  the one ECS service), not `terraform destroy` of a whole stack.

---

## 6. Phased plan

- **Phase 0 — Tenant scaffolding (dormant). ✅ DONE**
  `Tenant` model + nullable `tenantId` columns, `AsyncLocalStorage` tenant context,
  and the Prisma scoping guard in **log-only** mode (`TENANT_SCOPING_MODE`, default
  off). No behavior change.
- **Phase 1 — PostgreSQL / Aurora. ✅ DONE.** Aurora SS v2 module + RDS Proxy;
  Postgres everywhere (local container, dev wired to Aurora via a DATABASE_URL
  secret); entrypoint off SQLite-on-S3. (Shared prod Aurora wiring lands with the
  Phase 5 shared stack.)
- **Phase 2 — Run artifacts to S3. ✅ DONE (artifact scope).** `ObjectStore`
  abstraction; reports/transcripts/audio served from + written directly to the
  object store (multi-instance-safe). **Scenarios and runtime settings (sync-FS
  subsystems) and removing the whole-dir state sync are moved to Phase 4** — they
  need a sync→async / cache refactor and are low-churn config, so the existing
  state sync covers them in the interim.
- **Phase 3 — Enforce tenancy. ◀ IN PROGRESS.** ✅ Tenant flows SSO →
  `AuthContext` → ALS (persisted on `User`/`Tenant`). ✅ `enforce` mode in the
  Prisma guard — auto-scopes filterable reads/writes + stamps creates; verified
  cross-tenant isolation against Postgres; default **off**. **Remaining before
  turning `enforce` on in prod:** per-route id guards (findUnique/upsert),
  composite `@@unique([tenantId, …])` on `Scenario.filePath`/`Schedule.name`/etc.,
  a system tenant for non-SSO surfaces, and **job-payload `tenantId` (Phase 4)** so
  background jobs scope correctly (today they run unscoped as trusted system work).
  Enforcement requires the Prisma op to be awaited within the ALS context — the
  request flow satisfies this.
- **Phase 4 — Quotas + multi-instance safety + remaining state. ◀ IN PROGRESS.**
  ✅ Leader election for scheduler/heartbeat (Redis per-tick lock — only one
  instance polls/emits per interval). ✅ Run-worker and schedule execution bound
  to their run/schedule tenant (`runWithTenant`), so background DB access scopes
  correctly under enforce. Per-tenant **quotas** then fall out of enforce (the
  guard auto-scopes `checkRunQuota`'s count queries to the bound tenant) plus
  per-tenant ECS env limits — no separate quota engine needed. ✅ Runtime settings
  shared via a DB row (`RuntimeSettings`, synchronous file read cache +
  write-through + periodic refresh). Redis is already effectively mandatory (SSE
  uses Redis pub/sub for cross-instance delivery; the readiness probe gates on it).
  ✅ Report and transcript **listings are DB-driven** (`Report` / `TranscriptArtifact`
  rows; no FS scan) and artifacts are served from the object store. ✅ With those
  done, the former **whole-directory state sync is narrowed to the `scenarios/`
  prefix** — every other piece is now in Postgres or the object store.
  ✅ **Scenario inversion** — scenarios are now **DB-authoritative**
  (`src/conversation/scenario-store.ts`). The bundled YAML seeds the **global
  library** (`tenantId = null`) at startup — idempotent, with deterministic ids
  derived from the source ref since bundled docs ship without a `scenario_id`.
  Listing, run-creation, raw-fetch, and create/edit/metadata all read/write the
  `Scenario` table, tenant-scoped: a caller sees **global ∪ own**, and a tenant's
  edit of a global scenario writes an own-tenant **copy that shadows the global**
  (copy-on-write via the guard). Per-tenant scenarios are **DB-only** — they never
  touch the shared FS (a tenant write would otherwise be re-imported as a global
  and leak across tenants), so the `scenarios/` S3 sync now only carries the global
  (bundled + admin-authored) library as a reseed source; the DB is the read
  authority. File writes are gated to the admin/system context.
- **Phase 5 — Per-tenant ECS + autoscaling infra.** ✅ *Terraform landed
  (validated, not applied).* `modules/platform` is the shared stack — one VPC, one
  ALB (wildcard `*.<domain>` cert + default-404; tenants add a host-header rule),
  one Aurora Serverless v2 (RDS Proxy on), one ECS cluster, one Redis, reusing the
  `networking`/`aurora`/`iam` modules. `modules/tenant-service` is the per-tenant
  compute — task def + target group + host-header listener rule + ECS service +
  autoscaling, `DATABASE_URL` from the shared Aurora secret. Routing is host-based
  (`<tenant>.<domain>`); idle is **scale-to-zero** (`min_capacity=0`, `desired=0`),
  with the control-plane waking a tenant on login (`desired=1`, Phase 6) since ALB
  traffic can't scale a 0-task service — `platform` ships the `ecs:UpdateService`
  permission for that. The suspend/resume lambdas are unused by this path.
  `environments/platform-dev` is a validate-only reference composing it for 2 example
  tenants. (Not applied to dev/prod — user-driven.)
- **Phase 6 — Control-plane.** ✅ *App + IAM landed (validated, not applied).* The
  control-plane provisions per-tenant compute via the **AWS SDK directly** (no
  CodeBuild): `src/control-plane/tenant-provisioner.ts` does
  RegisterTaskDefinition → CreateTargetGroup → CreateRule (host `<tenant>.<domain>`,
  allocated priority) → CreateService (desired=0) → RegisterScalableTarget(min=0),
  and `wakeTenantService` (UpdateService desired=1 on login, since ALB can't scale a
  0-task service). Instance URLs are **host-based**. On delete,
  `deprovisionTenantService` removes the service/TG/rule and
  `src/control-plane/tenant-purge.ts` purges the tenant's Postgres rows (by
  `tenantId`, resolved from `Tenant.externalId`) + object-store prefix — verified
  locally against the local Postgres (purge + isolation). `modules/platform` grants
  the control-plane role the provisioning + purge IAM (and optional control-plane SG
  → Aurora ingress). Gated by `PLATFORM_ECS_CLUSTER` (absent ⇒ local mode).
  *Remaining wiring (mechanical, unapplied):* the control-plane environment Terraform
  must inject the platform outputs as the `PLATFORM_*` task env (see
  `tenant-provisioner.ts` `loadConfig()` for the contract) + `DATABASE_URL` secret.
- **Phase 7 — Decommission.** ✅ *Done (validated).* Deleted the now-unused
  full-stack-per-tenant infra: the `tenant-module`, `provisioning-codebuild`,
  `provisioning-lambda`, and `suspend-lambda` modules, the `environments/prod` root
  that instantiated them, the `user_instances` DynamoDB table + CodeBuild IAM/env/
  outputs in the control-plane envs, and the dead CodeBuild code in
  `src/control-plane/server.ts` (the `@aws-sdk/client-codebuild` dep, the build-poll
  branches in `/tenant/provision/status`, `/tenant/reprovision`,
  `/account/delete/status`, now CodeBuild-free). `control-plane-dev` and
  `control-plane-prod` `terraform validate` clean; lint + build pass. (No data
  migration — greenfield.) The shared platform (`modules/platform` +
  `modules/tenant-service`) + control-plane SDK provisioning are the whole story now.
  *Follow-up (docs only):* a few READMEs still mention the removed modules.

**Migration complete.** Phases 0–7 are done: a shared, pooled multi-tenant platform
with row-level isolation, DB-authoritative scenarios, per-tenant scale-to-zero ECS,
and control-plane SDK provisioning + data-purge — replacing the dedicated-stack-per-
customer model.

---

## 7. Hard problems / risks
1. **Cross-tenant leakage** — id-only lookups are the real risk; the Prisma guard
   + per-route guards must be airtight, with tests asserting tenant A ≠ tenant B.
2. **Connection pooling** — autoscaled tasks need RDS Proxy or the Aurora
   connection limit is hit.
3. **Provider divergence** — SQLite local vs Postgres dev/prod means migrations
   diverge; mitigated by `db push` locally + `migrate deploy` on Postgres.
4. **ECS/ALB per-tenant limits** — see §2; bounded to tens–low-hundreds of tenants.

---

## 8. Open items to confirm
- Pairwise/LMSYS tables: **global** (assumed) or per-tenant?
- Tenant routing: **host-based** (`<tenant>.eval.example.com`) or **path-based**
  (`/t/<tenant>/`)?
- Tenant context source for per-tenant ECS: **per-service `TENANT_ID` env**
  (assumed) vs per-request SSO claim.

---

## 9. Testing tenant isolation locally

The local stack runs `TENANT_SCOPING_MODE=enforce` by default
(`environments/local/variables.tf:tenant_scoping_mode`). The **default-admin login
is non-SSO → the system context → unrestricted**, so to *see* isolation you need
**tenant-bound (SSO) sessions**. Two ways:

### Prerequisite — re-apply the local stack onto Postgres
The pre-Postgres container won't work. Apply once to get the `aria-postgres-local`
container, rebuild the app image (now multi-tenant + enforce), and switch the DB:
```bash
terraform -chdir=infra/terraform/environments/local apply
```
(Drops the old local SQLite data — greenfield, as agreed.) The app may restart
once while Postgres boots.

### Option 2 — dev harness (fastest, no control-plane)
Mints two simulated SSO tenant users + session cookies directly in the DB:
```bash
DATABASE_URL='postgresql://aria:aria@localhost:5432/aria?schema=public' \
  npx tsx scripts/dev-tenant-sessions.ts
```
It prints `aria_session=<token>` cookies + a curl per tenant. Each cookie sees only
its own runs/scenarios/reports; create data as one and confirm the other can't see it.

### Option 1 — real SSO flow (control-plane on :4000)
The local control-plane (`aria-control-plane-local`, port 4000) provisions with no
CodeBuild (status flips to `running`) and shares an **empty** internal secret with
the evaluator (keep `control_plane_internal_secret = ""` on both — setting only one
side causes a 401). Create two tenants and SSO in:
```bash
CP=http://localhost:4000
for n in 1 2; do
  T=$(curl -s -X POST $CP/auth/register -H 'Content-Type: application/json' \
    -d "{\"name\":\"Tenant $n\",\"email\":\"t$n@aria.local\",\"password\":\"Passw0rd!\"}" | jq -r .token)
  curl -s -X POST $CP/tenant/provision -H "Authorization: Bearer $T" -H 'Content-Type: application/json' \
    -d '{"plan":"individual","region":"eu-west-2","billingPeriod":"monthly"}' | jq '{tenantId,status}'
  # then mint + open the SSO link (do each in a SEPARATE incognito window):
  curl -s -X POST $CP/instance/sso-token -H "Authorization: Bearer $T" | jq -r .ssoUrl
done
```
Open each `ssoUrl` (→ `http://localhost:3001/auth/sso?token=…`) in its own incognito
window; the evaluator upserts a `User` with that tenant and scopes the session.
Tokens are one-time + 15 min — re-mint per login.
