# ARIA Evaluator — Investor Demo Script

## Demo goal

Show investors that ARIA Evaluator is a fully built, commercially credible SaaS platform for evaluating AI agents with adversarial testing, enterprise reporting, and strong security / compliance foundations.

**Total runtime:** ~10 minutes

---

## 1. Setup (30s)

### Talk track

"ARIA Evaluator helps companies ship safe AI agents by stress-testing them before they reach production. We let teams run adversarial scenarios, score agent behavior, and generate proof that an agent is ready for launch."

### What to show / click

- Start on the ARIA Evaluator home screen or logged-in dashboard
- Keep one evaluation run already prepared in another tab as backup

### Key point to land

- This is not a slideware product; it is a functioning SaaS evaluation platform

### Likely investor question

**Q:** Why now?  
**A:** AI agents are moving into production workflows faster than teams can validate them. ARIA fills the gap between agent development and production release by giving teams a repeatable safety and quality gate.

---

## 2. Dashboard Overview (2 min)

### Talk track

"This is the command center. Teams can see evaluation volume, recent scores, and whether an agent is trending toward approval or needs more work before release."

### What to show / click

- Open the redesigned dashboard
- Point out the **3-column layout**
- Highlight:
  - evaluation count
  - average scores
  - quality badges: **Needs Review / Approved / Certified**
- Open or hover over the **Plan Usage** card

### Key points to land

- The UI feels like a modern SaaS control plane, not an internal prototype
- The **Plan Usage** card signals monetization and SaaS unit economics
- Buyers can immediately understand value through usage, score visibility, and auditability

### Likely investor questions

**Q:** Who is the buyer?  
**A:** Initially AI product teams, platform teams, and compliance-minded engineering leaders. Over time, this expands into security, risk, and AI governance stakeholders.

**Q:** Is this a dashboard business or an infrastructure business?  
**A:** The dashboard is the surface area. The real value is the evaluation engine, scenario library, scoring system, and workflow embed into release processes.

---

## 3. Create an Evaluation Run (3 min)

### Talk track

"Here we create an evaluation run. The core workflow is simple: choose adversarial scenarios, target an agent, run the test, and score outputs automatically."

### What to show / click

1. Click **New Evaluation** or equivalent run creation action
2. Open the scenario library
3. Use the **category picker**
4. Say:  
   "We have **149 pre-built scenarios across 14 categories**, including prompt injection, PII leakage, bias detection, jailbreak-style attacks, and other adversarial patterns."
5. Select a few representative scenarios
6. Start the evaluation run
7. Show **real-time transcript streaming** as the run begins
8. Point out the scoring dimensions on the live run screen:
   - safety
   - accuracy
   - helpfulness

### Key points to land

- ARIA is not just storing prompts; it is executing structured adversarial evaluations
- The scenario library reduces setup time for customers
- Live transcript streaming makes the system feel operational and trustworthy in real time

### Likely investor questions

**Q:** How defensible is the scenario library?  
**A:** The combination of structured evaluation workflows, domain-specific adversarial scenarios, scoring logic, and enterprise reporting is the moat. The library is also a compounding asset as customers contribute requirements and patterns.

**Q:** How do you avoid AI-judging-AI concerns?  
**A:** We make scoring explicit, structured, and reviewable. The system is designed for consistency and triage, not blind automation. Human review remains possible, especially for edge cases and policy-sensitive decisions.

---

## 4. Reports & Analytics (2 min)

### Talk track

"Once the run completes, ARIA produces a report teams can use for product decisions, release gates, and customer or internal reviews."

### What to show / click

- Open a completed evaluation report
- Show:
  - overall score summary
  - pass / fail breakdown
  - category-level filtering
- Filter by a scenario category to show how teams isolate a class of risk
- Scroll to the report detail view where evidence and scores are visible

### Key points to land

- ARIA outputs evidence, not just a green checkmark
- Teams can move from raw transcript to decision-ready reporting fast
- This supports both product iteration and enterprise governance

