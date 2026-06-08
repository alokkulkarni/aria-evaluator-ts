# GDPR Compliance — ARIA Evaluator

> **Framework**: EU General Data Protection Regulation (Regulation 2016/679)  
> **Target**: Full compliance by Q3 2026  
> **Scope**: All components processing personal data of EU/EEA residents  
> **DPO Contact**: privacy@ariaeval.io

---

## What is GDPR?

The General Data Protection Regulation is the EU's comprehensive data protection law. It applies to any organization that processes personal data of individuals in the EU/EEA, regardless of where the organization is based. Non-compliance carries fines of up to **€20 million or 4% of annual global turnover**.

ARIA Evaluator processes personal data through user accounts, evaluation data (which may contain PII in prompts/responses), cookies, and audit logs.

---

## Data Processing Activities

### Data Controller vs Processor

| Role | Entity | Context |
|------|--------|---------|
| **Controller** | AriaEval (us) | User account data, website analytics, marketing |
| **Controller** | Customer | Customer's AI evaluation data, prompts, test scenarios |
| **Processor** | AriaEval (us) | Processing customer evaluation data on their behalf |
| **Sub-processor** | AWS | Cloud infrastructure hosting |
| **Sub-processor** | LLM providers | AI model inference (Bedrock, OpenAI, etc.) |

### Personal Data Inventory (Article 30 Record)

| Data Category | Examples | Legal Basis | Retention | Storage |
|--------------|----------|-------------|-----------|---------|
| **Account data** | Email, username, hashed password | Contract (Art. 6(1)(b)) | Active + 90 days | EFS / SQLite (encrypted) |
| **Authentication data** | Session tokens, IP address, user-agent | Legitimate interest (Art. 6(1)(f)) | Session duration + 30 days | EFS / SQLite |
| **Audit logs** | User actions, IP, timestamps | Legitimate interest (Art. 6(1)(f)) | 12 months | EFS / CloudWatch |
| **Evaluation data** | AI prompts, responses, scores | Contract (Art. 6(1)(b)) | Per plan (30–90 days) | EFS (AES-256) |
| **Payment data** | Billing address, payment method | Contract (Art. 6(1)(b)) | 7 years (financial regs) | Stripe (PCI DSS) |
| **Cookie data** | Session, preferences, analytics | Consent (Art. 6(1)(a)) | Per cookie type | Browser + CloudFront |
| **Marketing data** | Newsletter subscription | Consent (Art. 6(1)(a)) | Until withdrawn | CRM system |

---

## GDPR Article Compliance Matrix

### Chapter II: Principles (Articles 5–11)

| Article | Requirement | Status | Implementation | Gap |
|---------|------------|--------|---------------|-----|
| **Art. 5(1)(a)** | Lawfulness, fairness, transparency | ✅ | Privacy policy published, cookie consent with categories | — |
| **Art. 5(1)(b)** | Purpose limitation | ✅ | Data used only for stated purposes in privacy policy | Document processing purposes register |
| **Art. 5(1)(c)** | Data minimisation | ✅ | Collect only required fields (email, username) | Review data collection points |
| **Art. 5(1)(d)** | Accuracy | ✅ | Users can update their profile | — |
| **Art. 5(1)(e)** | Storage limitation | ✅ | Tiered retention (30/90 days eval data, 12 months audit) | Implement automated retention enforcement |
| **Art. 5(1)(f)** | Integrity and confidentiality | ✅ | AES-256 at rest, TLS 1.2+ in transit, scrypt hashing, log redaction | — |
| **Art. 5(2)** | Accountability | ✅ | Controls implemented; formal policies in `docs/compliance/policies/` | — |
| **Art. 6** | Lawful basis for processing | ✅ | Consent (cookies/marketing), Contract (service), Legitimate Interest (security/audit) | Document DPIA for legitimate interest |
| **Art. 7** | Conditions for consent | ✅ | Cookie consent banner with granular categories, withdraw mechanism | — |
| **Art. 9** | Special categories of data | ✅ | No special category data collected by design | Ensure evaluation scenarios don't expose special category data |
| **Art. 11** | Processing not requiring identification | ✅ | Audit logs anonymized on account deletion | — |

