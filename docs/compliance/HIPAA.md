# HIPAA Readiness — ARIA Evaluator

> **Framework**: Health Insurance Portability and Accountability Act (HIPAA)  
> **Priority**: P3 — Future (only if targeting healthcare customers)  
> **Target**: Q3 2027  
> **Scope**: Platform when processing Protected Health Information (PHI)

> **Note**: HIPAA compliance is not required pre-revenue and only applies if targeting healthcare customers.

---

## What is HIPAA?

HIPAA regulates the handling of Protected Health Information (PHI) in the United States. If healthcare organisations use ARIA Evaluator to test AI agents that process PHI, we may need to sign a **Business Associate Agreement (BAA)** and meet HIPAA's Security Rule, Privacy Rule, and Breach Notification Rule.

**When this applies**: Only if a healthcare customer sends evaluation prompts or test data containing PHI through our platform.

---

## Applicability Assessment

| Question | Answer | Impact |
|----------|--------|--------|
| Do we directly handle patient data? | No | Lower risk |
| Could customer eval data contain PHI? | Possibly | Need BAA capability |
| Do we store evaluation data? | Yes (encrypted, time-limited) | Security Rule applies |
| Do we use AI sub-processors? | Yes (Bedrock, etc.) | BAA chain required |

---

## HIPAA Security Rule — Safeguard Mapping

### Administrative Safeguards (§164.308)

| Safeguard | Status | ARIA Implementation | Gap |
|-----------|--------|---------------------|-----|
| Security management process | ✅ | [`DPIA.md`](./DPIA.md) and [`policies/information-security-policy.md`](./policies/information-security-policy.md) provide the baseline risk assessment process for sensitive data handling | — |
| Assigned security responsibility | ✅ | Security ownership is defined in [`policies/information-security-policy.md`](./policies/information-security-policy.md) and [`policies/access-control-policy.md`](./policies/access-control-policy.md) | — |
| Workforce security | ✅ | [`policies/access-control-policy.md`](./policies/access-control-policy.md) enforces least privilege and revocation; [`policies/sdlc-policy.md`](./policies/sdlc-policy.md) defines training requirements | — |
| Information access management | ✅ | RBAC, session controls | PHI minimum necessary standard |
| Security awareness training | ✅ | [`policies/sdlc-policy.md`](./policies/sdlc-policy.md) includes security training requirements applicable to regulated data handling | — |
| Security incident procedures | ✅ | [`policies/incident-response-plan.md`](./policies/incident-response-plan.md) and [`BREACH-NOTIFICATION-TEMPLATES.md`](./BREACH-NOTIFICATION-TEMPLATES.md) cover breach response and notification workflows | — |
| Contingency plan | ✅ | [`policies/business-continuity-plan.md`](./policies/business-continuity-plan.md) plus multi-AZ deployment and backups cover continuity planning | — |
| Evaluation | ✅ | Annual control review is anchored in [`policies/information-security-policy.md`](./policies/information-security-policy.md) and [`DPIA.md`](./DPIA.md) | — |

### Physical Safeguards (§164.310)

| Safeguard | Status | Implementation |
|-----------|--------|---------------|
| Facility access controls | ✅ | AWS manages (SOC 2 certified, HIPAA eligible) |
| Workstation use/security | ✅ | Founder-managed endpoints are governed by [`policies/acceptable-use-policy.md`](./policies/acceptable-use-policy.md) and [`policies/access-control-policy.md`](./policies/access-control-policy.md) |
| Device and media controls | ✅ | No local PHI storage by design |

### Technical Safeguards (§164.312)

| Safeguard | Status | ARIA Implementation | Gap |
|-----------|--------|---------------------|-----|
| Access control | ✅ | Unique user IDs, session management | Emergency access procedure |
| Audit controls | ✅ | CloudTrail, application audit logs | PHI access logging |
| Integrity controls | ✅ | CloudTrail log validation, HTTPS | — |
| Person/entity authentication | ✅ | scrypt hashing, session tokens | MFA required for PHI access |
| Transmission security | ✅ | TLS 1.2+, client-side hashing | — |

---

## Requirements for HIPAA Enablement

### Technical Changes
- [ ] Dedicated PHI-designated environment (separate AWS account or VPC)
- [ ] Enhanced audit logging for PHI data access
- [ ] MFA required for all users with PHI access
- [ ] Automated PHI data retention/disposal (per BAA terms)
- [ ] AWS BAA signed (prerequisite for HIPAA-eligible services)

### Operational Changes
- [ ] BAA template for healthcare customers
- [ ] HIPAA security officer designation
- [ ] HIPAA-specific workforce training
- [ ] PHI breach notification procedure (60-day window, HHS OCR notification)
- [ ] Annual HIPAA risk assessment

### Estimated Cost
| Item | Cost |
|------|------|
| HIPAA compliance consultant | $10,000–25,000 |
| Dedicated infrastructure (if needed) | $5,000–15,000/yr |
| Annual risk assessment | $5,000–10,000 |
| Training program | $2,000–5,000 |
| **Total Year 1** | **$22,000–55,000** |

---

## Note on HIPAA "Certification"

There is **no official HIPAA certification**. Compliance is demonstrated through:
1. Completed risk assessment
2. Implemented safeguards
3. Signed BAAs with customers and sub-processors
4. Documentation of policies and procedures
5. Optional third-party assessment (e.g., HITRUST CSF)

Consider **HITRUST CSF** certification as a recognized healthcare industry standard that incorporates HIPAA, ISO 27001, and NIST controls.
