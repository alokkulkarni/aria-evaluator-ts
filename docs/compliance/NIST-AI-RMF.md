# NIST AI Risk Management Framework — ARIA Evaluator

> **Framework**: NIST AI RMF 1.0 (January 2023)  
> **Priority**: P3 — Future  
> **Target**: Alignment by Q3 2027  
> **Scope**: Evaluator engine and AI-related features  
> **Note**: Voluntary framework (not a regulation) but increasingly referenced in procurement

---

## What is NIST AI RMF?

The NIST AI Risk Management Framework provides a structured approach to identifying, assessing, and mitigating risks associated with AI systems. While voluntary, it is increasingly adopted by US federal agencies and referenced in enterprise procurement. For ARIA Evaluator — an AI evaluation tool — alignment demonstrates that we practice what we preach.

---

## Framework Functions

### GOVERN — Establish AI Risk Management Culture

| Category | Status | ARIA Implementation | Gap |
|----------|--------|---------------------|-----|
| GV 1.1 — Legal/regulatory awareness | ✅ | EU AI Act awareness, GDPR compliance | Document AI governance policy |
| GV 1.2 — Trustworthy AI characteristics | ✅ | Our product tests for these (fairness, safety, robustness) | Apply internally |
| GV 2.1 — Roles and responsibilities | ✅ | AI roles, ownership, and approval responsibilities are documented in [`AI-SYSTEM-INVENTORY.md`](./AI-SYSTEM-INVENTORY.md) and [`policies/information-security-policy.md`](./policies/information-security-policy.md) | — |
| GV 3.1 — Workforce AI literacy | ✅ | Founding team is AI-native; AI literacy and secure development training requirements are defined in [`policies/sdlc-policy.md`](./policies/sdlc-policy.md) | — |
| GV 4.1 — Organizational commitment | ✅ | Organizational commitment to responsible AI use is documented in [`AI-SYSTEM-INVENTORY.md`](./AI-SYSTEM-INVENTORY.md) and [`policies/information-security-policy.md`](./policies/information-security-policy.md) | — |
| GV 5.1 — Risk tolerance | ✅ | Risk classification boundaries and acceptable use assumptions are documented in [`AI-SYSTEM-INVENTORY.md`](./AI-SYSTEM-INVENTORY.md) and [`DPIA.md`](./DPIA.md) | — |
| GV 6.1 — Policies and procedures | ✅ | Internal AI usage and development procedures are defined in [`AI-SYSTEM-INVENTORY.md`](./AI-SYSTEM-INVENTORY.md) and [`policies/sdlc-policy.md`](./policies/sdlc-policy.md) | — |

### MAP — Contextualise and Identify AI Risks

| Category | Status | ARIA Implementation | Gap |
|----------|--------|---------------------|-----|
| MP 1.1 — Intended purpose | ✅ | [`AI-SYSTEM-INVENTORY.md`](./AI-SYSTEM-INVENTORY.md) documents intended purpose and system boundaries | — |
| MP 2.1 — Likelihood and severity of harm | ✅ | [`DPIA.md`](./DPIA.md) captures likelihood/severity of harm and the low-risk rationale | — |
| MP 3.1 — Benefits vs risks | ✅ | Benefits: better AI safety. Risks: minimal | — |
| MP 4.1 — Impact on individuals | ✅ | No direct impact on individuals | — |
| MP 5.1 — Assess data quality | ✅ | Scenario library with structured data | Data quality documentation |

### MEASURE — Assess, Analyse, Track AI Risks

| Category | Status | ARIA Implementation | Gap |
|----------|--------|---------------------|-----|
| MS 1.1 — Approaches for measurement | ✅ | 149+ evaluation scenarios with scoring rubrics | — |
| MS 2.1 — Evaluate AI system performance | ✅ | Dashboard with scores, trends, reports | — |
| MS 2.2 — Evaluate trustworthiness | ✅ | Adversarial scenarios test for safety, fairness, robustness | Document methodology |
| MS 2.3 — Track risks over time | ✅ | Evaluation run history, trend analysis | Add risk tracking dashboard |
| MS 2.5 — Bias testing | ✅ | Adversarial fairness and bias scenarios | Expand coverage |
| MS 2.6 — Evaluate transparency | ✅ | Transcript viewer shows full agent interactions | — |
| MS 3.1 — Risk measurement feedback | ✅ | Evaluation history, customer-visible scoring, and the adversarial scenario library provide a continuous risk feedback loop | — |

### MANAGE — Respond to AI Risks

| Category | Status | ARIA Implementation | Gap |
|----------|--------|---------------------|-----|
| MG 1.1 — Prioritise risks | ✅ | Quality score thresholds (Needs Review < 6, Approved > 8) | — |
| MG 2.1 — Plan risk responses | ✅ | Evaluation reports with actionable insights | — |
| MG 2.2 — Implement responses | ✅ | Re-run evaluations after fixes | — |
| MG 3.1 — Pre-deployment testing | ✅ | Core product purpose — test before deploy | — |
| MG 3.2 — Post-deployment monitoring | ✅ | Recurring evaluation capability | API integration for CI/CD |
| MG 4.1 — Incident response | ✅ | [`policies/incident-response-plan.md`](./policies/incident-response-plan.md) covers AI-related incidents and model/provider escalations | — |

---

## ARIA Evaluator as an AI RMF Enabler

ARIA Evaluator's core value proposition directly supports NIST AI RMF adoption for our customers:

| NIST AI RMF Function | How ARIA Helps Customers |
|----------------------|-------------------------|
| **MAP** | Comprehensive scenario library identifies risks across safety, security, fairness |
| **MEASURE** | Automated evaluation with scoring, trends, and benchmarking |
| **MANAGE** | Actionable reports, re-testing capability, CI/CD integration |
| **GOVERN** | Audit trail of evaluation runs for compliance evidence |

### Feature Roadmap for NIST AI RMF Support
- [ ] NIST AI RMF compliance report template
- [ ] Risk categorization aligned with NIST trustworthiness characteristics
- [ ] Automated risk register generation from evaluation results
- [ ] NIST AI RMF profile generator based on evaluation data

---

## Remediation Roadmap

### Short-term (alignment)
- [ ] Map ARIA's internal AI use to NIST AI RMF categories
- [ ] Document AI risk assessment
- [ ] AI governance policy

### Medium-term (customer-facing)
- [ ] NIST AI RMF report template in evaluator
- [ ] Trustworthiness characteristic scoring alignment
- [ ] Marketing positioning around NIST AI RMF support

### Estimated Cost
Minimal — primarily internal documentation effort ($5,000–10,000 if using consultants). No formal certification exists; alignment is self-declared.