### Chapter III: Rights of the Data Subject (Articles 12–23)

| Article | Right | Status | Implementation | Gap |
|---------|-------|--------|---------------|-----|
| **Art. 12** | Transparent communication | ✅ | Privacy policy in clear language, contact info | — |
| **Art. 13** | Information at collection time | ✅ | Privacy policy, cookie banner, sign-up disclosures | — |
| **Art. 14** | Information not obtained from data subject | ✅ | SSO data source disclosed in privacy policy | — |
| **Art. 15** | Right of access | ✅ | `GET /api/auth/account/export` endpoint | Add in-app UI for data access request |
| **Art. 16** | Right to rectification | ✅ | Profile update functionality | — |
| **Art. 17** | Right to erasure | ✅ | `DELETE /api/auth/account` endpoint (anonymizes audit logs, deletes user) | Add in-app UI for deletion request |
| **Art. 18** | Right to restriction of processing | ✅ | `POST /api/auth/account/restrict` suspends account; middleware enforces restriction | — |
| **Art. 20** | Right to data portability | ✅ | `GET /api/auth/account/export` returns JSON (profile, sessions, audit log) | Add evaluation data to export |
| **Art. 21** | Right to object | ✅ | Cookie consent opt-out, marketing unsubscribe | — |
| **Art. 22** | Automated decision-making | ✅ | No automated decisions with legal effect on users | Document that AI scoring is not automated decision-making under Art. 22 |

### Chapter IV: Controller and Processor (Articles 24–43)

| Article | Requirement | Status | Implementation | Gap |
|---------|------------|--------|---------------|-----|
| **Art. 24** | Responsibility of the controller | ✅ | Privacy program documented in `policies/privacy-program.md`; technical controls implemented | — |
| **Art. 25** | Data protection by design and default | ✅ | Encryption, minimisation, PII redaction, privacy-first defaults | Document privacy-by-design approach |
| **Art. 28** | Processor obligations | ✅ | DPA template in `DPA-TEMPLATE.md`; AWS DPA via Customer Agreement; vendor assessments in `VENDOR-RISK-ASSESSMENTS.md` | — |
| **Art. 30** | Records of processing activities | ✅ | Formal ROPA in `ROPA.md` | — |
| **Art. 32** | Security of processing | ✅ | AES-256, TLS 1.2+, scrypt, WAF, rate limiting, CIS alarms, session controls | — |
| **Art. 33** | Breach notification (72 hours to DPA) | ✅ | Incident response plan in `policies/incident-response-plan.md`; notification templates in `BREACH-NOTIFICATION-TEMPLATES.md` | — |
| **Art. 34** | Breach notification to data subjects | ✅ | Data subject notification template in `BREACH-NOTIFICATION-TEMPLATES.md` | — |
| **Art. 35** | Data Protection Impact Assessment | ✅ | DPIA conducted and documented in `DPIA.md` | — |
| **Art. 37** | Data Protection Officer | ✅ | DPO exemption documented — fewer than 250 employees, no large-scale sensitive data processing. Privacy contact: privacy@ariaeval.io | — |

### Chapter V: International Transfers (Articles 44–49)

| Article | Requirement | Status | Implementation | Gap |
|---------|------------|--------|---------------|-----|
| **Art. 44–46** | Adequate safeguards for transfers | ✅ | AWS EU regions available, AWS DPA includes SCCs | Configure default region as eu-west-1 for EU customers |
| **Art. 49** | Derogations | ✅ | Consent-based for non-EU processing | — |

---

## Data Protection Impact Assessment (DPIA) — Summary

A DPIA is **required** under Art. 35 because we process data that could include:
- Large-scale evaluation of AI systems (systematic processing)
- Adversarial testing scenarios (potentially sensitive content)

