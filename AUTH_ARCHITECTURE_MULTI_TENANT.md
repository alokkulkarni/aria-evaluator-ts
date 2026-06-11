# Multi-Tenant Auth Architecture - Phase 1 Scope

**Status**: Clarifying the role of social login and auth changes across the platform  
**Architecture**: Multi-tenant SaaS with separate applications

---

## Platform Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                   ARIA Evaluator Platform                   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────┐  ┌──────────────────┐                │
│  │ WEBSITE          │  │ CONTROL-PLANE    │                │
│  │ (Customer Portal)│  │ (Admin/SRE)      │                │
│  │                  │  │                  │                │
│  │ - Marketing      │  │ - Tenant Mgmt    │                │
│  │ - Signup/Login   │  │ - Billing        │                │
│  │ - Account Mgmt   │  │ - Provisioning   │                │
│  │ - User Profiles  │  │ - Monitoring     │                │
│  └──────────────────┘  └──────────────────┘                │
│         │                        │                          │
│         └────────────┬───────────┘                          │
│                      │ (provision & manage)                │
│                      ▼                                      │
│  ┌────────────────────────────────────────────────────┐    │
│  │   ARIA-EVALUATOR-APP INSTANCES (Multi-Tenant)     │    │
│  │                                                    │    │
│  │  ┌─────────────────────┐  ┌──────────────────┐   │    │
│  │  │ Tenant: ACME Corp   │  │ Tenant: CUSTOMER │   │    │
│  │  │                     │  │ ├─ Own VPC       │   │    │
│  │  │ ├─ Own VPC          │  │ ├─ Own DB        │   │    │
│  │  │ ├─ Own DB           │  │ ├─ Own Users     │   │    │
│  │  │ ├─ Own Users        │  │ ├─ Own Scenarios │   │    │
│  │  │ ├─ Own Scenarios    │  │ ├─ Own Reports   │   │    │
│  │  │ ├─ Own Reports      │  │ └─ Redis (Phase1)│   │    │
│  │  │ └─ Redis (Phase1)   │  └──────────────────┘   │    │
│  │  └─────────────────────┘                         │    │
│  │                                                    │    │
│  │  (Each tenant completely isolated)                │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Phase 1 Auth - Scope Clarification

### What We're Building in Phase 1

**Location**: `src/api/auth-*.ts` and `src/lib/auth-*.ts` in **aria-evaluator-app**

**Scope**: **TENANT-LOCAL authentication** for each aria-evaluator-app instance

```
┌─────────────────────────────────────────┐
│  One Tenant's aria-evaluator-app        │
├─────────────────────────────────────────┤
│                                         │
│  ┌────────────────────────────────────┐ │
│  │ Phase 1 Auth System (NEW)          │ │
│  │                                    │ │
│  │ ✅ JWT Token Management           │ │
│  │ ✅ Social OAuth (Google, GitHub)  │ │
│  │ ✅ Email/Password Credentials     │ │
│  │ ✅ Session Management (Redis)     │ │
│  │ ✅ Role-Based Access Control      │ │
│  │                                    │ │
│  └────────────────────────────────────┘ │
│           ▲                              │
│           │ Authenticates               │
│           │                              │
│  ┌────────┴────────────────────────────┐ │
│  │  UI & API Endpoints (Tenant Users)  │ │
│  │  - Dashboard                        │ │
│  │  - Scenarios                        │ │
│  │  - Evaluations                      │ │
│  │  - Reports                          │ │
│  └─────────────────────────────────────┘ │
│                                         │
└─────────────────────────────────────────┘
```

---

## Three-Tier Auth Model

### Tier 1: Platform Level (Website + Control-Plane)
**Purpose**: Customer account, subscription, tenant provisioning  
**Status**: EXISTING (not our concern for Phase 1)  
**Uses**: Your existing auth system (likely SSO/SAML with control-plane)

```
Website (www.ariaeval.io)
  ├─ Customer signs up
  ├─ Creates account (email, password, profile)
  ├─ Buys subscription (Enterprise Starter, Pro, Unlimited)
  └─ Control-plane provisions new tenant instance

Control-Plane (admin.ariaeval.io)
  ├─ Internal authentication
  ├─ Manages tenants
  ├─ Handles billing/provisioning
  └─ Creates aria-evaluator-app instances per tenant
```

### Tier 2: Tenant Instance Level (aria-evaluator-app)
**Purpose**: Per-tenant user authentication within that instance  
**Status**: **THIS IS PHASE 1** 🎯  
**Builds**: JWT tokens, session management, role-based access

