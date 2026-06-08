# Business Continuity Plan

- **Effective date:** June 2026
- **Version:** 1.0
- **Owner:** Founder / Security Lead
- **Next review date:** December 2026

## Purpose

This Business Continuity Plan describes how ARIA Evaluator maintains and restores essential operations during service disruption. It is intentionally simple and aligned to the company’s current size and AWS-based architecture.

## Scope

This plan covers customer-facing services, supporting AWS infrastructure, key data stores, and communication needed to restore platform operations.

## Critical Systems Inventory

| System | Purpose | Priority |
|---|---|---|
| Website | Marketing site, sign-in entry points, legal pages | High |
| Control plane | Account management, orchestration, APIs, audit functions | Critical |
| Evaluator | Evaluation workflows, scenario execution, reports | Critical |
| Supporting AWS services | CloudFront, ALB, ECS, EFS, S3, Route 53, CloudWatch, CloudTrail | Critical |

## Continuity Strategy

ARIA Evaluator relies on the following baseline resilience measures:

- AWS **multi-AZ** architecture for core production services where supported
- ECS service health checks and **auto-restart** behavior for failed tasks
- Terraform-managed infrastructure to support consistent rebuild and disaster recovery
- Backup and durable storage using **EFS and S3**
- Deployment rollback protections, including ECS circuit breaker behavior

## Recovery Targets

- **RTO (Recovery Time Objective):** 4 hours
- **RPO (Recovery Point Objective):** 1 hour

These targets reflect current startup-stage operating assumptions and will be revised as the company and customer commitments mature.

## Backup and Recovery Approach

- Production data stored on EFS and S3 should use AWS backup, snapshot, versioning, or equivalent managed durability features where configured
- Infrastructure should be reproducible from Terraform code and controlled configuration
- Secrets and environment configuration should be recoverable from approved secret-management systems and deployment records

## Response Priorities During Disruption

1. Protect people and preserve evidence if the disruption involves a security incident
2. Restore the control plane and evaluator services needed for customer operations
3. Restore website access and lower-priority services
4. Confirm logging, monitoring, and alerting are functioning after recovery

## Communication Plan

During a material outage or disaster event:

- The Founder / Security Lead coordinates status updates
- Internal status should cover impact, actions underway, estimated restoration timing, and next update time
- Customer communications should be issued when disruption is material, prolonged, or contractually required
- Privacy-related impacts should also be routed through **privacy@ariaeval.io** when personal data is involved

## Plan Maintenance

This plan should be reviewed after any major incident, architecture change, or material shift in customer commitments.

## Document History

| Version | Date | Description | Owner |
|---|---|---|---|
| 1.0 | June 2026 | Initial release | Founder / Security Lead |