### DPIA Scope
| Processing Activity | Risk Level | Mitigation |
|---------------------|-----------|------------|
| User account management | Low | Standard security controls, encryption |
| AI evaluation data processing | Medium | Encryption, tenant isolation, retention limits |
| Adversarial scenario testing | Medium | Content not stored permanently, no PII in scenarios by default |
| Audit log collection | Low | PII redaction, anonymization on deletion |
| Cookie/analytics tracking | Low | Consent-based, granular opt-out |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation | Residual Risk |
|------|-----------|--------|------------|---------------|
| Unauthorized access to eval data | Low | High | WAF, auth, encryption, session controls | Low |
| Data breach of user credentials | Low | High | scrypt + client hashing, no plaintext ever | Very Low |
| Excessive data retention | Medium | Medium | Tiered retention, automated cleanup | Low |
| Cross-border data transfer | Medium | Medium | EU region default, AWS SCCs | Low |
| PII in AI evaluation prompts | Medium | Medium | Customer responsibility, guidance in docs | Low |

---

## Data Flow Diagram

```
User (EU) ──── TLS 1.2+ ────► CloudFront (WAF) ──► S3 (Static Website)
                                    │
                                    ├── TLS ──► ALB ──► ECS Fargate (Auth Backend)
                                    │                       │
                                    │                       ├── scrypt hash ──► SQLite/EFS (encrypted)
                                    │                       ├── audit log ──► CloudWatch Logs
                                    │                       └── session ──► SQLite/EFS
                                    │
User (EU) ──── TLS 1.2+ ────► ALB (WAF) ──► ECS Fargate (Control Plane)
                                                  │
                                                  ├── evaluation data ──► EFS (AES-256)
                                                  ├── AI inference ──► AWS Bedrock (eu-west-1)
                                                  ├── audit events ──► CloudWatch Logs
                                                  └── API calls ──► CloudTrail (S3 encrypted)
```

All data paths are encrypted in transit (TLS 1.2+) and at rest (AES-256).

---

## Cookie Consent Implementation

| Category | Cookies | Required | Legal Basis |
|----------|---------|----------|-------------|
| **Strictly Necessary** | `__session`, `__csrf`, `__Host-next-auth.csrf-token`, `cookie_consent` | Yes | Legitimate interest |
| **Functional** | `aria_preferences`, `aria_region` | No | Consent |
| **Analytics** | `_ga`, `_ga_*`, `_gid`, `aria_analytics` | No | Consent |
| **Marketing** | `_gcl_au`, `li_fat_id` | No | Consent |

**Implementation**: `CookieConsentBanner.tsx` — slide-up banner on first visit, granular toggles per category, consent version tracking, localStorage + cookie storage (365 days).

---

## DPA (Data Processing Agreement) Requirements

When acting as a data processor for customer evaluation data, a DPA must include:

- [ ] Subject matter and duration of processing
- [ ] Nature and purpose of processing
- [ ] Type of personal data and categories of data subjects
- [ ] Obligations and rights of the controller
- [ ] Sub-processor list and notification obligations
- [ ] Data breach notification within 72 hours
- [ ] Data return/deletion on contract termination
- [ ] Right to audit
- [ ] International transfer safeguards (SCCs)

**Template**: Use standard DPA template aligned with EDPB guidelines.

---

## Remediation Roadmap

### Immediate (Q3 2026)
- [ ] Execute DPAs with AWS and LLM providers
- [ ] Complete DPIA document
- [ ] Formalize Records of Processing Activities (ROPA)
- [ ] Add Art. 18 restriction of processing capability
- [ ] Add evaluation data to data export endpoint
- [ ] Build in-app UI for data access and deletion requests
- [ ] Implement automated data retention enforcement

### Short-term (Q4 2026)
- [ ] Appoint DPO or document exemption
- [ ] Incident response plan with 72-hour breach notification
- [ ] Default EU region for EU customers
- [ ] Sub-processor notification mechanism
- [ ] Annual privacy training for staff

### Ongoing
- [ ] Annual DPIA review
- [ ] Quarterly data inventory review
- [ ] Respond to data subject requests within 30 days
- [ ] Update privacy policy on material changes
- [ ] Re-consent mechanism for cookie policy changes
