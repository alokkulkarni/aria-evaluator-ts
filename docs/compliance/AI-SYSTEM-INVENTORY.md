# AI System Inventory

- **Effective date:** June 2026
- **Version:** 1.0
- **Owner:** Founder / Security Lead
- **Framework reference:** EU AI Act operational inventory

## Purpose

This inventory lists the AI systems used by ARIA Evaluator and documents their current risk classification, usage boundaries, and transparency commitments.

## AI System Inventory

| System | Description | Risk Level | Provider | Purpose | Transparency |
|---|---|---|---|---|---|
| Evaluation Scoring Engine | Invokes LLMs to score AI agent responses | Limited Risk | AWS Bedrock / customer-configured | Quality assessment | Scores labelled as AI-generated |
| Adversarial Test Generator | Generates adversarial prompts | Limited Risk | Internal | Security testing | Results labelled as AI-generated |
| Report Summarization | LLM generates evaluation summaries | Limited Risk | AWS Bedrock | Documentation | Summaries labelled as AI-generated |

## Classification Rationale

ARIA Evaluator does not currently fall into the EU AI Act's high-risk categories under Annex III because the platform:

- Does not make or automate decisions about natural persons that have legal or similarly significant effects
- Is not used for biometric identification, employment decisioning, education scoring, migration control, law enforcement, or access to essential services
- Primarily provides evaluation, testing, scoring assistance, and documentation support for AI systems operated by customers
- Presents outputs as advisory and reviewable rather than binding automated decisions

For these reasons, the systems listed above are treated as **limited-risk** systems with a practical focus on transparency and human oversight.

## GPAI Model Usage Documentation

ARIA Evaluator may access general-purpose AI models such as **Claude**, **GPT-4-class models**, and other provider models through managed APIs, including AWS Bedrock and customer-configured endpoints. ARIA Evaluator does **not** fine-tune these models and does not claim ownership of the underlying GPAI models. Model use is limited to inference for scoring, test generation, and summarization.

Current operating assumptions:

- Models are accessed via API
- No fine-tuning is performed by ARIA Evaluator
- Customer-selected models may vary by deployment configuration
- AI-generated outputs are presented with clear labeling where surfaced to users

## AI Literacy Requirements

ARIA Evaluator's team is AI-native and works directly with LLM-based systems. Team members are expected to maintain practical literacy in:

- Appropriate use of AI evaluation workflows
- Known limitations of LLM-generated scoring and summaries
- Prompt safety, privacy, and data handling expectations
- Applicable obligations under the EU AI Act and customer contractual commitments

This requirement is met through ongoing role-based learning, product familiarity, and founder-led oversight rather than a heavy enterprise training program at the current company stage.

## Prohibited Practices Self-Assessment

ARIA Evaluator has reviewed the prohibited practices in the EU AI Act and does not currently engage in them.

| Practice Area | Status | Notes |
|---|---|---|
| Social scoring of people | Clear | Platform scores AI system outputs, not natural persons |
| Subliminal or manipulative AI practices | Clear | No such product use case |
| Exploitation of vulnerabilities | Clear | Security testing targets AI systems, not vulnerable individuals |
| Real-time biometric identification | Clear | Not part of the product |
| Emotion recognition in prohibited contexts | Clear | Not part of the product |

**Overall assessment:** All clear.

## Document History

| Version | Date | Description | Owner |
|---|---|---|---|
| 1.0 | June 2026 | Initial release | Founder / Security Lead |
