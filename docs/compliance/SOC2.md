# SOC 2 Compliance — ARIA Evaluator

> **Framework**: AICPA SOC 2 (2017 Trust Service Criteria)  
> **Target**: Type I by Q3 2026, Type II by Q1 2027  
> **Scope**: Full platform (Website, Control Plane, Evaluator App, AWS Infrastructure)  
> **Auditor**: TBD — recommend Vanta/Drata-assisted audit with a licensed CPA firm

---

## What is SOC 2?

SOC 2 is an auditing standard developed by the AICPA that evaluates an organization's controls relevant to **Security, Availability, Processing Integrity, Confidentiality, and Privacy** (the five Trust Service Criteria). Enterprise customers increasingly require SOC 2 reports before purchasing SaaS products.

- **Type I**: Point-in-time assessment — "Are these controls designed properly?"  
- **Type II**: Period-of-time assessment (3–12 months) — "Did these controls operate effectively?"

## Trust Service Criteria — Control Mapping

### CC1: Control Environment

| Criterion | Requirement | Status | ARIA Implementation | Gap / Action |
|-----------|------------|--------|---------------------|--------------|
| CC1.1 | Demonstrate commitment to integrity and ethical values | ✅ | Terms of Service; `acceptable-use-policy.md`; `information-security-policy.md` | — |
| CC1.2 | Board/management oversight of internal controls | ✅ | Founder oversight (startup stage); security policies define owner/reviewer roles | — |
| CC1.3 | Establish organizational structure and reporting lines | ✅ | Policy documents define RACI; startup flat structure documented | — |
| CC1.4 | Demonstrate commitment to competence | ✅ | `sdlc-policy.md` includes security training requirements; AI-native team | — |
| CC1.5 | Hold individuals accountable for internal controls | ✅ | Policies require acknowledgment; `acceptable-use-policy.md` | — |

### CC2: Communication and Information

| Criterion | Requirement | Status | ARIA Implementation | Gap / Action |
|-----------|------------|--------|---------------------|--------------|
| CC2.1 | Generate quality information for internal control | ✅ | CloudTrail audit logs, application audit logs, CIS alarms | Formalize log review cadence |
| CC2.2 | Communicate internal control information internally | ✅ | `incident-response-plan.md`; CIS alarms → SNS; CloudWatch dashboards | — |
| CC2.3 | Communicate with external parties on security | ✅ | Privacy policy, Terms of Service, cookie policy published | Add security.txt and vulnerability disclosure policy |

### CC3: Risk Assessment

| Criterion | Requirement | Status | ARIA Implementation | Gap / Action |
|-----------|------------|--------|---------------------|--------------|
| CC3.1 | Specify objectives clearly | ✅ | Pricing tiers with SLA; DPIA risk assessment; security policies define objectives | — |
| CC3.2 | Identify and analyze risks | ✅ | `DPIA.md` risk assessment; vendor risk assessments; CIS alarms; WAF rules | — |
| CC3.3 | Consider fraud risk | ✅ | Rate limiting (5/15min); audit logging; WAF anti-fraud rules; session controls | — |
| CC3.4 | Identify and assess changes | ✅ | `change-management-policy.md`; Terraform IaC; Git version control | — |

### CC4: Monitoring Activities

| Criterion | Requirement | Status | ARIA Implementation | Gap / Action |
|-----------|------------|--------|---------------------|--------------|
| CC4.1 | Select and develop monitoring activities | ✅ | 14 CIS CloudWatch alarms, WAF metrics, CloudTrail | Formalize monitoring runbook |
| CC4.2 | Evaluate and communicate deficiencies | ✅ | 14 CIS alarms → SNS; `incident-response-plan.md` with escalation path | — |

### CC5: Control Activities

| Criterion | Requirement | Status | ARIA Implementation | Gap / Action |
|-----------|------------|--------|---------------------|--------------|
| CC5.1 | Select and develop control activities that mitigate risks | ✅ | Multi-layer security (WAF → ALB → App → DB) | Document control catalogue |
| CC5.2 | Select and develop general controls over technology | ✅ | Terraform IaC, environment separation, Git | Formalize SDLC policy |
| CC5.3 | Deploy control activities through policies | ✅ | 10 formal security policies in `policies/`; controls enforced in code | — |

### CC6: Logical and Physical Access Controls

