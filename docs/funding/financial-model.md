# ARIA Evaluator — 3-Year Financial Projection

## Summary

This model frames ARIA Evaluator as a seed-stage SaaS company raising **$1.5M on a SAFE** with an **$8M post-money cap** to launch commercially in **Q3 2026**, convert first revenue in **Q4 2026**, and scale toward breakeven by **Q1 2029**.

> These quarter rows should be read as operating snapshots / run-rate checkpoints for planning, not GAAP quarterly financial statements.

## Fundraising Assumptions

- **Round:** Seed SAFE
- **Amount raised:** **$1.5M**
- **SAFE terms:** post-money SAFE, **$8M cap**, no discount, MFN
- **Product launch:** **Q3 2026**
- **First revenue:** **Q4 2026**
- **Headcount plan:** 2 founders today, ~8 by end of Year 1, ~18 by end of Year 2, ~30 by end of Year 3
- **Blended starting salary:** **$120K annualized** across engineering, GTM, and operations hires
- **Churn assumptions:** **5% monthly** on lower-end self-serve conversion cohorts; **3% monthly** on enterprise customers
- **Infrastructure profile:** AWS-native deployment on **ECS Fargate, CloudFront, S3, and WAF**, with costs scaling with evaluation usage and enterprise data volume

## Operating Projection

### Year 1 (H2 2026 – H1 2027)

| Quarter | Free Users | Paid Users | MRR | AWS Costs | Payroll | Burn | Cumulative |
|---------|-----------:|-----------:|----:|----------:|--------:|-----:|-----------:|
| Q3 2026 | 50 | 0 | $0 | $2K | $40K | $45K | -$45K |
| Q4 2026 | 200 | 8 | $2.4K | $3K | $60K | $63K | -$108K |
| Q1 2027 | 500 | 25 | $8K | $5K | $80K | $82K | -$190K |
| Q2 2027 | 1,000 | 60 | $22K | $8K | $100K | $92K | -$282K |

### Year 2 (H2 2027 – H1 2028)

| Quarter | Free Users | Paid Users | MRR | AWS Costs | Payroll | Burn | Cumulative |
|---------|-----------:|-----------:|----:|----------:|--------:|-----:|-----------:|
| Q3 2027 | 2,000 | 120 | $48K | $12K | $150K | $120K | -$402K |
| Q4 2027 | 3,500 | 200 | $85K | $18K | $180K | $118K | -$520K |
| Q1 2028 | 5,000 | 320 | $140K | $25K | $200K | $90K | -$610K |
| Q2 2028 | 7,000 | 480 | $210K | $32K | $220K | $48K | -$658K |

### Year 3 (H2 2028 – H1 2029)

| Quarter | Free Users | Paid Users | MRR | AWS Costs | Payroll | Burn | Cumulative |
|---------|-----------:|-----------:|----:|----------:|--------:|-----:|-----------:|
| Q3 2028 | 9,000 | 620 | $280K | $38K | $260K | $25K | -$683K |
| Q4 2028 | 11,000 | 780 | $340K | $45K | $290K | $5K | -$688K |
| Q1 2029 | 13,000 | 930 | $410K | $55K | $320K | -$20K | -$668K |
| Q2 2029 | 15,000 | 1,100 | $480K | $65K | $350K | -$50K | -$618K |

## Path to Profitability

- **Breakeven target:** **Q1 2029**
- **Primary driver:** expansion of higher-ARPU enterprise plans while maintaining a large free-user funnel
- **MRR target:** grow beyond **$400K MRR** by Q1 2029 and **$480K MRR** by Q2 2029
- **Cash efficiency:** even at planned hiring levels, the business remains well inside a $1.5M seed financing envelope in this model
- **Implied ARR at Q2 2029:** **$5.76M ARR**

## Revenue Drivers

1. **Product-led acquisition through the Free tier**  
   Free tier adoption creates low-friction pipeline for startups, consultants, and internal AI teams evaluating agents before purchase.

