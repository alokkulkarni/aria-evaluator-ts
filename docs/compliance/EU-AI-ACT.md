# EU AI Act Compliance — ARIA Evaluator

> **Framework**: EU Artificial Intelligence Act (Regulation 2024/1689)  
> **Effective**: August 2024 (phased enforcement through August 2027)  
> **Target**: Compliance assessment by Q4 2026  
> **Scope**: ARIA Evaluator engine and AI-assisted features

---

## What is the EU AI Act?

The EU AI Act is the world's first comprehensive AI regulation. It classifies AI systems by risk level and imposes obligations accordingly. As an **AI evaluation platform**, ARIA Evaluator has a unique position — we are both a tool used to assess AI compliance AND a product that may use AI features internally.

---

## Classification of ARIA Evaluator

### Our AI Systems and Their Risk Level

| Component | AI Usage | Risk Classification | Rationale |
|-----------|----------|---------------------|-----------|
| **Evaluation Engine** | Invokes LLMs to evaluate AI agent responses | **Limited Risk** (Art. 50) | Tool for testing/benchmarking, no autonomous decisions affecting persons |
| **Scoring Rubrics** | LLM-powered quality scoring | **Limited Risk** | Advisory scoring, human reviews results |
| **Adversarial Testing** | Generates adversarial prompts to test AI safety | **Limited Risk** | Security testing tool, not deployed against persons |
| **Website** | No AI features | **Not an AI system** | Static marketing + auth |
| **Dashboard Analytics** | Statistical aggregation | **Not an AI system** | No ML/AI component |

### Why We Are NOT High-Risk

ARIA Evaluator does NOT:
- Make decisions affecting natural persons' rights (Art. 6(2))
- Operate in safety-critical domains (Annex I)
- Perform biometric identification, critical infrastructure, education scoring, employment, or law enforcement (Annex III)
- Generate deepfakes or synthetic media for deception

### Our Obligations as a Limited-Risk AI System

The authoritative system registry, limited-risk classification rationale, and GPAI documentation are maintained in [`AI-SYSTEM-INVENTORY.md`](./AI-SYSTEM-INVENTORY.md).

| Obligation | Article | Status | Implementation |
|-----------|---------|--------|---------------|
| **Transparency** | Art. 50 | ✅ | AI-generated content labelled in UI |
| **AI system disclosure** | Art. 50(1) | ✅ | [`AI-SYSTEM-INVENTORY.md`](./AI-SYSTEM-INVENTORY.md) documents AI systems, risk classification rationale, and GPAI dependencies |
| **Human oversight** | Art. 50 | ✅ | Scores are advisory — users interpret and act on results |

---

## Obligations as an AI Evaluation Tool Provider

While ARIA Evaluator is limited-risk itself, our **customers** may use us to evaluate high-risk AI systems. This creates indirect obligations:

### Supporting Customer Compliance

| Customer Need | EU AI Act Article | ARIA Feature |
|--------------|-------------------|--------------|
| Testing AI system accuracy | Art. 9(2) | Evaluation scenarios with deterministic scoring |
| Bias detection | Art. 10(2) | Adversarial fairness scenarios |
| Robustness testing | Art. 15 | Adversarial attack scenarios (prompt injection, jailbreak, etc.) |
| Documenting AI performance | Art. 11 | Evaluation reports with scores and transcripts |
| Post-market monitoring | Art. 72 | Recurring evaluation runs with trend tracking |
| Risk management | Art. 9 | Comprehensive scenario library (149+ scenarios) |
| Human oversight verification | Art. 14 | Agent response evaluation with human-readable reports |

### Features to Enhance EU AI Act Alignment

- [ ] **AI Act compliance report template** — Generate reports structured per Art. 11 technical documentation requirements
- [ ] **Bias evaluation module** — Specific scenarios testing for protected characteristics (Art. 10)
- [ ] **Conformity assessment export** — Format evaluation results for notified body review
- [ ] **Risk level classification helper** — Help customers determine their AI system's risk classification
- [ ] **Fundamental rights impact module** — Scenarios aligned with Art. 27 requirements

---

## AI Literacy Obligation (Art. 4)

**Effective**: February 2, 2025

All organisations deploying or developing AI must ensure sufficient AI literacy among their staff.

| Requirement | Status | Action |
|-------------|--------|--------|
| Staff AI literacy | ✅ | Founding team is AI-native; AI literacy and secure development training requirements are defined in [`policies/sdlc-policy.md`](./policies/sdlc-policy.md) |
| Documented training | ✅ | Training completion is documented under the process defined in [`policies/sdlc-policy.md`](./policies/sdlc-policy.md) |
| Proportionate to role | ✅ | Role-based training expectations are defined in [`policies/sdlc-policy.md`](./policies/sdlc-policy.md) |

---

## General-Purpose AI (GPAI) Model Usage (Art. 51–56)

ARIA Evaluator **uses** GPAI models (Claude, GPT, etc.) but does not **provide** them. Our obligations as a **downstream deployer**:

| Obligation | Status | Implementation |
|-----------|--------|---------------|
| Use GPAI in accordance with provider terms | ✅ | AWS Bedrock, OpenAI ToS compliance |
| Maintain records of GPAI usage | ✅ | [`AI-SYSTEM-INVENTORY.md`](./AI-SYSTEM-INVENTORY.md) records GPAI providers, models, versions, and intended use |
| Report incidents involving GPAI | ✅ | [`policies/incident-response-plan.md`](./policies/incident-response-plan.md) and [`BREACH-NOTIFICATION-TEMPLATES.md`](./BREACH-NOTIFICATION-TEMPLATES.md) cover AI/provider incident escalation |
| Respect provider-imposed limitations | ✅ | API usage within provider limits |

---

## Prohibited Practices (Art. 5)

**Effective**: February 2, 2025

We must confirm ARIA Evaluator does NOT enable any prohibited AI practices:

| Prohibited Practice | Risk | ARIA Status |
|---------------------|------|-------------|
| Social scoring | None | ❌ Not applicable — we score AI systems, not people |
| Subliminal manipulation | None | ❌ Not applicable — no user-facing AI decisions |
| Exploiting vulnerabilities | None | ❌ Not applicable — adversarial testing is on AI systems, not persons |
| Real-time biometric identification | None | ❌ Not applicable |
| Emotion recognition in workplace/education | None | ❌ Not applicable |
| Predictive policing | None | ❌ Not applicable |

**Assessment**: ✅ No prohibited practices identified.

---

## Timeline for EU AI Act Compliance

| Date | Milestone | ARIA Impact |
|------|-----------|-------------|
| Feb 2, 2025 | Prohibited practices + AI literacy | ✅ No prohibited practices; literacy training needed |
| Aug 2, 2025 | GPAI obligations | ✅ [`AI-SYSTEM-INVENTORY.md`](./AI-SYSTEM-INVENTORY.md) documents GPAI model usage |
| Aug 2, 2026 | High-risk AI obligations (Annex III) | ℹ️ Not directly applicable but supports customer compliance |
| Aug 2, 2027 | Full enforcement | All obligations active |

---

## Remediation Roadmap

### Immediate (Q3 2026)
- [ ] Document AI system classification rationale
- [ ] Add AI disclosure labels to all AI-generated content (scores, evaluations)
- [ ] Begin AI literacy training development

### Short-term (Q4 2026)
- [ ] GPAI model usage documentation
- [ ] AI Act compliance report template for customers
- [ ] AI literacy training rollout

### Medium-term (2027)
- [ ] Bias evaluation scenario module
- [ ] Conformity assessment export format
- [ ] Annual AI Act compliance review
