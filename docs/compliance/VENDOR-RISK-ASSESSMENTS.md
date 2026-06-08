# Vendor Risk Assessments

- **Effective date:** June 2026
- **Version:** 1.0
- **Owner:** Founder / Security Lead
- **Next review date:** June 2027

## Purpose

This document summarizes the current vendor risk posture for ARIA Evaluator's core third-party providers. It is intended to support customer diligence, privacy reviews, and lightweight startup vendor management.

## Vendor Assessment Register

| Name | Service | Data Shared | Certifications | Risk Level | DPA Status | Last Reviewed |
|---|---|---|---|---|---|---|
| AWS | Infrastructure (compute, storage, CDN, WAF) | All platform data | SOC 2 Type II, ISO 27001, GDPR DPA | Low risk | DPA via AWS Customer Agreement | June 2026 |
| AWS Bedrock | LLM inference | Evaluation prompts/responses | SOC 2, no training on customer data | Low risk | Covered by AWS DPA | June 2026 |
| Stripe | Payment processing | Billing data, email | PCI DSS Level 1, SOC 2 | Low risk | DPA available | June 2026 |
| GitHub | Source code hosting | Source code only, no customer data | SOC 2 Type II | Low risk | DPA via GitHub ToS | June 2026 |
| Google OAuth | Authentication | Email, name (from consent) | ISO 27001, SOC 2 | Low risk | Google DPA | June 2026 |
| GitHub OAuth | Authentication | Email, username (from consent) | SOC 2 | Low risk | GitHub DPA | June 2026 |

## Assessment Notes

### AWS

AWS is the primary infrastructure provider for hosting, storage, networking, WAF, and platform security controls. Risk is assessed as low based on maturity, certifications, and broad enterprise adoption, subject to ongoing configuration management.

### AWS Bedrock

AWS Bedrock is used for managed LLM inference. The current assessment assumes customer data submitted through Bedrock is not used to train the underlying models and remains governed through AWS contractual controls.

### Stripe

Stripe handles payment card and billing workflows. ARIA Evaluator does not intend to store raw card numbers and relies on Stripe's PCI DSS and security program for payment processing.

### GitHub

GitHub is used for source code hosting and collaboration. Customer production data should not be stored in GitHub repositories except where intentionally redacted for support or debugging.

### OAuth Providers

Google OAuth and GitHub OAuth are used as optional authentication providers. Data shared is limited to user profile information returned through user consent and kept to a practical minimum.

## Sub-Processor Notification Process

We will notify customers via email at least **30 days** before adding a new sub-processor.

## Review Process

Vendor risk assessments should be reviewed at least annually and sooner if:

- A new critical vendor is introduced
- A vendor materially changes its security or privacy terms
- A vendor incident changes the assessed risk level
- A customer requires an updated vendor review as part of diligence

## Document History

| Version | Date | Description | Owner |
|---|---|---|---|
| 1.0 | June 2026 | Initial release | Founder / Security Lead |