| Criterion | Requirement | Status | ARIA Implementation | Gap / Action |
|-----------|------------|--------|---------------------|--------------|
| CC6.1 | Implement logical access security | ✅ | scrypt passwords, session idle timeout (30 min), max 5 sessions, rate limiting (5 failures/15 min), `__Host-` cookie prefix | ✅ Compliant |
| CC6.2 | Prior to issuing credentials, register and authorize users | ✅ | Registration flow with email verification, admin bootstrap | Add MFA support (TOTP) |
| CC6.3 | Authorize and manage access and privileges | ✅ | Role-based access (admin/user), admin-only routes | Document RBAC matrix |
| CC6.4 | Restrict physical access to facilities | ✅ | AWS manages physical security (SOC 2 Type II certified) | Reference AWS SOC 2 report |
| CC6.5 | Dispose of assets securely | ✅ | GDPR deletion endpoint anonymizes audit logs, deletes data | Document data disposal procedure |
| CC6.6 | Protect against threats from outside the system boundary | ✅ | WAF (IP reputation + Common Rules + Bad Inputs + rate limit), security headers (CSP, HSTS, X-Frame-Options), CloudFront function blocks direct access | ✅ Compliant |
| CC6.7 | Restrict transmission, movement, and removal of data | ✅ | TLS 1.2+ enforced, HTTPS-only S3 policies, EFS transit encryption, client-side password hashing | ✅ Compliant |
| CC6.8 | Prevent and detect unauthorized software | ✅ | npm audit; Terraform validation; `sdlc-policy.md` mandates dependency scanning; ECR scanning in prod | — |

### CC7: System Operations

| Criterion | Requirement | Status | ARIA Implementation | Gap / Action |
|-----------|------------|--------|---------------------|--------------|
| CC7.1 | Detect and monitor security events | ✅ | CloudTrail, CIS alarms, WAF logging, application audit log with PII redaction | ✅ Compliant |
| CC7.2 | Monitor system components for anomalies | ✅ | CloudWatch metrics, WAF sampled requests, CIS anomaly alarms | Add Container Insights |
| CC7.3 | Evaluate security events and response | ✅ | `incident-response-plan.md`; CIS alarms; CloudTrail analysis | — |
| CC7.4 | Respond to identified security incidents | ✅ | `incident-response-plan.md`; `BREACH-NOTIFICATION-TEMPLATES.md` | — |
| CC7.5 | Identify and remediate vulnerabilities | ✅ | `security.txt` + disclosure policy; WAF auto-update; `sdlc-policy.md` patching schedule | — |

### CC8: Change Management

| Criterion | Requirement | Status | ARIA Implementation | Gap / Action |
|-----------|------------|--------|---------------------|--------------|
| CC8.1 | Authorize, design, develop, configure, test, approve changes | ✅ | Git + PR workflow, Terraform plan/apply, environment separation (local → dev → prod) | Formalize change management policy, require PR approvals |

### CC9: Risk Mitigation

| Criterion | Requirement | Status | ARIA Implementation | Gap / Action |
|-----------|------------|--------|---------------------|--------------|
| CC9.1 | Identify and manage vendor risk | ✅ | `VENDOR-RISK-ASSESSMENTS.md`; `vendor-management-policy.md` | — |
| CC9.2 | Assess and manage risks from vendors and partners | ✅ | `vendor-management-policy.md`; vendor risk assessments with DPA tracking | — |

---

## Additional Trust Service Categories

### A: Availability

| Criterion | Status | Implementation | Gap |
|-----------|--------|---------------|-----|
| A1.1 – Maintain availability commitments | ✅ | SLA in Terms; CloudWatch monitoring; CloudFront + ALB HA | — |
| A1.2 – Authorized environmental protections | ✅ | AWS multi-AZ, ECS health checks, ALB | Add auto-scaling policies |
| A1.3 – Recovery from availability incidents | ✅ | `business-continuity-plan.md` with RTO/RPO; ECS circuit breaker with rollback | — |

### C: Confidentiality

| Criterion | Status | Implementation | Gap |
|-----------|--------|---------------|-----|
| C1.1 – Identify confidential information | ✅ | Sensitive field redaction in logs, PII categories defined | Data classification policy document |
| C1.2 – Dispose of confidential information | ✅ | GDPR deletion (Art. 17), audit log anonymization | ✅ Compliant |

### PI: Processing Integrity

| Criterion | Status | Implementation | Gap |
|-----------|--------|---------------|-----|
| PI1.1 – Obtain/generate accurate data | ✅ | Input validation (Zod schemas), sanitization middleware | ✅ Compliant |
| PI1.2 – System processing is complete and accurate | ✅ | Evaluation scoring with deterministic rubrics | Document processing accuracy tests |