### Likely investor questions

**Q:** Is reporting really a buying driver?  
**A:** Yes. Enterprises want evidence they can share across engineering, security, and compliance teams. Reporting turns evaluation into something operationally usable.

**Q:** Can this become part of CI / release gating?  
**A:** Yes. That is one of the strongest long-term wedges: ARIA becomes a release control point for AI agents.

---

## 5. Security & Compliance (1 min)

### Talk track

"We are GDPR compliant from day one — data export, deletion, and restriction are built in. We also already have **28 compliance docs** and **10 security policies**, which positions us well for enterprise diligence and eventual SOC 2 readiness."

### What to show / click

- Briefly show security / settings / compliance materials if available
- Mention infrastructure and controls:
  - encryption
  - security headers
  - multi-region AWS deployment
  - controlled auth flows

### Key points to land

- Security is built into the product and company posture early
- ARIA is credible for enterprise buyers, not just developers experimenting with prompts
- This reduces friction in sales cycles

### Likely investor questions

**Q:** Are you SOC 2 certified today?  
**A:** Not yet, but we are prepared for that process. We already have the policy and documentation foundation, which lowers the time and cost to complete it when needed.

**Q:** Why does compliance matter this early?  
**A:** Because AI evaluation buyers often sit close to risk, security, or regulated workflows. Enterprise readiness is a go-to-market advantage, not just a back-office concern.

---

## 6. Pricing & Go-to-Market (1 min)

### Talk track

"The pricing model is designed for product-led growth. Teams can start for free, prove value, and then expand into paid plans as evaluation volume and governance needs increase."

### What to show / click

- Open the pricing page
- Highlight the **5 tiers**:
  - Free — **$0**
  - Individual — **$49/mo**
  - Enterprise Starter — **$299/mo**
  - Enterprise Pro — **$799/mo**
  - Enterprise Unlimited — **custom**
- Say:  
  "Land with Free, expand to paid — classic PLG motion. We are launching with the Free tier first and turning on paid tiers in **Q4 2026**."

### Key points to land

- Clear wedge into the market with low-friction adoption
- Upsell path is built into the product already
- Enterprise value expands naturally with usage, governance, and team adoption

### Likely investor questions

**Q:** Why not charge from day one?  
**A:** Free lowers friction for early adoption and design partners. It builds funnel, usage data, and proof points before paid conversion ramps.

**Q:** What expands ACV over time?  
**A:** More scenarios, more runs, more users, more compliance demands, and deeper workflow integration.

---

## 7. Close (30s)

### Talk track

"We are raising **$1.5M seed** to build out the team and launch enterprise features. We are looking for **[24 months] runway** to hit **[900+ paid customers / accounts]** on the base-case path to breakeven around **Q1 2029**."

### What to show / click

- Return to the dashboard or pricing page
- End on the strongest visual: scorecard, report, or usage dashboard

### Key point to land

- The raise is for scaling a built platform, not inventing one from scratch

### Likely investor question

**Q:** What does this round unlock?  
**A:** Team expansion, enterprise packaging, GTM execution, and the operational maturity required to convert ARIA from a built product into a category-defining company.

---

## Suggested backup talking points if the demo runs fast

- ARIA runs on AWS with **ECS Fargate, CloudFront, S3, and WAF**
- The platform is already deployed across **8 AWS regions**
- The product is built with a **React dashboard**, evaluation engine, adversarial scenario library, and auth-backed website at **ariaeval.io**
- The strongest wedge is helping companies test AI agents before production, especially in regulated or high-risk workflows

## Demo tips

- Keep one completed run open as a fallback in case of latency
- Pre-select a small scenario set so the live run starts quickly
- Stay focused on business outcomes: faster release confidence, better safety validation, and clear enterprise readiness
- If investors dive deep on technical implementation, answer briefly and return to why this matters commercially
