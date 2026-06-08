# CCPA / CPRA Compliance — ARIA Evaluator

> **Framework**: California Consumer Privacy Act (as amended by CPRA)  
> **Effective**: January 1, 2023 (CPRA amendments)  
> **Scope**: Personal information of California residents  
> **Threshold**: Applies if annual revenue > $25M, or process 100K+ consumers/households, or derive 50%+ revenue from selling/sharing PI

> **Note**: CCPA does not apply to ARIA Evaluator pre-revenue (requires $25M+ revenue or 100K+ consumers). This document is maintained for future reference.

---

## What is CCPA/CPRA?

The California Consumer Privacy Act (CCPA), as amended by the California Privacy Rights Act (CPRA), grants California residents rights over their personal information. It applies to businesses meeting revenue or data processing thresholds.

**Why we need it**: US enterprise customers expect CCPA compliance. Many procurement processes require it alongside SOC 2.

---

## Consumer Rights Mapping

| Right | CCPA Section | Status | ARIA Implementation |
|-------|-------------|--------|---------------------|
| Right to know | §1798.100, .110 | ✅ | Privacy policy details data collection |
| Right to delete | §1798.105 | ✅ | `DELETE /api/auth/account` endpoint |
| Right to opt-out of sale/sharing | §1798.120 | ✅ | We do not sell or share PI; documented in privacy policy |
| Right to non-discrimination | §1798.125 | ✅ | Equal service regardless of rights exercise |
| Right to correct | §1798.106 | ✅ | Profile update functionality |
| Right to limit use of sensitive PI | §1798.121 | ✅ | Minimal sensitive PI collected (email, hashed password only) |
| Right to data portability | §1798.130 | ✅ | `GET /api/auth/account/export` — structured JSON download |

---

## Personal Information Categories

| Category (CCPA §1798.140) | Collected? | Examples | Purpose |
|---------------------------|-----------|----------|---------|
| A. Identifiers | ✅ | Email, username, IP address | Account management, security |
| B. Customer records | ✅ | Email, billing info | Service delivery, billing |
| C. Protected characteristics | ❌ | Not collected | — |
| D. Commercial information | ✅ | Subscription plan, usage data | Service delivery |
| E. Biometric information | ❌ | Not collected | — |
| F. Internet activity | ✅ | Pages visited, evaluation runs | Service improvement, analytics |
| G. Geolocation data | ❌ | Not collected (no precise location) | — |
| H. Sensory data | ❌ | Not collected | — |
| I. Professional/employment | ❌ | Not collected | — |
| J. Education information | ❌ | Not collected | — |
| K. Inferences | ❌ | No profiling or inference | — |
| L. Sensitive PI | ✅ | Account login (email + password hash) | Authentication |

---

## Required Disclosures

### Privacy Policy Requirements (§1798.130)

| Disclosure | Status | Location |
|-----------|--------|----------|
| Categories of PI collected | ✅ | Privacy policy |
| Purposes for collection | ✅ | Privacy policy |
| Categories of PI disclosed | ✅ | Privacy policy |
| Right to delete | ✅ | Privacy policy |
| Right to opt-out | ✅ | Privacy policy (no sale/sharing) |
| "Do Not Sell or Share" link | ✅ | Not needed (we don't sell/share) |
| Financial incentive disclosure | ✅ | No financial incentives offered |
| Retention periods | ✅ | Privacy policy (tiered retention) |

### Cookie/Tracking Disclosures

| Requirement | Status | Implementation |
|-------------|--------|---------------|
| Cookie consent for analytics/marketing | ✅ | CookieConsentBanner with granular opt-out |
| "Do Not Track" signal honoured | ✅ | DNT respected per cookie policy |
| Third-party cookie disclosure | ✅ | Cookie policy lists all third-party cookies |

---

## Service Provider Agreements

As a "service provider" under CCPA when processing customer data:

- [ ] Service provider agreement with customers (in Terms)
- [ ] Contractual prohibition on selling/sharing customer data
- [ ] Obligation to assist customers with consumer requests
- [ ] Notification of sub-service provider changes

---

## CCPA vs GDPR Overlap

| Area | GDPR | CCPA | ARIA Status |
|------|------|------|-------------|
| Right to access | Art. 15 | §1798.100 | ✅ Same endpoint |
| Right to delete | Art. 17 | §1798.105 | ✅ Same endpoint |
| Right to portability | Art. 20 | §1798.130 | ✅ Same endpoint |
| Consent for cookies | ePrivacy Directive | §1798.120 | ✅ Same banner |
| Data minimisation | Art. 5(1)(c) | §1798.100(c) | ✅ Same approach |
| Breach notification | Art. 33 (72 hours) | §1798.82 (expedient) | ✅ [`policies/incident-response-plan.md`](./policies/incident-response-plan.md) and [`BREACH-NOTIFICATION-TEMPLATES.md`](./BREACH-NOTIFICATION-TEMPLATES.md) plus existing GDPR export/delete/restrict controls |

**Efficiency**: Our GDPR compliance covers ~90% of CCPA requirements. The primary additional effort is California-specific disclosures.

---

## Remediation Roadmap

### Immediate
- [ ] Verify privacy policy meets all CCPA disclosure requirements
- [ ] Add California-specific rights section to privacy policy
- [ ] Confirm "Do Not Sell" is documented (even though we don't sell)

### Short-term
- [ ] CCPA-specific consumer request intake process (30-day response, 45-day extension)
- [ ] Identity verification process for consumer requests
- [ ] Employee training on CCPA consumer rights

### Estimated Cost
Minimal incremental cost if GDPR compliance is already achieved (~$2,000–5,000 for legal review).
