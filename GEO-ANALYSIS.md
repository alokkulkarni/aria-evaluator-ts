# GEO / AI-Search Analysis — ariaeval.io

**Date:** 2026-06-23 · **Command:** `/seo geo` · **Surface:** Next.js SaaS marketing site (`website/`)
**Framing (per Google's primary source):** GEO is SEO applied to AI-search surfaces — these are SEO fundamentals, not a separate discipline.

## GEO Readiness Score: **55 → 66 / 100**
- **55** as-found · **66** after the code changes in this PR (below). The remaining gap is **content + off-site**, which code can't fix.

| Criterion (weight) | As-found | After PR | Why |
|---|---|---|---|
| Technical accessibility (20%) | 55 | **92** | SSR already excellent; this PR adds robots.txt (AI crawlers), sitemap.xml, llms.txt |
| Authority & brand (20%) | 45 | **62** | Org + BlogPosting/Person schema + article OG + surfaced publish dates; still no `sameAs`/entity presence, content stale |
| Citability (25%) | 52 | 52 | Specific stats exist, but no definitional answer blocks / question headings yet (content work) |
| Structural readability (20%) | 65 | 66 | Clean H1→H3, lists; headings are statements, not questions |
| Multi-modal (15%) | 60 | 62 | Product video + charts present; video not marked up, alt-text unaudited |

---

## 1. Technical accessibility — the big win (was the weakest infra area)

**Server-side rendering: ✅ excellent.** The raw HTML carries all marketing copy (~82K chars of text; "15 dimensions", "Amazon Connect", "prompt injection" all present). Pages are React **server components**, so AI crawlers — which **do not execute JavaScript** — see the full content. This is the single most important GEO prerequisite and it's already right.

**What was missing (all returned the SPA HTML at HTTP 200, i.e. did not exist):**

| File | Was | Now (this PR) |
|---|---|---|
| `/robots.txt` | ❌ missing | ✅ `app/robots.ts` — allows GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, PerplexityBot, Google-Extended, Applebot-Extended, CCBot; disallows `/api`, `/dashboard`, auth flows; points to sitemap |
| `/sitemap.xml` | ❌ missing | ✅ `app/sitemap.ts` — 13 static routes + 6 blog posts + 6 community pages, dynamic from data |
| `/llms.txt` | ❌ missing | ✅ `public/llms.txt` (see caveat below) |
| `/.well-known/security.txt` | ✅ present | unchanged — good hygiene signal |

> **llms.txt caveat (honesty per Google's primary source):** Mueller/Illyes and the SE Ranking 300k-domain study show `/llms.txt` is **not currently a citation lever** for major AI search systems. I added it because it's cheap, harmless, and documents the site for the smaller tools that do read it — but assign it **no ranking weight** and don't prioritise maintaining it.

---

## 2. Platform breakdown (only ~11% of domains are cited by both ChatGPT and Google AIO — optimise per surface)

| Platform | Outlook | Lever |
|---|---|---|
| **Google AI Overviews** | Moderate — cites already-ranking pages. SSR + new sitemap/schema help; needs classic ranking + citable passages | Rank + front-loaded answer blocks |
| **Google AI Mode** (Gemini 3.5 Flash) | Weak — broader pool favouring **freshness + entity authority**; hurt by 12-month-old blog and no entity presence | Freshness program, entity/sameAs |
| **ChatGPT** | Weak — leans Wikipedia (48%) + Reddit (11%); no brand entity presence | Wikipedia/Wikidata, Reddit mentions |
| **Perplexity** | Weak — leans Reddit (47%) + Wikipedia | Community validation |
| **Bing Copilot** | Improving — sitemap helps Bing indexing | Add IndexNow ping; Bing Webmaster |

---

## 3. AI crawler access
Before: no robots rules at all. After: AI search crawlers explicitly allowed; private/app routes (`/api`, `/dashboard`, `/sign-out`, provisioning) disallowed. CCBot (Common Crawl, training) is currently **allowed** — flip it to disallow in `app/robots.ts:aiCrawlers` if you want to opt out of training corpora.

## 4. Brand mention analysis (off-site — highest leverage, can't be coded)
Brand mentions correlate **3× more** with AI visibility than backlinks (Ahrefs, 75k brands). Current entity footprint is effectively **zero**: no `sameAs`, no detected LinkedIn/X/GitHub, no Wikipedia/Wikidata, no Reddit/YouTube presence.
- **Do first:** create and cross-link real LinkedIn, GitHub, X profiles → add them to `SOCIAL_PROFILES` in `website/src/lib/schema.ts` (the `sameAs` is wired and only emits when non-empty).
- Then: Wikidata entry, founder/author LinkedIn with credentials, genuine Reddit/YouTube participation.

## 5. Passage-level citability (content — not yet done)
~44% of AI citations come from the **first 30%** of a page; optimal extractable block is **134–167 words**. The homepage leads with a slogan H1 ("Evaluate AI Agents. At Enterprise Scale.") and statement-style section headings — strong marketing, weak for extraction. No "**What is …**" definition appears in the first 60 words.

## 6. Authority & recency (partly coded, partly content)
- ✅ Blog posts already have **author bylines, roles, dates, and cited references** — genuinely good E-E-A-T. Now reinforced with `BlogPosting` + `Person` schema and `article` Open Graph (publishedTime/authors).
- ⚠️ **Freshness:** all 6 posts are dated **Mar–May 2025** (12+ months old). Pages stale 6+ months lose AI-citation eligibility (SE Ranking, 1.3M citations). A scheduled refresh + new dated content is one of the highest-leverage plays.

## 7. Server-side rendering check
✅ Pass — see §1. Keep new content in server components; the schema/JSON-LD is server-rendered via `<JsonLd>` so it's in the initial HTML.

---

## 8. Top 5 highest-impact changes
1. ✅ **robots.txt + AI crawler access + sitemap** — *done this PR* (was the biggest infra gap).
2. ✅ **sitemap.xml** (discovery for all routes) — *done this PR*.
3. ⏳ **Citable answer blocks + question headings** — add a 134–167-word "What is AI agent evaluation?" / "How does ARIA score a conversation?" self-contained block in the first 30% of the homepage, `/docs`, and key blog posts; convert section `H2`s to questions. *Falsifiability:* the block is quotable standalone without surrounding context.
4. ⏳ **Freshness program** — refresh the 6 posts (real `dateModified`), then publish on a cadence. *Leading indicator:* AI-citation share rising for dated/refreshed URLs.
5. ⏳ **Entity presence + `sameAs`** — real social/Wikidata profiles, then populate `SOCIAL_PROFILES`. *Leading indicator:* brand Knowledge Panel; consistent AI brand description.

## 9. Schema recommendations (for AI discoverability)
- ✅ Done: Organization, WebSite, WebApplication (site-wide), BlogPosting + Person (per post).
- ⏳ `VideoObject` for the homepage product reel — only once you have a real `uploadDate`, description, and ideally a transcript (don't fabricate).
- ⏳ `ProfilePage` (mainEntity Person) for blog authors to strengthen E-E-A-T.
- FAQ **content** (not `FAQPage` for SERP — Google retired FAQ rich results May 7 2026; the on-page Q&A is still highly citable for AI).

## 10. Content reformatting suggestions
- **Hero:** keep the slogan H1, but add a one-sentence definitional lead directly under it ("ARIA Evaluator is an AI safety evaluation platform that …").
- **Section headings → questions:** "Every conversation, scored across 15 dimensions" → "What are the 15 evaluation dimensions?"; "Works with the agent platform you already run" → "Which agent platforms does ARIA support?".
- **Add a comparison table:** single-LLM judge vs. multi-judge panel (you already make this argument in prose and a blog post — a table is far more AI-extractable).
- **Add a real, sourced stats line** near the top; mark illustrative dashboard numbers (e.g. "742 active runs", "96%") clearly as sample data so they aren't mis-cited as facts.

---

### Implemented in `website/` (deploys with the site)
- `src/app/robots.ts`, `src/app/sitemap.ts` — metadata routes → real `/robots.txt`, `/sitemap.xml`
- `public/llms.txt`
- `src/lib/schema.ts` — added `buildBlogPostingSchema()`
- `src/app/blog/[slug]/page.tsx` — renders BlogPosting JSON-LD + article OG + canonical
- `src/app/layout.tsx` — `metadataBase`, Open Graph, Twitter Card, indexing directives

`npx tsc --noEmit` passes. Validate after deploy: Rich Results Test, `validator.schema.org`, and fetch `/robots.txt` + `/sitemap.xml` to confirm they return real files (not HTML).
