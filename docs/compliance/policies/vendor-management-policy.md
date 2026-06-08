# Vendor Management Policy

- **Effective date:** June 2026
- **Version:** 1.0
- **Owner:** Founder / Security Lead
- **Next review date:** December 2026

## Purpose

ARIA Evaluator uses a focused set of vendors to run its platform. This policy defines how vendors are selected, reviewed, and monitored in a practical way for a small SaaS company.

## Scope

This policy applies to vendors that host company data, process customer data, support core engineering workflows, or materially affect security, privacy, or service availability.

## Primary Vendors

| Vendor | Purpose | Notes |
|---|---|---|
| **AWS** | Core infrastructure hosting | AWS maintains widely recognized certifications including SOC 2 and ISO 27001 |
| **LLM providers via AWS Bedrock** | Model inference services | Used within the AWS security boundary where supported by the Bedrock integration model |
| **Stripe** | Payment processing | Stripe maintains PCI DSS Level 1 posture for card processing |
| **GitHub** | Source code hosting and collaboration | GitHub maintains widely used security certifications including SOC 2 |

## Risk Assessment Approach

ARIA Evaluator uses a lightweight vendor review process proportionate to risk:

- Review new material vendors before adoption
- Consider what data the vendor processes, where it is hosted, and what access it receives
- Prioritize vendors with **SOC 2, ISO 27001, or equivalent** independent assurance
- Perform an **annual review** of critical vendors or sooner if risk changes materially

## Contract and Privacy Requirements

For vendors acting as data processors or sub-processors, ARIA Evaluator expects:

- Appropriate contractual terms, including confidentiality obligations
- A **Data Processing Agreement (DPA)** where personal data processing requires it
- Reasonable security commitments and breach-notification obligations
- Visibility into relevant sub-processor or hosting arrangements where appropriate

## Monitoring and Escalation

Material vendor issues, including breaches, major outages, or loss of compliance posture, should be assessed by the Founder / Security Lead for impact on ARIA Evaluator customers and operations. Where needed, compensating controls, vendor replacement, or customer notification will be considered.

## Document History

| Version | Date | Description | Owner |
|---|---|---|---|
| 1.0 | June 2026 | Initial release | Founder / Security Lead |
