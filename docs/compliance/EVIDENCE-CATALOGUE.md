# Evidence Catalogue — ARIA Evaluator Compliance

> **Purpose**: Cross-reference of compliance evidence artifacts mapped to all certification frameworks  
> **Last updated**: June 2026

---

## How to Use This Document

Each evidence item has a unique ID and maps to one or more framework controls. During audits, use this catalogue to quickly locate evidence artifacts.

---

## Evidence Inventory

### E-001: Encryption at Rest

| Field | Value |
|-------|-------|
| **Description** | All data encrypted at rest using AES-256 (S3 SSE, EFS encryption) |
| **Location** | `infra/terraform/modules/website-frontend/main.tf` (S3), ECS task def (EFS) |
| **Type** | Configuration |
| **Frameworks** | SOC2 CC6.7, ISO27001 A.8.24, GDPR Art. 32, HIPAA §164.312(a)(2)(iv) |

### E-002: Encryption in Transit

| Field | Value |
|-------|-------|
| **Description** | TLS 1.2+ enforced, HSTS preload, HTTPS-only S3 policies, client-side SHA-256 password hashing |
| **Location** | `src/api/server.ts` (L117-141), `website/next.config.ts`, CloudFront config |
| **Type** | Configuration + Code |
| **Frameworks** | SOC2 CC6.7, ISO27001 A.8.24, GDPR Art. 32, HIPAA §164.312(e)(1), PCI DSS Req 4 |

### E-003: Password Hashing

| Field | Value |
|-------|-------|
| **Description** | scrypt with 16-byte random salt, 64-byte output, constant-time comparison |
| **Location** | `src/api/auth.ts` (L117-135) |
| **Type** | Code |
| **Frameworks** | SOC2 CC6.1, ISO27001 A.5.17, A.8.5, NIST 800-63B |

### E-004: Session Management

| Field | Value |
|-------|-------|
| **Description** | 30-min idle timeout, max 5 concurrent sessions, HttpOnly/Secure/SameSite cookies, `__Host-` prefix |
| **Location** | `src/api/auth.ts` (L9-15, L103, L172-195) |
| **Type** | Code |
| **Frameworks** | SOC2 CC6.1, ISO27001 A.5.17, A.8.5 |

### E-005: Rate Limiting

| Field | Value |
|-------|-------|
| **Description** | 5 login attempts per 15 min per IP + per username, WAF rate limit 2000 req/5min |
| **Location** | `src/api/auth.ts` (L35-37), `modules/waf/main.tf` |
| **Type** | Code + Configuration |
| **Frameworks** | SOC2 CC6.6, ISO27001 A.8.23 |

### E-006: Audit Logging

| Field | Value |
|-------|-------|
| **Description** | Application audit log (user actions, IP, UA, timestamps) with automatic PII redaction |
| **Location** | `src/api/audit-log.ts` |
| **Type** | Code |
| **Frameworks** | SOC2 CC7.1, ISO27001 A.8.15, GDPR Art. 30, HIPAA §164.312(b) |

### E-007: CloudTrail

| Field | Value |
|-------|-------|
| **Description** | Multi-region CloudTrail with S3 storage, log validation, KMS encryption option, CIS alarms |
| **Location** | `infra/terraform/modules/cloudtrail/main.tf` |
| **Type** | Configuration |
| **Frameworks** | SOC2 CC7.1, CC4.1, ISO27001 A.8.15, A.8.16 |

### E-008: CIS Benchmark Alarms

| Field | Value |
|-------|-------|
| **Description** | 14 CloudWatch metric alarms aligned to CIS AWS Foundations Benchmark v1.4 |
| **Location** | `infra/terraform/modules/cloudtrail/main.tf` (L278-329) |
| **Type** | Configuration |
| **Frameworks** | SOC2 CC4.1, CC7.1, ISO27001 A.5.7, A.8.16 |

### E-009: WAF Configuration

| Field | Value |
|-------|-------|
| **Description** | AWS WAF with IP Reputation, Common Rules, Bad Inputs, rate limiting |
| **Location** | `infra/terraform/modules/waf/main.tf` |
| **Type** | Configuration |
| **Frameworks** | SOC2 CC6.6, ISO27001 A.8.23 |

### E-010: Security Headers

| Field | Value |
|-------|-------|
| **Description** | CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy |
| **Location** | `src/api/server.ts`, `website/next.config.ts`, CloudFront response headers policy |
| **Type** | Code + Configuration |
| **Frameworks** | SOC2 CC6.6, ISO27001 A.8.26, OWASP Top 10 |

