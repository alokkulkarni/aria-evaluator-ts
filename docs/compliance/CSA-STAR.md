# CSA STAR Compliance — ARIA Evaluator

> **Framework**: Cloud Security Alliance — Security, Trust, Assurance and Risk (STAR)  
> **Target**: Level 1 (Self-Assessment) by Q2 2027  
> **Scope**: AWS cloud infrastructure and SaaS platform

---

## What is CSA STAR?

CSA STAR is a cloud security assurance program with three levels:

| Level | Type | Effort | Description |
|-------|------|--------|-------------|
| **Level 1** | Self-Assessment | Low | Complete CAIQ questionnaire, publish to CSA STAR Registry |
| **Level 2** | Third-Party Audit | High | Independent assessment against CCM (integrates with ISO 27001 or SOC 2) |
| **Level 3** | Continuous Monitoring | Very High | Continuous auditing and monitoring |

**Recommendation**: Start with Level 1 (free, self-assessment). Upgrade to Level 2 when pursuing ISO 27001 certification (can be combined).

---

## Cloud Controls Matrix (CCM) v4 — Key Domains

| Domain | Controls | Status | ARIA Coverage |
|--------|----------|--------|---------------|
| **A&A** — Audit & Assurance | 6 | ✅ | CloudTrail, audit logging, and [`policies/information-security-policy.md`](./policies/information-security-policy.md) govern assurance activities |
| **AIS** — Application & Interface Security | 7 | ✅ | Security headers, CSP, input validation, WAF |
| **BCR** — Business Continuity & DR | 11 | ✅ | [`policies/business-continuity-plan.md`](./policies/business-continuity-plan.md) plus ECS circuit breaker and multi-AZ resilience |
| **CCC** — Change Control | 9 | ✅ | Git, Terraform, PR workflow, env separation |
| **CEK** — Cryptography & Key Mgmt | 21 | ✅ | AES-256, TLS 1.2+, scrypt, KMS option |
| **DSP** — Data Security & Privacy | 19 | ✅ | GDPR endpoints, encryption, PII redaction, privacy policy |
| **GRC** — Governance & Risk | 11 | ✅ | [`policies/information-security-policy.md`](./policies/information-security-policy.md), [`DPIA.md`](./DPIA.md), and [`policies/privacy-program.md`](./policies/privacy-program.md) define governance and risk management |
| **HRS** — Human Resources | 13 | ✅ | [`policies/access-control-policy.md`](./policies/access-control-policy.md) and [`policies/sdlc-policy.md`](./policies/sdlc-policy.md) cover onboarding, access, and training |
| **IAM** — Identity & Access Mgmt | 16 | ✅ | RBAC, scrypt auth, session controls, rate limiting |
| **IPY** — Interoperability & Portability | 6 | ✅ | Data export endpoint, standard formats |
| **IVS** — Infrastructure & Virtualisation | 13 | ✅ | VPC, security groups, Fargate isolation, IaC |
| **LOG** — Logging & Monitoring | 13 | ✅ | CloudTrail, CloudWatch, CIS alarms, WAF logs |
| **SEF** — Security Incident Mgmt | 8 | ✅ | [`policies/incident-response-plan.md`](./policies/incident-response-plan.md) plus CIS alarms, CloudTrail, and WAF logs |
| **STA** — Supply Chain | 14 | ✅ | [`policies/vendor-management-policy.md`](./policies/vendor-management-policy.md) and [`VENDOR-RISK-ASSESSMENTS.md`](./VENDOR-RISK-ASSESSMENTS.md) govern supply chain risk |
| **TVM** — Threat & Vulnerability Mgmt | 10 | ✅ | WAF managed rules, encryption, CIS alarms, and secure review requirements in [`policies/sdlc-policy.md`](./policies/sdlc-policy.md) |
| **UEM** — Universal Endpoint Mgmt | 14 | ✅ | Cloud-native workforce controls are documented in [`policies/acceptable-use-policy.md`](./policies/acceptable-use-policy.md) and [`policies/access-control-policy.md`](./policies/access-control-policy.md) |

---

## CAIQ (Consensus Assessments Initiative Questionnaire) Summary

The CAIQ v4 contains ~260 questions. Our estimated readiness:

| Response | Count | Percentage |
|----------|-------|------------|
| ✅ Yes (control implemented) | ~160 | ~62% |
| ✅ Implemented and documented | ~70 | ~27% |
| ❌ No (gap) | ~30 | ~11% |

**Primary focus areas**: Complete CAIQ evidence collection and maintain future customer-specific controls.

---

## Remediation Roadmap

### For Level 1 (Self-Assessment)
- [ ] Complete CAIQ v4 questionnaire
- [ ] Publish to CSA STAR Registry (free)
- [ ] Address critical "No" responses

### For Level 2 (if pursuing)
- [ ] Combined with ISO 27001 certification audit
- [ ] Additional ~£5,000–10,000 on top of ISO 27001 audit