2. **Expansion from self-serve to enterprise**  
   Customers begin with smaller plans and expand into **Enterprise Starter**, **Enterprise Pro**, and **Enterprise Unlimited** as evaluation volume, governance, and security requirements increase.

3. **High-value enterprise ARPU**  
   The pricing ladder supports blended ARPU expansion over time:
   - Free: **$0**
   - Individual: **$49/mo**
   - Enterprise Starter: **$299/mo**
   - Enterprise Pro: **$799/mo**
   - Enterprise Unlimited: **custom pricing**

4. **Usage-linked infrastructure and evaluation economics**  
   AWS costs scale with customers, but gross margin improves as the mix shifts to larger contracts and retained enterprise accounts.

5. **Retention from workflow embed**  
   ARIA becomes part of release governance, red-team validation, and compliance review cycles, improving stickiness relative to lightweight AI testing tools.

## Key Assumptions

### Product and Market

- ARIA launches with a fully built platform: React dashboard, evaluation engine, **149 adversarial scenarios across 14 categories**, and production-ready AWS deployment
- Paid monetization starts in **Q4 2026**, initially with controlled rollout
- Large enterprise accounts are expected to adopt later in the model, increasing average revenue per paid account

### Customer Growth

- Free-user growth is driven by content, product-led onboarding, and security/compliance differentiation
- Paid conversion starts modestly, then accelerates as social proof and enterprise readiness improve
- Monthly churn is assumed at:
  - **5%** for lower-end free-to-paid / SMB cohorts
  - **3%** for enterprise cohorts

### Cost Structure

- Payroll is the largest cost center throughout the plan
- AWS cost growth tracks evaluation volume, transcript storage, report generation, and multi-region availability across **8 AWS regions**
- Burn includes payroll, infrastructure, and a modest operating overhead for software, legal, and admin spend

### Hiring Plan

- **Year 1:** core product, infra, and first GTM hires to reach ~8 people
- **Year 2:** add enterprise sales, customer success, platform engineering, and compliance support to reach ~18 people
- **Year 3:** scale into a broader commercial and technical org, reaching ~30 people while approaching profitability

## Sensitivity Analysis — If Growth Is 50% Slower

If customer growth and expansion happen at **half the base-case pace**:

- Q2 2028 MRR would be closer to **$105K** instead of **$210K**
- Q1 2029 MRR would be closer to **$205K** instead of **$410K**
- Breakeven would likely slip from **Q1 2029** to **late 2029 or early 2030**
- ARIA would likely need to either:
  - slow hiring by 4–6 quarters,
  - raise an extension round, or
  - push more aggressively into enterprise contracts earlier

### Suggested response plan in the downside case

- Delay non-essential hiring after Year 1
- Shift more spend into enterprise pipeline generation and design partners
- Prioritize higher-ARPU plans and annual contracts
- Tighten infrastructure margins through model routing and usage controls

## Use of Funds — $1.5M Seed

| Category | % | Amount | Planned Use |
|---------|--:|-------:|-------------|
| Engineering | 50% | $750K | 4 engineers focused on product, infra, integrations, and evaluation quality |
| Sales / Marketing | 25% | $375K | 2 hires plus launch marketing, content, events, and pipeline generation |
| Infrastructure | 15% | $225K | AWS, observability, security tooling, developer tooling, and staging / multi-region operations |
| Legal / Ops | 10% | $150K | incorporation, IP assignments, counsel, accounting, compliance, and insurance |

## Milestones This Seed Round Funds

- Commercial launch in **Q3 2026**
- First paid revenue in **Q4 2026**
- Expansion from launch team to a repeatable GTM and product org
- Enterprise-ready security and compliance posture
- Growth to **$400K+ MRR** and breakeven trajectory by **Q1 2029**

## Investor Framing

ARIA Evaluator is positioned as an infrastructure-layer product for companies deploying AI agents in regulated, high-risk, or customer-facing workflows. The financing case is strongest when presented as:

- a **category-creating safety and validation layer** for AI agents,
- a **high-gross-margin SaaS product** with enterprise upsell potential, and
- a business that is already technically de-risked before institutional fundraising.
