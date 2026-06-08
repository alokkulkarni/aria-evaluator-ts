# Data Protection Impact Assessment (DPIA)

- **Effective date:** June 2026
- **Version:** 1.0
- **Owner:** Founder / Security Lead
- **Review schedule:** Annual
- **Next review date:** June 2027

## Purpose

This Data Protection Impact Assessment is maintained for ARIA Evaluator (ariaeval.io) in support of GDPR Article 35. It covers the startup's core processing of customer AI evaluation data and user account information.

## Project Description

ARIA Evaluator is a pre-revenue AI evaluation SaaS platform. The service processes AI evaluation data on behalf of customers, including prompts, model responses, and scores generated during evaluation workflows. Users create accounts using email and password credentials. The platform also generates operational audit logs, security logs, and limited analytics data required to operate and improve the service.

ARIA Evaluator generally acts as:

- **Controller** for its own account, website, analytics, billing, and support data
- **Processor** for customer evaluation data processed through the platform

## Necessity and Proportionality

ARIA Evaluator collects and retains only the data needed to operate the service and meet security, support, and compliance obligations.

### Data minimization

- User account creation requires only **email** and **username** plus a password-derived verifier
- No unnecessary profile fields are required for core product use
- Evaluation data is customer-supplied and limited to the content needed to run AI evaluations

### Retention

- Evaluation data is retained for **30-90 days** depending on product configuration and plan
- Audit logs are retained for **12 months**
- Authentication and operational records are retained only as long as necessary for service security and troubleshooting

### Proportionality controls

- Encryption in transit and at rest
- Strong authentication controls and password hashing
- Role-based access to production systems
- Default use of EU hosting where appropriate for EU customers
- Automated cleanup to reduce over-retention risk

## Data Processing Activities

| Activity | Description | Role |
|---|---|---|
| Account management | Create and manage user accounts, credentials, and access settings | Controller |
| AI evaluation execution | Process customer prompts, responses, and scores to run evaluation workflows | Processor |
| Audit logging | Record security-relevant user and system events for accountability and incident response | Controller / Processor support |
| Analytics | Collect limited browsing and product usage analytics where consent or lawful basis applies | Controller |

## Assessment of Risks to Rights and Freedoms

| Risk | Likelihood (Low/Med/High) | Impact (Low/Med/High) | Mitigation | Residual Risk |
|---|---|---|---|---|
| Unauthorized access to eval data | Low | High | WAF, strong authentication, tenant-aware access controls, encryption in transit and at rest | Low |
| Credential breach | Low | High | scrypt password hashing, client-side hashing support, no plaintext password storage | Very Low |
| Excessive retention | Low | Medium | Tiered retention schedules, automated cleanup jobs, periodic retention review | Low |
| Cross-border transfer | Low | Medium | EU region default for applicable customers, AWS Standard Contractual Clauses and transfer safeguards | Low |
| PII in AI prompts | Medium | Medium | Customer responsibility defined in terms and DPA, product guidance discouraging unnecessary PII submission | Low |
| Insider threat | Low | Medium | RBAC, audit logging, least-privilege access, restricted production access | Low |

## Additional Safeguards

- Access to production environments is limited to authorized personnel
- Security events are logged and reviewed as part of incident response
- Vendors used for hosting, inference, and payments are reviewed through vendor risk management
- Contractual controls are available for enterprise customers through a DPA template

## Conclusion

The processing described in this DPIA is necessary and proportionate to ARIA Evaluator's purpose as an AI evaluation service. With the controls described above, the remaining residual risks are acceptable for the current scale and nature of the business.

## Review Schedule

This DPIA will be reviewed **annually**, upon material architecture changes, upon introduction of new sub-processors that materially affect risk, or if the business begins processing special categories of data at scale.

- **Next scheduled review:** June 2027

## DPO / Privacy Review Sign-Off

- **DPO / Privacy Contact:** privacy@ariaeval.io
- **Signature:** ______________________________
- **Name:** ______________________________
- **Date:** ______________________________

## Document History

| Version | Date | Description | Owner |
|---|---|---|---|
| 1.0 | June 2026 | Initial release | Founder / Security Lead |