```
aria-evaluator-app (eval.acme.example.com for ACME Corp)
  ├─ Tenant-local users (different from website accounts)
  ├─ Social login (Google, GitHub OAuth)
  ├─ Email/password accounts
  ├─ Team members within this tenant
  └─ RBAC (Admin, Analyst, Viewer roles)
```

### Tier 3: Agent Integration Level (Not Auth)
**Purpose**: Authenticate to external agents being tested  
**Status**: Existing adapters already handle this  
**Examples**: Amazon Connect, Azure Bot Service, Lex credentials

```
Testing an agent requires credentials for:
  ├─ Amazon Connect (instance ID, credentials)
  ├─ AWS Lex (bot ID, alias)
  ├─ Azure Bot Service (App ID, password)
  └─ Custom OpenAPI (API key, auth headers)
```

---

## Impact Analysis: Auth Scope Per Application

| Application | Phase 1 Auth Impact | Notes |
|---|---|---|
| **website** | ❌ NO CHANGE | Existing auth separate |
| **control-plane** | ❌ NO CHANGE | Manages provisioning, not user auth |
| **aria-evaluator-app** | ✅ YES - THIS IS THE CHANGE | Tenant-local auth system |

---

## How Each Tier Works Together

### Scenario: ACME Corp Employee Uses aria-evaluator-app

```
Step 1: Customer Acquisition (Website)
  └─ ACME Corp signs up at www.ariaeval.io
  └─ Creates account, subscribes to Enterprise Starter
  └─ Receives activation email

Step 2: Tenant Provisioning (Control-Plane)
  └─ Control-plane creates new aria-evaluator-app instance
  └─ Instance URL: eval-acme.ariaeval.io or custom domain
  └─ Provisions RDS, Redis, VPC, ECS tasks, etc.
  └─ Sends invite link to ACME admin

Step 3: Tenant Access (aria-evaluator-app - PHASE 1 AUTH)
  └─ ACME admin visits eval-acme.ariaeval.io
  └─ Sees signup page (Phase 1 auth)
  └─ Can:
     ├─ Sign up with email/password (new tenant account)
     ├─ Sign up with Google OAuth (if ACME uses Google Workspace)
     ├─ Sign up with GitHub OAuth (if developers)
     └─ Get JWT token + refresh token (Redis session)
  
  └─ ACME admin invites team members (email invites)
     ├─ Team members signup within the tenant
     ├─ Each gets own JWT tokens
     ├─ Different roles (Admin, Analyst, Viewer)
     └─ All isolated to this tenant instance

Step 4: Testing Agents (No Auth Change)
  └─ ACME team configures Amazon Connect credentials
  └─ Existing adapter layer handles Connect auth
  └─ Runs evaluations
  └─ (No Phase 1 auth change needed here)
```

---

## Key Distinction: Tenant-Local vs. Shared Auth

### ❌ What We're NOT Building
**Shared/Federated Auth** - Where all customers share one user database:
```
(NOT THIS)
www.ariaeval.io  →  ┌─────────────────┐
                    │  Shared User DB │  ← All customers' users
admin.ariaeval.io → │                 │
eval-acme.com  ────→│ (Federated SSO) │
eval-retail.com ──→ └─────────────────┘
```

### ✅ What We ARE Building
**Tenant-Isolated Auth** - Each tenant has own user database:
```
(THIS IS CORRECT)
Website:          Customers → Platform accounts
                               │
Control-Plane:    Provisions tenants
                               │
                    ┌──────────┼──────────┐
                    │          │          │
            eval-acme.com  eval-retail  eval-tech
            ACME Users    Retail Users  Tech Users
            (DB-1)        (DB-2)        (DB-3)
            Isolated      Isolated      Isolated
```

---

## Why Tenant-Isolated Auth for Phase 1?

| Aspect | Tenant-Isolated | Shared/Federated |
|--------|---|---|
| **Complexity** | ⭐⭐ Simple | ⭐⭐⭐⭐⭐ Complex |
| **Security** | ✅ Better isolation | ❌ Cross-tenant risk |
| **Scalability** | ✅ Scales linearly | ⚠️ Bottleneck |
| **Onboarding** | ✅ Instant | ❌ Requires SSO setup |
| **Cost** | ✅ Lower | ⚠️ More infrastructure |
| **Phase 1** | ✅ FIT | ❌ Too much scope |

---

## Architecture Decisions for Phase 1

### Decision 1: Each Tenant Gets Its Own Auth System
**Why**: Simplicity, isolation, quick onboarding

```hcl
# In terraform for each tenant instance:
terraform apply -var="tenant_id=acme" \
                 -var="redis_node_type=cache.t4g.small"

# Result: Tenant-specific auth deployed alongside evaluator
```

