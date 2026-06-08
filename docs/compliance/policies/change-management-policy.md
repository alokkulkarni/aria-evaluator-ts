# Change Management Policy

- **Effective date:** June 2026
- **Version:** 1.0
- **Owner:** Founder / Security Lead
- **Next review date:** December 2026

## Purpose

This policy describes how ARIA Evaluator makes changes to application code, infrastructure, and production systems in a controlled but startup-appropriate manner.

## Scope

This policy applies to production-impacting changes affecting application code, infrastructure, configuration, secrets, CI/CD workflows, and operational runbooks.

## Core Requirements

### Infrastructure Changes

- All persistent infrastructure changes must be managed through **Terraform** as infrastructure as code (IaC)
- Manual production changes should be avoided except during approved emergency response
- Terraform changes should be reviewed before apply

### Code Changes

- All code changes must flow through the **Git pull request workflow**
- Pull requests should describe the change, risk, and any validation performed
- Changes should not be merged directly to protected production branches except under the emergency procedure below

### Production Deployments

- Production deployments require review before release
- The person approving the review should confirm the change is understood and validation is reasonable for the risk level
- Higher-risk changes should be deployed during periods when monitoring and rollback can be actively observed

## Emergency Changes

Emergency changes are allowed when required to contain an incident, restore service, or mitigate a material security risk.

Minimum expectations for emergency changes:

1. Document the reason for the change
2. Limit the scope to what is needed to restore safety or service
3. Obtain review as soon as practical, even if after deployment
4. Backfill the related pull request, Terraform update, or incident record

## Rollback

ARIA Evaluator uses AWS ECS deployment protections, including the **deployment circuit breaker with rollback**, to reduce failed release risk. When a change introduces customer impact or instability, the team should rollback quickly rather than troubleshooting live in production for an extended period.

## Recordkeeping

Evidence of change management may include pull requests, Terraform plans/applies, deployment logs, incident records, and release notes.

## Document History

| Version | Date | Description | Owner |
|---|---|---|---|
| 1.0 | June 2026 | Initial release | Founder / Security Lead |
