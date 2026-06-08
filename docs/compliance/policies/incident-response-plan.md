# Incident Response Plan

- **Effective date:** June 2026
- **Version:** 1.0
- **Owner:** Founder / Security Lead
- **Next review date:** December 2026

## Purpose

This plan defines how ARIA Evaluator detects, triages, contains, investigates, and communicates security incidents. It is designed for a small startup team and favors clear decision-making over heavyweight process.

## Scope

This plan applies to incidents affecting the website, control plane, evaluator platform, AWS infrastructure, source code repositories, company endpoints, and customer data processed by ariaeval.io.

## Incident Contacts

- **Security contact:** security@ariaeval.io
- **Privacy contact:** privacy@ariaeval.io
- **Primary incident coordinator:** Founder / Security Lead
- **Additional contacts:** _To be added as the team grows_

## Severity Levels

| Severity | Description | Examples | Target Initial Response |
|---|---|---|---|
| **P1 - Critical** | Active compromise, major customer impact, or material loss of Confidential/Restricted data | Confirmed data breach, production account takeover, widespread outage from security event | Immediate |
| **P2 - High** | Significant security event with limited containment or likely customer impact | Repeated WAF blocks indicating attack success risk, exposed credential, suspicious admin activity | Within 1 hour |
| **P3 - Medium** | Security weakness or isolated event with manageable risk | Malware on non-production device, failed control, suspicious log event requiring investigation | Same business day |
| **P4 - Low** | Low-risk event, inquiry, or policy issue | Phishing attempt blocked, minor misconfiguration with no exposure | As scheduled |

## Detection Sources

ARIA Evaluator monitors and investigates signals from:

- AWS CloudTrail CIS alarms and related CloudWatch alerts
- AWS WAF alerts and rate-limit events
- Application audit logs and authentication logs
- GitHub or CI/CD security notifications
- User, contractor, or vendor reports

## Response Process

### 1. Detect and Triage

- Record the time, source, and summary of the event
- Assign an incident owner, normally the Founder / Security Lead
- Classify severity as P1-P4
- Preserve relevant logs, alerts, and system context

### 2. Contain

Depending on the incident, ARIA Evaluator may:

- Disable accounts or rotate credentials
- Block traffic using WAF, IAM, or network controls
- Pause deployments or risky background jobs
- Isolate affected services or revoke access tokens

### 3. Investigate and Eradicate

- Identify what happened, when it started, and what systems or data were affected
- Remove malicious access, vulnerable artifacts, or bad configuration
- Patch, reconfigure, or redeploy affected services
- Review whether personal data or customer data was involved

### 4. Recover

- Restore normal service in a controlled way
- Confirm monitoring is healthy and the issue is no longer active
- Validate that customer-facing systems are functioning as expected
- Continue heightened monitoring until risk returns to normal

## Communication Requirements

### Internal Communication

- P1 and P2 incidents should be communicated to leadership immediately
- Incident status, decisions, and timelines should be documented in a shared incident record

### Customer and Privacy Communication

If an incident involves personal data, ARIA Evaluator will assess notification obligations under applicable law and contract.

- For GDPR-relevant personal data breaches, ARIA Evaluator will notify the relevant supervisory authority **without undue delay and, where required, within 72 hours of becoming aware of the breach**
- Where required, ARIA Evaluator will notify affected users or customers without undue delay, including a plain-language summary of the impact and recommended protective steps
- Privacy-related communication should be coordinated through **privacy@ariaeval.io**

## Evidence to Capture

Each incident record should include, at minimum:

- Incident ID or reference
- Severity and affected systems
- Detection source and timeline
- Data types potentially affected
- Actions taken for containment, eradication, and recovery
- Notification decisions and timing
- Owner and follow-up actions

## Post-Incident Review Template

Use the following template after any P1 or P2 incident, and for other incidents when useful:

### Post-Incident Review

- **Incident title:**
- **Incident ID:**
- **Date detected:**
- **Severity:**
- **Prepared by:**
- **Summary:**
- **Root cause:**
- **Systems affected:**
- **Data affected:**
- **Customer impact:**
- **Timeline of key events:**
- **Containment actions:**
- **Recovery actions:**
- **Notification actions:**
- **Corrective actions and owners:**
- **Target completion dates:**
- **Lessons learned:**

## Document History

| Version | Date | Description | Owner |
|---|---|---|---|
| 1.0 | June 2026 | Initial release | Founder / Security Lead |
