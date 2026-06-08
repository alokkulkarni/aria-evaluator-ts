# Data Classification Policy

- **Effective date:** June 2026
- **Version:** 1.0
- **Owner:** Founder / Security Lead
- **Next review date:** December 2026

## Purpose

This policy defines how ARIA Evaluator classifies and handles information so the team can apply appropriate security controls without unnecessary complexity.

## Scope

This policy applies to data created, processed, stored, or transmitted by ARIA Evaluator across company systems, cloud infrastructure, support tools, and approved vendor platforms.

## Classification Levels

### 1. Public

**Examples**

- Marketing website content
- Published product documentation
- Public blog posts, job listings, and press materials

**Handling rules**

- May be shared publicly without approval once officially released
- Should still be accurate and not misleading

**Storage requirements**

- May be stored in approved public repositories, website systems, and documentation platforms

**Sharing rules**

- Public sharing is permitted

**Disposal**

- Standard deletion or archival

### 2. Internal

**Examples**

- Source code
- Internal architecture notes
- Configuration files without secrets
- Internal policies, roadmaps, and operating procedures

**Handling rules**

- Use for company business only
- Limit sharing to ARIA Evaluator personnel and approved contractors

**Storage requirements**

- Store only in approved company systems such as GitHub, AWS, and authorized collaboration tools

**Sharing rules**

- External sharing requires business need and owner approval

**Disposal**

- Delete from active systems when no longer needed; archive only in approved locations

### 3. Confidential

**Examples**

- Customer account data
- Evaluation data, prompts, outputs, transcripts, and reports
- Credentials, tokens, and non-public infrastructure details
- Security logs and incident records

**Handling rules**

- Access only on a need-to-know basis
- Do not copy into personal tools, personal storage, or unapproved SaaS products
- Use encryption in transit and approved storage locations

**Storage requirements**

- Store only in approved company-managed systems with access controls and encryption at rest

**Sharing rules**

- Share internally only with authorized personnel
- Share externally only under contract, business need, and approved security/privacy terms

**Disposal**

- Secure deletion where supported; follow retention schedules and vendor deletion workflows

### 4. Restricted

**Examples**

- Encryption keys
- Production secrets and secret manager values
- Break-glass credentials
- Root or administrator recovery materials

**Handling rules**

- Highest access restriction level
- Never share by chat, email, tickets, or plaintext documents
- Use only approved secret-management mechanisms
- Access must be tightly limited and auditable where possible

**Storage requirements**

- Store only in approved secret stores or key-management systems
- Local storage is prohibited except for short-lived, approved emergency handling

**Sharing rules**

- Share only with explicitly authorized personnel and only through approved secure channels

**Disposal**

- Rotate, revoke, or securely destroy as appropriate; remove obsolete copies immediately

## Default Classification

If information is not clearly labeled, team members should treat it as **Internal** at minimum. If it contains customer data, credentials, or security-sensitive details, it should be treated as **Confidential** or **Restricted** until clarified.

## Responsibilities

The creator or system owner is responsible for applying the appropriate classification. The Founder / Security Lead may resolve classification questions and require stronger handling where warranted.

## Document History

| Version | Date | Description | Owner |
|---|---|---|---|
| 1.0 | June 2026 | Initial release | Founder / Security Lead |
