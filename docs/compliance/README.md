# ARIA Evaluator — Compliance & Certification Guide

> **Last updated**: June 2026  
> **Stage**: Pre-revenue startup  
> **Maintainer**: security@ariaeval.io  
> **Classification**: Internal — Confidential

## Overview

ARIA Evaluator is a SaaS AI agent evaluation platform. This directory contains our compliance documentation, security policies, and certification readiness materials.

As a **pre-revenue startup**, we focus on what's legally required and what builds customer trust — not on premature enterprise certifications.

## What's Required Now vs Later

### 🔴 Required Now (legally mandatory or sales-critical)

| Framework | Why | Status |
|-----------|-----|--------|
| [GDPR](./GDPR.md) | Legal requirement if serving EU users | ✅ **Compliant** |
| [EU AI Act](./EU-AI-ACT.md) | Legal requirement for AI systems in EU (phased) | ✅ **Compliant** |
| Security best practices | Customer trust, basic due diligence | ✅ **Implemented** |

### 🟡 Pursue After Funding / First Enterprise Customers

| Framework | Why | When |
|-----------|-----|------|
| [SOC 2 Type I](./SOC2.md) | Enterprise customers will ask for it | After Series A or first enterprise deal |
| [ISO 27001](./ISO27001.md) | EU enterprise customers prefer it | After SOC 2 or when entering EU enterprise market |
| [CCPA / CPRA](./CCPA.md) | Only applies at $25M+ revenue or 100K+ consumers | When thresholds met |

### 🔵 Future (only if needed for specific market segments)

| Framework | Why | When |
|-----------|-----|------|
| [SOC 2 Type II](./SOC2.md) | Proves controls work over 6-12 months | 6-12 months after Type I |
| [ISO 27701](./ISO27701.md) | Privacy extension to ISO 27001 | After ISO 27001 |
| [CSA STAR](./CSA-STAR.md) | Cloud security assurance | After ISO 27001 |
| [HIPAA](./HIPAA.md) | Only if targeting healthcare customers | If/when entering healthcare |
| [PCI DSS](./PCI-DSS.md) | Using Stripe = SAQ A (minimal) | When accepting payments |
| [NIST AI RMF](./NIST-AI-RMF.md) | Voluntary US AI framework | When targeting US federal |

## Platform Architecture (Compliance Scope)