### E-011: GDPR Data Export

| Field | Value |
|-------|-------|
| **Description** | `GET /api/auth/account/export` — user data portability (Art. 20) |
| **Location** | `src/api/auth.ts` (L902-960) |
| **Type** | Code |
| **Frameworks** | GDPR Art. 20, CCPA §1798.130, ISO27701 7.3.6 |

### E-012: GDPR Account Deletion

| Field | Value |
|-------|-------|
| **Description** | `DELETE /api/auth/account` — right to erasure with audit log anonymization (Art. 17) |
| **Location** | `src/api/auth.ts` (L964-1008) |
| **Type** | Code |
| **Frameworks** | GDPR Art. 17, CCPA §1798.105, ISO27701 7.4.5 |

### E-013: Privacy Policy

| Field | Value |
|-------|-------|
| **Description** | Comprehensive privacy policy with data categories, retention, rights, contacts |
| **Location** | `website/src/app/privacy/page.tsx` |
| **Type** | Published document |
| **Frameworks** | GDPR Art. 13-14, CCPA §1798.130, ISO27701 7.3.2-7.3.3 |

### E-014: Cookie Consent

| Field | Value |
|-------|-------|
| **Description** | Granular cookie consent with 4 categories, version tracking, DNT support |
| **Location** | `website/src/components/shared/CookieConsentBanner.tsx` |
| **Type** | Code |
| **Frameworks** | GDPR Art. 7, ePrivacy Directive, CCPA §1798.120 |

### E-015: Log Redaction

| Field | Value |
|-------|-------|
| **Description** | Automatic sensitive field redaction (passwords, tokens, secrets) in audit logs and console output |
| **Location** | `src/api/audit-log.ts` (L15-28), `src/api/server.ts` (L160-168) |
| **Type** | Code |
| **Frameworks** | GDPR Art. 5(1)(f), SOC2 C1.1, ISO27001 A.8.11 |

### E-016: Environment Separation

| Field | Value |
|-------|-------|
| **Description** | Local / Dev / Prod environments with separate Terraform configurations |
| **Location** | `infra/terraform/environments/` |
| **Type** | Configuration |
| **Frameworks** | SOC2 CC5.2, ISO27001 A.8.31 |

### E-017: Infrastructure as Code

| Field | Value |
|-------|-------|
| **Description** | All infrastructure managed via Terraform with version control |
| **Location** | `infra/terraform/` |
| **Type** | Configuration |
| **Frameworks** | SOC2 CC5.2, CC8.1, ISO27001 A.8.9, A.8.32 |

### E-018: Terms of Service

| Field | Value |
|-------|-------|
| **Description** | Terms including SLA, DPA, acceptable use, data retention |
| **Location** | `website/src/app/terms/page.tsx` |
| **Type** | Published document |
| **Frameworks** | SOC2 CC2.3, ISO27001 A.5.31 |

### E-019: Session Listing and Revocation

| Field | Value |
|-------|-------|
| **Description** | `GET /api/auth/sessions` (list) + `DELETE /api/auth/sessions/:id` (revoke) |
| **Location** | `src/api/auth.ts` |
| **Type** | Code |
| **Frameworks** | SOC2 CC6.1, ISO27001 A.5.18 |

### E-020: Password Complexity

| Field | Value |
|-------|-------|
| **Description** | 12+ chars, uppercase + lowercase + digit + special character |
| **Location** | `src/api/auth.ts` (PASSWORD_COMPLEXITY_PATTERN), `website/src/components/auth/SignUpWizard.tsx` |
| **Type** | Code |
| **Frameworks** | SOC2 CC6.1, ISO27001 A.5.17, NIST 800-63B |

---

## Framework Cross-Reference Summary

| Framework | Evidence IDs |
|-----------|-------------|
| **SOC 2** | E-001 through E-020 |
| **GDPR** | E-001, E-002, E-006, E-011, E-012, E-013, E-014, E-015 |
| **ISO 27001** | E-001 through E-020 |
| **ISO 27701** | E-011, E-012, E-013, E-014, E-015 |
| **CCPA** | E-011, E-012, E-013, E-014 |
| **HIPAA** | E-001, E-002, E-003, E-004, E-006, E-007 |
| **PCI DSS** | E-002, E-010 |
| **EU AI Act** | N/A (operational, not technical evidence) |
| **NIST AI RMF** | N/A (voluntary alignment) |
| **CSA STAR** | E-001 through E-020 |
