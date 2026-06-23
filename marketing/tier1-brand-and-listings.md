# Tier 1 — Brand assets & directory listings

Foundational, legitimate links + the entity signals every SEO/GEO/SXO analysis flagged as ariaeval.io's biggest gap. **None of this is automated — each is a real profile a human creates once.** Work top to bottom.

> Why this first: brand profiles and product listings are real, followed/nofollow links *and* the `sameAs` entity signals that let Google and AI engines resolve "ARIA Evaluator" as a known entity. They correlate far more with visibility than anything on-page.

---

## 1. Brand fact sheet (single source of truth — copy into every listing)

| Field | Value |
|-------|-------|
| Product name | ARIA Evaluator |
| Legal entity | ARIA Evaluator, Inc. |
| Website | https://ariaeval.io |
| Contact | https://ariaeval.io/contact · security@ariaeval.io |
| Founded | 2026 *(verify and correct)* |
| Categories | AI agent evaluation · LLM evaluation · AI safety / observability · AI red teaming |
| Logo | `website/public/icon.svg` (export a 512×512 PNG for directories that require raster) |
| Pricing | Free · $49/mo · $299/mo · $799/mo · Enterprise (custom) |

**Key facts (verifiable, reuse verbatim):**
- Scores every conversation across **15 dimensions** (response quality, task completion, safety & security, customer experience, escalation & vulnerability).
- **Panel of independent AI judges** with **human review** on disagreement — not a single-judge pipeline.
- Built-in **adversarial testing**: prompt injection, jailbreak, social engineering.
- Adapters for **Amazon Connect, Lex, Azure Bot Service, Microsoft Copilot, OpenAPI/REST, WebSocket** — no SDK changes.
- Compliance coverage: **FCA Consumer Duty, OWASP LLM Top 10, NIST AI RMF, EU AI Act, MITRE ATLAS**.
- **8 AWS regions**, dedicated-tenant isolation, encryption at rest/in transit.

**Boilerplate (pick by length):**
- **25 words:** ARIA Evaluator tests conversational AI agents with a panel of independent AI judges across 15 quality and safety dimensions, plus adversarial red-teaming and compliance evidence.
- **50 words:** ARIA Evaluator is an enterprise platform for evaluating conversational AI agents. It scores real transcripts across 15 quality and safety dimensions using a panel of independent AI judges with human review, runs adversarial red-team attacks (prompt injection, jailbreak, social engineering), and produces compliance evidence for FCA, OWASP, NIST, and the EU AI Act.
- **100 words:** ARIA Evaluator helps security, product, and platform teams launch conversational AI agents with verifiable quality and safety scores. Instead of trusting a single model to judge quality, ARIA submits every conversation to a panel of independent AI judges and routes disagreements to human reviewers. It scores across 15 dimensions — correctness, guardrail compliance, prompt-injection resistance, vulnerability detection, escalation, and more — and runs adversarial red-team suites against the deployed agent, not just the model. Results map to OWASP LLM Top 10, NIST AI RMF, FCA Consumer Duty, and the EU AI Act, with an audit trail for every score. Connects to Amazon Connect, Lex, Azure, Copilot, and any custom endpoint.

---

## 2. Owned profiles → then wire `sameAs`

Create each, then paste the real URLs into `SOCIAL_PROFILES` in `website/src/lib/schema.ts` (the `sameAs` only emits when non-empty, so the Organization entity activates the moment you fill it):

- [ ] **LinkedIn** company page → `https://www.linkedin.com/company/<slug>`
- [ ] **X / Twitter** → `https://x.com/<handle>`
- [ ] **GitHub** org → `https://github.com/<org>` (publish an open eval-scenario pack or an adapter — repos earn links)
- [ ] **Crunchbase** company profile
- [ ] **Wellfound** (AngelList) company profile

When done, `SOCIAL_PROFILES` becomes e.g.:
```ts
const SOCIAL_PROFILES: string[] = [
  'https://www.linkedin.com/company/ariaeval',
  'https://x.com/ariaeval',
  'https://github.com/ariaeval',
  'https://www.crunchbase.com/organization/aria-evaluator',
]
```

---

## 3. SaaS & AI directory listings (paste-ready)

Real product listings = real referral traffic + links + brand mentions. Submit to each:

**Product Hunt** (plan a launch day):
- Tagline (≤60 chars): `Evaluate AI agents with a panel of judges, not one`
- Description: use the 50-word boilerplate.
- First comment (maker): why you built it — single-judge pipelines miss failures; ARIA uses a panel + human review + adversarial testing. Link the free tier.
- Topics: Artificial Intelligence, Developer Tools, SaaS, Security.

**G2 / Capterra / GetApp** (claim a vendor profile):
- Company description: 100-word boilerplate.
- Categories: AI Agents, LLMOps, AI Observability, Application Security.
- Features list: pull from the key facts above.

**Other directories (short blurb = 25-word boilerplate):**
- [ ] SaaSHub
- [ ] AlternativeTo (list as an alternative to generic eval tooling)
- [ ] There's An AI For That
- [ ] Futurepedia
- [ ] Slashdot / SourceForge
- [ ] AI Agents Directory / aiagentsdirectory.com

---

## 4. Partner directories (high-relevance links)

You build on AWS and integrate Microsoft Copilot — partner listings are strong, topically-relevant backlinks:
- [ ] **AWS Partner Network** (uses Bedrock / Connect / Lex) → partner finder listing.
- [ ] **Microsoft** (Copilot Studio ecosystem) → relevant marketplace/partner listing.

---

## Guardrails
- **Never** buy links, use PBNs, or auto-submit to hundreds of low-quality directories — that risks a Google manual action. Quality and relevance over volume.
- Keep NAP (name/URL/description) **identical** everywhere — consistency is itself an entity signal.
