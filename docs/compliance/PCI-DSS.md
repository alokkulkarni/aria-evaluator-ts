# PCI DSS Readiness — ARIA Evaluator

> **Framework**: Payment Card Industry Data Security Standard (PCI DSS v4.0.1)  
> **Priority**: P3 — Future  
> **Target**: Q3 2027  
> **Scope**: Payment processing for subscription plans

---

## What is PCI DSS?

PCI DSS is a security standard for organisations that handle credit card data. Compliance level depends on transaction volume and how payment data is handled.

---

## Current Payment Architecture

### Recommended Approach: Stripe (SAQ A)

| Factor | Details |
|--------|---------|
| **Payment processor** | Stripe (recommended) |
| **Card data handling** | Stripe.js / Stripe Elements — card data never touches our servers |
| **PCI scope** | **SAQ A** (simplest) — all card processing delegated to Stripe |
| **Compliance effort** | Self-Assessment Questionnaire (~30 questions) |

### SAQ A Eligibility Checklist

| Requirement | Status | Implementation |
|-------------|--------|---------------|
| All payment pages served from Stripe | ✅ (with Stripe Elements) | Card input via Stripe.js iframe |
| No card data stored/processed/transmitted | ✅ | Only Stripe tokens and customer IDs |
| Payment page served over HTTPS | ✅ | TLS 1.2+, HSTS |
| No direct card data on our servers | ✅ | Stripe handles all card data |

---

## PCI DSS v4.0.1 Requirements (SAQ A Scope)

| Requirement | Description | Status | Implementation |
|------------|-------------|--------|----------------|
| Req 2 | Secure system configurations | ✅ | Security headers, Terraform IaC |
| Req 6 | Develop secure systems | ✅ | TypeScript strict, input validation |
| Req 8 | Identify users and authenticate | ✅ | scrypt auth, session controls |
| Req 9 | Restrict physical access | ✅ | AWS manages |
| Req 11 | Test security regularly | ✅ | Stripe SAQ A keeps card data off-platform; Stripe handles cardholder-data environment scanning while ARIA protects its public surface with WAF, CIS alarms, and HTTPS |
| Req 12 | Information security policy | ✅ | [`policies/information-security-policy.md`](./policies/information-security-policy.md) documents ARIA controls; Stripe's SAQ A model minimizes PCI scope to payment-page integration |

---

## What We Store vs What Stripe Stores

| Data | Storage Location | PCI Scope |
|------|-----------------|-----------|
| Card number (PAN) | Stripe only | Stripe's scope |
| CVV | Never stored | — |
| Expiry date | Stripe only | Stripe's scope |
| Stripe customer ID | Our database | Out of PCI scope |
| Stripe subscription ID | Our database | Out of PCI scope |
| Billing email | Our database | Out of PCI scope |
| Invoice history | Stripe + our reference | Out of PCI scope |

---

## Remediation for SAQ A

### Requirements
- [ ] Implement Stripe Elements for payment collection
- [ ] Complete SAQ A self-assessment (annual)
- [ ] Quarterly ASV (Approved Scanning Vendor) external vulnerability scan
- [ ] Document PCI compliance responsibility matrix
- [ ] Stripe agreement (includes their PCI DSS Level 1 compliance)

### Estimated Cost
| Item | Cost |
|------|------|
| Stripe setup | Free (transaction fees only) |
| Quarterly ASV scan | $500–2,000/yr |
| SAQ A completion | Internal effort (2–4 hours) |
| **Total** | **$500–2,000/yr** |

---

## Important Notes

- **Do NOT build custom payment forms** that directly handle card data — this escalates PCI scope to SAQ A-EP or SAQ D (dramatically more complex and expensive)
- **Stripe Checkout** or **Stripe Elements** keep us in SAQ A territory
- **3D Secure 2** should be enabled for Strong Customer Authentication (EU PSD2 requirement)
- PCI DSS v4.0.1 is mandatory from **April 1, 2025** — all new implementations must comply
