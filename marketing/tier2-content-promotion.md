# Tier 2 — Content promotion & link earning

Earn links by getting the content you already have in front of the people who cite and share it. **Value-first, not spam** — communities punish self-promotion, so lead with substance and disclose that you're the maker.

## Linkable assets (already shipped)
- `/guides/what-is-ai-agent-evaluation` — definitional pillar
- `/guides/choosing-an-ai-agent-evaluation-platform` — buyer's guide
- `/guides/conversational-ai-red-teaming` — niche pillar
- `/solutions/ai-red-teaming` — solution page
- The free tier (10 scenarios / 5 runs) — the strongest hook for dev communities

---

## 1. Show HN (Hacker News)
Post the **free, usable** thing — HN rewards "show me," not marketing.

- **Title:** `Show HN: Evaluate AI agents with a panel of judges instead of one`
- **URL:** https://ariaeval.io (or a direct free-signup link)
- **Body (first comment):**
  > We kept seeing single-LLM "judge" pipelines pass agents that then failed in production — one model's blind spot becomes your blind spot. ARIA runs every conversation past a panel of independent judges, sends disagreements to a human, and red-teams the agent (prompt injection, jailbreak, social engineering) in the same run. It scores 15 dimensions and connects to Connect/Lex/Azure/Copilot or any HTTP endpoint. Free tier is 10 scenarios / 5 runs, no card. Happy to answer anything about the multi-judge approach, calibration against humans, or where it breaks.
- **Timing:** weekday ~8–10am ET. Be present in comments for the first 2 hours.
- **Rules:** one Show HN per project; don't ask for upvotes.

## 2. Reddit (answer, don't advertise)
Find threads asking the question your pages answer; reply with a genuinely useful answer and link the guide as a *reference*, not a pitch. Disclose affiliation.

- **Subreddits:** r/LLMDevs, r/MachineLearning *(strict — only with real substance)*, r/artificial, r/AI_Agents, r/MLOps, r/devops, r/aigamedev (contact-centre/CX angles).
- **Template reply:**
  > Multi-judge evaluation helps here — a single judge model bakes its own blind spots into every score, so it tends to agree with errors that look like its own. A panel + human review on disagreement catches more. I wrote up the approach and the 15 dimensions here [link], and a red-teaming-specific one here [link]. (Disclosure: I work on ARIA, an eval platform — but the framework applies to any tool.)
- **Cadence:** 2–3 genuinely helpful replies/week. Never drop a link with no context.

## 3. LinkedIn (founder/company posts)
- **Post A (POV):** "Why your AI agent passed testing and still failed in production" → the single-judge blind-spot argument → link the pillar.
- **Post B (how-to):** "A red-team checklist for conversational agents before you ship" → 6 attack types → link the red-teaming guide.
- **Post C (data):** publish a finding from the research asset below.
- Tag relevant people, post Tue–Thu mornings, reply to every comment (engagement → reach → profile visits → links over time).

## 4. dev.to / Hashnode / Medium (canonical cross-posts)
Cross-post the pillars as articles with `canonical_url` pointing back to ariaeval.io (preserves SEO credit, earns the platform link + new audience). Lead candidates: the evaluation pillar and the red-teaming guide.

---

## 5. Original research asset (highest link ROI)
Original data earns more links than any other content type — and you run an eval platform, so you can produce it.

**Proposed study: "Single-judge vs. multi-judge agreement on agent evaluation."**
- **Method:** run N conversations through (a) a single-judge config and (b) the panel; measure how often the single judge agrees with itself vs. the panel + human ground truth, and where they diverge (which dimensions, which attack types).
- **Headline stats to surface:** single-judge false-pass rate; panel agreement with humans; % of agents that fail at least one prompt-injection test.
- **Format:** a `/research/...` page + a downloadable PDF + 3–4 charts. Each chart is independently citable/shareable.
- **Distribution:** LinkedIn, HN ("Show HN: data on…"), Reddit, and pitch to AI newsletters (see Tier 3).
- **Why it works:** journalists and bloggers link to *the source of a statistic*. Be that source.

---

## Tracking
- Watch **Search Console → Links** for new referring domains as these land.
- Add a free **Moz API key** later to track DA/referring domains in the existing `seo-backlinks` tooling.
- Leading indicator: referral sessions from HN/Reddit/LinkedIn in analytics before links show in GSC.