### P: Privacy

| Criterion | Status | Implementation | Gap |
|-----------|--------|---------------|-----|
| P1–P8 | ✅ | Privacy policy, data export, deletion, cookie consent, retention tiers | See [GDPR.md](./GDPR.md) for full mapping |

---

## Evidence Catalogue for SOC 2

| Evidence ID | Description | Source | Category |
|-------------|-------------|--------|----------|
| SOC2-E001 | Terraform source (IaC) | `infra/terraform/` | CC5.2, CC8.1 |
| SOC2-E002 | CloudTrail configuration | `modules/cloudtrail/main.tf` | CC7.1 |
| SOC2-E003 | CIS Benchmark alarms | `modules/cloudtrail/main.tf` (L278-329) | CC4.1, CC7.1 |
| SOC2-E004 | WAF rules configuration | `modules/waf/main.tf` | CC6.6 |
| SOC2-E005 | Password hashing (scrypt) | `src/api/auth.ts` (L117-135) | CC6.1 |
| SOC2-E006 | Session management | `src/api/auth.ts` (L9-15) | CC6.1 |
| SOC2-E007 | Rate limiting | `src/api/auth.ts` (L35-37) | CC6.1, CC6.6 |
| SOC2-E008 | Security headers | `src/api/server.ts` (L117-141) | CC6.6 |
| SOC2-E009 | Audit log with redaction | `src/api/audit-log.ts` | CC7.1, C1.1 |
| SOC2-E010 | GDPR endpoints | `src/api/auth.ts` (export, delete) | CC6.5, P |
| SOC2-E011 | Cookie consent mechanism | `CookieConsentBanner.tsx` | P |
| SOC2-E012 | Privacy policy | `website/src/app/privacy/` | P, CC2.3 |
| SOC2-E013 | Terms of service | `website/src/app/terms/` | CC2.3 |
| SOC2-E014 | Encryption config | S3 AES-256, EFS transit, TLS 1.2+ | CC6.7 |
| SOC2-E015 | Environment separation | `infra/terraform/environments/` | CC5.2 |

---

## Remediation Roadmap

### Phase 1: Policy Documentation (Weeks 1–4)
- [ ] Information Security Policy
- [ ] Acceptable Use Policy
- [ ] Change Management Policy
- [ ] Incident Response Plan
- [ ] Business Continuity / Disaster Recovery Plan
- [ ] Vendor Management Policy
- [ ] Data Classification Policy
- [ ] Access Control Policy
- [ ] Code of Ethics

### Phase 2: Technical Controls (Weeks 3–6)
- [ ] Enable MFA/TOTP for user accounts
- [ ] ECR container image scanning on push
- [ ] Dependency vulnerability scanning (npm audit CI, Snyk/Dependabot)
- [ ] Add `security.txt` and vulnerability disclosure policy to website
- [ ] Container Insights for ECS monitoring
- [ ] Auto-scaling policies for ECS services
- [ ] Formal backup and restore testing

### Phase 3: Process Implementation (Weeks 5–8)
- [ ] Security awareness training program
- [ ] Incident response tabletop exercise
- [ ] Quarterly access reviews
- [ ] Vulnerability management schedule
- [ ] Change advisory board (or lightweight PR approval policy)
- [ ] Vendor risk assessment for AWS, LLM providers

### Phase 4: Audit Readiness (Weeks 7–10)
- [ ] Select SOC 2 auditor (recommend Vanta/Drata-assisted)
- [ ] Compile evidence package
- [ ] Internal readiness assessment
- [ ] Remediate auditor findings
- [ ] **SOC 2 Type I report issued** (target Q3 2026)

### Phase 5: Type II Observation Period (Months 4–12)
- [ ] Maintain controls for 6–12 month observation window
- [ ] Monthly control effectiveness reviews
- [ ] Quarterly risk reassessment
- [ ] **SOC 2 Type II report issued** (target Q1 2027)

---

## Estimated Costs

| Item | Estimated Cost | Notes |
|------|---------------|-------|
| Compliance platform (Vanta/Drata) | $10,000–25,000/yr | Automates evidence collection |
| SOC 2 Type I audit | $20,000–50,000 | Depends on scope and auditor |
| SOC 2 Type II audit | $30,000–75,000 | Annual renewal |
| Policy writing (if outsourced) | $5,000–15,000 | Can use templates from compliance platform |
| Penetration testing | $5,000–20,000 | Required annually |
| **Total Year 1** | **$70,000–185,000** | |
| **Annual renewal** | **$40,000–100,000** | |