### Decision 2: No Shared Auth Service (Yet)
**Future (Phase 3+)**: Could add centralized identity provider  
**Now**: Keep it simple, separate concerns

```
Phase 1 (Current):    Each instance → Own users → Own JWT tokens
Phase 2:              Add Cross-tenant SSO (optional)
Phase 3+:             Migrate to federated auth (OIDC, SAML)
```

### Decision 3: Website/Control-Plane Auth Separate
**Why**: Different use cases, different user types

```
Website:         Customers (purchasing, billing)
Control-Plane:   SRE/Admins (monitoring, support)
aria-eval:       Tenant teams (evaluations, reports)
```

---

## Phase 1 Auth - Does NOT Affect Website/Control-Plane

### Website (`website-prod`)
**Current**: Marketing site + existing auth system  
**Phase 1 Change**: ❌ NONE  
**Reason**: Separate from aria-evaluator-app tenants

### Control-Plane (`control-plane-prod`)
**Current**: Provisions tenants, manages resources  
**Phase 1 Change**: ❌ NONE  
**Reason**: Controls infrastructure, doesn't authenticate tenant users

### aria-evaluator-app (ALL INSTANCES)
**Current**: No auth (open/guest)  
**Phase 1 Change**: ✅ ADD tenant-local auth  
**Reason**: Enable secure multi-user access within each tenant

---

## Integration Points (Phase 1 Auth)

### Within Single Tenant Instance

```
User Login (Phase 1)
    ↓
POST /auth/login or /auth/oauth/google/callback
    ↓
Verify credentials (in tenant's DB)
    ↓
Issue JWT + Refresh token (Redis session, tenant-local)
    ↓
User can now access:
  ├─ GET /api/scenarios
  ├─ POST /api/runs
  ├─ GET /api/reports
  └─ etc. (all protected by requireAuth middleware)
```

### NOT Integrated in Phase 1

```
❌ SSO with website (customer already authenticated elsewhere)
❌ Cross-tenant login (each tenant is isolated)
❌ Shared credential store (each tenant has own DB)
❌ Federated identity (no OIDC/SAML yet)
```

---

## Summary: Phase 1 Auth Scope

| Question | Answer |
|---|---|
| Does Phase 1 auth affect website? | ❌ NO |
| Does Phase 1 auth affect control-plane? | ❌ NO |
| Is aria-evaluator-app multi-tenant? | ✅ YES (each tenant isolated) |
| Does each tenant get its own auth? | ✅ YES |
| Can customers login without website account? | ✅ YES (tenant-local signup) |
| Are tenants sharing one auth system? | ❌ NO (isolated per tenant) |
| Will Phase 1 auth change website/control-plane code? | ❌ NO |
| Will Phase 1 auth change Terraform for website/control-plane? | ❌ NO |

---

## Implementation Strategy

### What Changes in Phase 1:
```
aria-evaluator-app/
├── src/api/auth-credentials.ts      ← NEW: Email/password
├── src/api/auth-oauth.ts            ← NEW: Google, GitHub
├── src/api/token-manager.ts         ← NEW: JWT lifecycle
├── src/lib/cache.ts                 ← NEW: Redis sessions
├── infra/terraform/environments/*/redis.tf  ← NEW: Redis per tenant
└── [Tenant-local infrastructure only]
```

### What Does NOT Change:
```
website/                      ← Untouched
control-plane/                ← Untouched
[Shared infrastructure]       ← Untouched
```

---

## Future Phases (Not Phase 1)

### Phase 3: Federated Auth (Optional)
```
Control-Plane
  └─ OIDC/SAML Identity Provider
     └─ All tenant instances use same provider
     └─ Cross-tenant credentials
     └─ More complex, more enterprise-friendly
```

### Phase 4: SSO Integration
```
Website signup → Control-Plane provisions → Auto-create first admin account
                                          → Send to aria-evaluator-app
                                          → Admin can invite team
```

---

## Conclusion

**Phase 1 auth changes are COMPLETELY ISOLATED to each aria-evaluator-app tenant instance.**

- ✅ Website: No changes
- ✅ Control-Plane: No changes  
- ✅ aria-evaluator-app: Gets tenant-local auth
- ✅ Multi-tenant isolation preserved
- ✅ Future federated auth possible (Phase 3+)

Each customer/tenant instance is a completely separate deployment with its own:
- Docker container
- RDS database
- Redis cache
- Users & authentication
- Sessions & JWT tokens
- Everything isolated

---

**Status**: Phase 1 is scoped correctly for tenant-local auth ✅
