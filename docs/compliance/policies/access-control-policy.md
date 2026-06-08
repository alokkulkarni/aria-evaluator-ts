# Access Control Policy

- **Effective date:** June 2026
- **Version:** 1.0
- **Owner:** Founder / Security Lead
- **Next review date:** December 2026

## Purpose

This policy defines how ARIA Evaluator grants, uses, reviews, and removes access to systems and data.

## Scope

This policy applies to company systems, cloud infrastructure, production and non-production environments, source repositories, support tools, and customer-facing platform access.

## Access Model

ARIA Evaluator uses a simple **role-based access control (RBAC)** model appropriate for its size.

### Platform Roles

- **Admin:** internal personnel who manage the platform, users, billing, support, or security-sensitive operations
- **User:** customer or end-user account with access limited to their authorized tenant and workflows

Additional role separation may be introduced as the team and product mature.

## Access Principles

- Grant the **least privilege** needed for the task
- Limit production access to authorized personnel only
- Use named accounts; shared credentials are discouraged and should be avoided
- Remove access promptly when job need ends

## Session Management

ARIA Evaluator applies the following session controls for user-facing authentication:

- **30-minute idle timeout**
- **Maximum 5 concurrent sessions** per account
- Secure session cookies and standard server-side session validation

## Password and Authentication Policy

- Passwords must have **12 or more characters**
- Passwords should include a mix of upper-case, lower-case, numeric, and symbol characters where supported
- Password reuse across services is prohibited
- Passwords should avoid guessable patterns and personal information
- Stored passwords are protected using **scrypt hashing**
- ARIA Evaluator supports **Google and GitHub OAuth** as SSO options
- **MFA** is on the product roadmap and will be prioritized as the team and enterprise requirements grow

## Access Reviews

Formal access reviews will be performed **quarterly once the team reaches a size where manual access tracking is no longer sufficient**. Until then, the Founder / Security Lead is responsible for maintaining a clear view of who has production and administrative access.

## Offboarding Checklist

When an employee or contractor leaves or no longer needs access, ARIA Evaluator should:

1. Disable or remove application and admin access
2. Revoke repository, cloud, VPN, and SaaS access as applicable
3. Rotate shared secrets or tokens the person could access
4. Recover company-owned devices or credentials
5. Confirm no customer data remains on personal devices or accounts

## Exceptions

Exceptions must be limited, documented, and approved by the Founder / Security Lead.

## Document History

| Version | Date | Description | Owner |
|---|---|---|---|
| 1.0 | June 2026 | Initial release | Founder / Security Lead |
