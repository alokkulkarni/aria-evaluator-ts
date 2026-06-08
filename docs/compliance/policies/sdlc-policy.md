# Secure Development Lifecycle (SDLC) Policy

- **Effective date:** June 2026
- **Version:** 1.0
- **Owner:** Founder / Security Lead
- **Next review date:** December 2026

## Purpose

This policy describes the baseline secure development practices used to build and operate ARIA Evaluator.

## Scope

This policy applies to application code, infrastructure as code, dependencies, build pipelines, and deployment workflows for the ARIA Evaluator platform.

## Development Standards

ARIA Evaluator uses pragmatic secure engineering controls, including:

- **TypeScript strict mode** to reduce runtime and type-safety issues
- **Zod schemas** for input validation at API and application boundaries
- Separation of **local, development, and production** environments
- Logging and monitoring that support operational and security review

## Code Changes and Review

- Code changes are made through Git branches and pull requests
- Pull requests receive human review before merge
- Review should consider correctness, security impact, and operational risk

## Dependency Management

- Dependencies are managed through the Node.js package ecosystem
- The team uses **npm audit** and routine dependency review to identify known issues
- High-risk dependency findings should be prioritized based on exploitability and exposure

## Infrastructure as Code

- Infrastructure changes are managed through **Terraform**
- Terraform should be validated before apply
- Production infrastructure changes should follow the change management process

## Security Testing

ARIA Evaluator performs security-oriented testing through code review, validation, monitoring, and an **adversarial scenario library with 149+ scenarios** used to evaluate model and workflow behavior under risky or edge-case conditions.

## Release Expectations

Before releasing material changes, the team should confirm:

- Required review is complete
- Validation has been run at a level appropriate to the risk
- Deployment and rollback paths are understood
- Relevant configuration and environment variables are in place

## Continuous Improvement

Security practices will evolve as the company grows, customer requirements increase, and the platform expands.

## Document History

| Version | Date | Description | Owner |
|---|---|---|---|
| 1.0 | June 2026 | Initial release | Founder / Security Lead |