```
┌─────────────────────────────────────────────────────────────────┐
│                     ARIA Evaluator Platform                      │
│                                                                  │
│  ┌──────────────┐  ┌──────────────────┐  ┌───────────────────┐  │
│  │   Website     │  │  Control Plane   │  │  Evaluator App    │  │
│  │  (Next.js)    │  │  (Express API)   │  │  (React SPA)      │  │
│  │              │  │                  │  │                   │  │
│  │ • Marketing   │  │ • Auth/Sessions  │  │ • AI Eval Engine  │  │
│  │ • Auth UI     │  │ • User Mgmt     │  │ • Scenario Mgmt   │  │
│  │ • Legal Pages │  │ • Audit Logging  │  │ • Report Gen      │  │
│  │ • Cookie      │  │ • GDPR Endpoints │  │ • Transcript View │  │
│  │   Consent     │  │ • Rate Limiting  │  │ • Dashboard       │  │
│  └──────┬───────┘  └────────┬─────────┘  └────────┬──────────┘  │
│         │                   │                      │             │
│  ┌──────┴───────────────────┴──────────────────────┴──────────┐  │
│  │                    AWS Infrastructure                       │  │
│  │  CloudFront · WAF · ALB · ECS Fargate · S3 · EFS · KMS    │  │
│  │  CloudTrail · CloudWatch · Secrets Manager · Route 53      │  │
│  └────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Current Security Posture — Fully Implemented

| Control Area | Implementation | Evidence |
|-------------|---------------|----------|
| Encryption at rest | AES-256 (S3, EFS) | Terraform configs |
| Encryption in transit | TLS 1.2+, HSTS preload, client-side SHA-256 | `server.ts`, `next.config.ts`, CloudFront |
| Password security | scrypt + client hashing, 12-char complexity | `auth.ts` |
| Session management | 30-min idle timeout, max 5 concurrent, `__Host-` prefix | `auth.ts` |
| Rate limiting | 5 login attempts/15min + WAF 2000 req/5min | `auth.ts`, `waf/main.tf` |
| Audit logging | CloudTrail + app audit log with PII redaction | `audit-log.ts`, `cloudtrail/main.tf` |
| CIS Benchmark alarms | 14 CloudWatch alarms (CIS v1.4) | `cloudtrail/main.tf` |
| WAF | IP Reputation + Common Rules + Bad Inputs + rate limit | `waf/main.tf` |
| Security headers | CSP, HSTS, X-Frame-Options (3 layers) | `server.ts`, `next.config.ts`, CloudFront |
| GDPR data export | `GET /api/auth/account/export` (Art. 20) | `auth.ts` |
| GDPR account deletion | `DELETE /api/auth/account` (Art. 17) | `auth.ts` |
| GDPR restriction | `POST /api/auth/account/restrict` (Art. 18) | `auth.ts` |
| Privacy policy | Published at /privacy | Website |
| Terms of service | Published at /terms | Website |
| Cookie consent | Granular banner with 4 categories | `CookieConsentBanner.tsx` |
| Vulnerability disclosure | `/.well-known/security.txt` + /security/disclosure | Website |
| Log redaction | Automatic PII/secret stripping | `audit-log.ts`, `server.ts` |
| IaC governance | Terraform for all infrastructure | `infra/terraform/` |
| Environment separation | Local / Dev / Prod isolation | `environments/` |
| Session visibility | List/revoke active sessions | `auth.ts` |

## Document Index

### Certification Readiness
| Document | Description |
|----------|-------------|
| [SOC2.md](./SOC2.md) | SOC 2 readiness posture — what's done, what's needed for audit |
| [GDPR.md](./GDPR.md) | GDPR compliance — full article mapping |
| [ISO27001.md](./ISO27001.md) | ISO 27001 readiness — Annex A control mapping |
| [EU-AI-ACT.md](./EU-AI-ACT.md) | EU AI Act compliance for AI evaluation tools |
| [CCPA.md](./CCPA.md) | CCPA/CPRA readiness |
| [ISO27701.md](./ISO27701.md) | ISO 27701 PIMS extension |
| [CSA-STAR.md](./CSA-STAR.md) | Cloud Security Alliance STAR |
| [HIPAA.md](./HIPAA.md) | HIPAA readiness for healthcare |
| [PCI-DSS.md](./PCI-DSS.md) | PCI DSS for payments |
| [NIST-AI-RMF.md](./NIST-AI-RMF.md) | NIST AI Risk Management Framework |
| [EVIDENCE-CATALOGUE.md](./EVIDENCE-CATALOGUE.md) | Cross-framework evidence inventory |

### Operational Documents
| Document | Description |
|----------|-------------|
| [DPIA.md](./DPIA.md) | Data Protection Impact Assessment |
| [ROPA.md](./ROPA.md) | Records of Processing Activities |
| [DPA-TEMPLATE.md](./DPA-TEMPLATE.md) | Data Processing Agreement for customers |
| [BREACH-NOTIFICATION-TEMPLATES.md](./BREACH-NOTIFICATION-TEMPLATES.md) | Incident notification templates |
| [AI-SYSTEM-INVENTORY.md](./AI-SYSTEM-INVENTORY.md) | EU AI Act system inventory |
| [VENDOR-RISK-ASSESSMENTS.md](./VENDOR-RISK-ASSESSMENTS.md) | Vendor risk assessments |

### Security Policies
| Document | Description |
|----------|-------------|
| [policies/information-security-policy.md](./policies/information-security-policy.md) | Core InfoSec policy |
| [policies/incident-response-plan.md](./policies/incident-response-plan.md) | Incident response procedures |
| [policies/data-classification-policy.md](./policies/data-classification-policy.md) | Data classification scheme |
| [policies/acceptable-use-policy.md](./policies/acceptable-use-policy.md) | Acceptable use of systems |
| [policies/change-management-policy.md](./policies/change-management-policy.md) | Change management process |
| [policies/business-continuity-plan.md](./policies/business-continuity-plan.md) | BCP / DR plan |
| [policies/vendor-management-policy.md](./policies/vendor-management-policy.md) | Vendor risk management |
| [policies/access-control-policy.md](./policies/access-control-policy.md) | Access control and RBAC |
| [policies/sdlc-policy.md](./policies/sdlc-policy.md) | Secure development lifecycle |
| [policies/privacy-program.md](./policies/privacy-program.md) | Privacy program overview |
