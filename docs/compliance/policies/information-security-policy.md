# Information Security Policy

- **Effective date:** June 2026
- **Version:** 1.0
- **Owner:** Founder / Security Lead
- **Next review date:** December 2026

## Purpose

ARIA Evaluator maintains this Information Security Policy to protect customer data, company information, and the reliability of the ariaeval.io platform. This policy is intentionally lightweight and practical for a small, early-stage SaaS company, while setting clear expectations for secure operations.

## Scope

This policy applies to all ARIA Evaluator platform components and supporting systems, including:

- The marketing website and authentication surfaces
- The control plane and evaluator application
- APIs, background jobs, logs, and reporting workflows
- AWS infrastructure, storage, networking, and monitoring services
- Source code repositories, CI/CD workflows, developer endpoints, and company-managed SaaS tools
- All employees, founders, and contractors with access to company systems or customer data

## Roles and Responsibilities

ARIA Evaluator is a small team. Until additional security staff are hired, the **Founder serves as Security Lead** and is responsible for:

- Maintaining baseline security policies and standards
- Approving access to production systems and sensitive data
- Coordinating incident response and customer communications
- Tracking material security risks and remediation priorities

All team members are responsible for following this policy, using company systems responsibly, and reporting suspected security issues promptly.

## Security Principles

ARIA Evaluator operates according to the following principles:

1. **Least privilege:** access is granted only to the systems and data needed for a person’s role.
2. **Secure by default:** production services, infrastructure, and application settings should use conservative defaults.
3. **Defense in depth:** application controls, AWS-native controls, logging, and monitoring work together.
4. **Practical security:** controls should be effective and sustainable for a startup team.

## Acceptable Use

Company systems may be used only for authorized business purposes. Users must:

- Use company accounts and approved tools to perform company work
- Keep credentials confidential and use unique, strong passwords
- Avoid storing customer data in unapproved locations
- Avoid bypassing logging, security controls, or access restrictions
- Report lost devices, suspicious messages, or suspected compromises immediately

Use of company systems for illegal, abusive, deceptive, or unsafe activity is prohibited.

## Access Control

ARIA Evaluator applies the following baseline access control rules:

- Access is approved based on job need and reviewed by the Founder / Security Lead
- Production access is limited to authorized personnel only
- Shared accounts are not permitted except where technically unavoidable and formally controlled
- Access should be removed promptly when no longer needed
- Administrative actions should be logged where supported by the platform

## Encryption Standards

ARIA Evaluator requires:

- **AES-256 or equivalent encryption at rest** for production data stores, backups, and supported AWS-managed storage services
- **TLS 1.2 or higher in transit** for external and internal service communications where supported
- Secure handling of credentials, secrets, and keys through approved secret management controls

Unencrypted transmission or storage of Confidential or Restricted data is not permitted unless explicitly approved by the Founder / Security Lead for a temporary operational reason.

## Incident Reporting

Any employee or contractor who becomes aware of a potential security incident must report it immediately to **security@ariaeval.io** or the Founder / Security Lead. Examples include:

- Suspected credential compromise
- Unauthorized access to systems or data
- Malware, phishing, or device loss involving company access
- Unintended exposure of customer or company data
- Material outages caused by security events

Reported incidents will be triaged under the Incident Response Plan.

## Enforcement and Exceptions

Violations of this policy may result in access removal, disciplinary action, contract termination, or other corrective measures. Exceptions must be documented and approved by the Founder / Security Lead.

## Document History

| Version | Date | Description | Owner |
|---|---|---|---|
| 1.0 | June 2026 | Initial release | Founder / Security Lead |
