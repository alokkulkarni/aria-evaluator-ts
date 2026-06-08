# Records of Processing Activities (ROPA)

- **Effective date:** June 2026
- **Version:** 1.0
- **Owner:** Founder / Security Lead
- **Date of last update:** June 2026
- **Controller:** AriaEval Ltd
- **DPO contact:** privacy@ariaeval.io

## Purpose

This Record of Processing Activities is maintained for ARIA Evaluator in support of GDPR Article 30. It summarizes the main categories of personal data processing carried out by AriaEval Ltd as controller and, where relevant, processor.

## ROPA Table

| Processing Activity | Purpose | Legal Basis | Categories of Data Subjects | Categories of Personal Data | Recipients | Transfers to Third Countries | Retention Period | Security Measures |
|---|---|---|---|---|---|---|---|---|
| User account registration | Create and maintain customer user accounts | Contract | Customers, trial users, authorized customer employees | Email, username, password hash | Internal operations staff, AWS hosting providers | Possible where infrastructure or support providers operate outside EEA under SCCs | Active account life plus up to 90 days for account closure handling | TLS, encryption at rest, password hashing, RBAC |
| User authentication & session management | Secure sign-in, session continuity, fraud detection, account protection | Legitimate interest | Customers, trial users, authorized customer employees | IP address, user-agent, session tokens, login events | Internal operations staff, AWS hosting providers | Possible under SCCs where support or infrastructure requires transfer | Session duration plus short-lived security retention as needed | Secure cookies, token controls, logging, access restrictions |
| AI evaluation execution | Run evaluations and store results for customer use | Contract | Customer end users represented in prompts, customer employees, authorized platform users | Prompts, responses, scores, run metadata | AWS, AWS Bedrock, customer-configured model providers where applicable | Possible where chosen model or infrastructure providers operate outside EEA under SCCs | 30-90 days depending on plan or configured retention | Encryption, tenant separation, least privilege, retention controls |
| Audit logging | Maintain accountability, investigate incidents, support security operations | Legitimate interest | Platform users, customer users, support personnel | User actions, IP address, timestamps, account identifiers | Internal operations staff, security reviewers, AWS logging infrastructure | Possible under SCCs if logs are processed outside EEA | 12 months | Centralized logging, restricted access, immutable-style retention practices |
| Cookie / analytics | Measure site and product usage, remember preferences, improve experience | Consent | Website visitors, users | Browsing data, cookie IDs, device/browser metadata, consent records | Analytics providers, AWS hosting providers | Possible under SCCs depending on analytics provider configuration | Per cookie schedule and consent lifecycle | Consent banner, opt-out controls, minimized analytics collection |
| Payment processing | Process subscriptions and maintain billing records | Contract | Paying customers, billing contacts | Billing information, email, transaction metadata | Stripe, finance and operations personnel | Possible under SCCs or equivalent vendor safeguards | Per tax, finance, and dispute handling requirements | Payment processor segregation, vendor controls, restricted internal access |
| Marketing communications | Send newsletters, product updates, and event communications | Consent | Newsletter subscribers, prospects, customer contacts | Email, marketing preferences, interaction history | Email service providers, internal marketing staff | Possible under SCCs depending on provider location | Until consent withdrawn or records become stale | Consent tracking, unsubscribe controls, least-privilege access |
| Customer support | Respond to support requests and resolve incidents | Contract | Customers, trial users, authorized customer employees | Correspondence, contact details, troubleshooting context, account metadata | Internal support staff, AWS hosting providers | Possible under SCCs if support tooling stores data outside EEA | For the life of the support relationship plus limited archival period | Ticket access controls, logging, encryption, support need-to-know access |

## Notes

- AriaEval Ltd acts as **controller** for account, billing, website, analytics, marketing, and support processes.
- AriaEval Ltd acts as **processor** for customer evaluation data processed on behalf of customers.
- Where international transfers occur, they are managed through AWS contractual safeguards and other vendor transfer mechanisms, including Standard Contractual Clauses where required.

## Document History

| Version | Date | Description | Owner |
|---|---|---|---|
| 1.0 | June 2026 | Initial release | Founder / Security Lead |
