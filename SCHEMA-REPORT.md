# Schema.org Report — ariaeval.io

**Date:** 2026-06-23 · **Command:** `/seo schema` · **Business type:** SaaS (browser-based AI evaluation platform)
**Page audited:** https://ariaeval.io/ (HTTP 200, served HTML inspected directly)

> **✅ Implemented in code** (`website/`, deploys with the site):
> - `website/src/lib/schema.ts` — site-wide `@graph` (Organization + WebSite + WebApplication). Offers are generated from `src/lib/plans.ts`, so the 4 priced tiers (Free $0 / Individual $49 / Enterprise Starter $299 / Enterprise Pro $799; the "Contact sales" Unlimited tier is skipped) stay in sync with pricing automatically.
> - `website/src/components/shared/JsonLd.tsx` — server-rendered `<script type="application/ld+json">` component.
> - `website/src/app/layout.tsx` — renders the graph site-wide in the initial SSR HTML.
>
> **Still TODO before/after deploy:** fill `SOCIAL_PROFILES` in `schema.ts` with real LinkedIn/X/GitHub URLs; validate via the Rich Results Test once deployed. Per-page Breadcrumb / BlogPosting / ContactPage are not yet wired (templates below).

---

## 1. Detection

| Format | Found | Notes |
|--------|-------|-------|
| JSON-LD (`application/ld+json`) | ❌ 0 blocks | None in the server-rendered HTML |
| Microdata (`itemscope`/`itemprop`) | ❌ None | — |
| RDFa (`typeof`/`property`) | ❌ None | — |

**Verdict: the site has no structured data at all.** It's a Next.js app (`next-size-adjust` meta present). Because nothing is in the served HTML, there is currently nothing for Google/Bing or AI engines (AI Overviews, ChatGPT, Perplexity) to use for entity resolution. Content with proper schema has ~2.5× higher odds of being cited in AI answers — so this is pure upside left on the table.

**Adjacent gap (not schema, but found in the same `<head>`):** no `canonical`, no Open Graph (`og:*`), no Twitter Card tags. Only `<title>`, `description`, and `viewport` exist. Worth fixing alongside schema since both feed social/AI previews.

---

## 2. Validation

Nothing to validate — no markup exists. The table below is the **target state** to implement.

| Schema | Type | Status | Priority | Where |
|--------|------|--------|----------|-------|
| Organization | Active | ❌ Missing | **Critical** | Site-wide (`<head>`) |
| WebSite | Active | ❌ Missing | **High** | Site-wide (`<head>`) |
| WebApplication (+ Offers) | Active | ❌ Missing | **Critical** | Homepage / Pricing |
| BreadcrumbList | Active | ❌ Missing | Medium | Every sub-page |
| ContactPage | Active | ❌ Missing | Low | `/contact` |
| BlogPosting | Active | ❌ Missing | Medium | Each `/blog` post (when blog ships) |

No deprecated types are in use (nothing to remove). Do **not** add `FAQPage` for SERP value — Google retired FAQ rich results for all sites on **May 7, 2026**. Only add it if you have a real FAQ and want the AI-citation signal (Info-level, not a ranking feature).

---

## 3. Recommendations (prioritized)

### Critical
1. **Organization (site-wide).** Establishes the `ARIA Evaluator, Inc.` entity for the Knowledge Graph and AI engines. *Falsifiability:* paste the homepage URL into [validator.schema.org](https://validator.schema.org/) — it should report one `Organization` with `name`, `logo`, `sameAs`. *Leading indicator:* a brand Knowledge Panel / consistent AI brand description appears within a few weeks.
2. **WebApplication with the 3 pricing Offers.** This is your richest entity — `applicationCategory`, `featureList`, and `offers` (Free / $49 / $299). *Falsifiability:* [Rich Results Test](https://search.google.com/test/rich-results) detects a "Software App" item with price and currency. *Leading indicator:* price/rating annotation eligibility in Search Console's enhancement reports.

### High
3. **WebSite (site-wide).** Names the site entity and links it to the Organization as `publisher`. I intentionally **omitted** `potentialAction`/`SearchAction` because the site has no working search endpoint — only add a Sitelinks Searchbox if/when a real `?q=` search exists (a fake one is a Rich Results error).

### Medium
4. **BreadcrumbList** on `/features`, `/pricing`, `/docs`, `/community`, `/blog/*`. Cheap, eligible for breadcrumb rich results, and clarifies hierarchy for crawlers.
5. **BlogPosting** per article once the blog publishes — drives Article rich results and `author`/E‑E‑A‑T signals.

### Low
6. **ContactPage** on `/contact` — minor, but completes the entity graph.

### Implementation note (important)
Per Google's Dec 2025 JS-SEO guidance, JSON-LD injected client-side can be processed late. You're on **Next.js**, so render the JSON-LD **server-side** — drop the `@graph` block into the root layout `<head>` (or a `<Script type="application/ld+json" strategy="beforeInteractive">` / Next Metadata route) so it's in the initial HTML. Verify with `view-source:` (not just DevTools) that the `ld+json` block is present before hydration.

---

## 4. Items you MUST replace before deploying

`generated-schema.json` contains placeholders (JSON-LD can't hold comments, so they're listed here):

| Field | Placeholder in file | Replace with |
|-------|--------------------|--------------|
| `Organization.logo.url` | `https://ariaeval.io/logo.png` | Real logo URL — square PNG/SVG, ≥112×112, on a transparent/solid bg |
| `Organization.sameAs[]` | linkedin / x / github guesses | Your **real** profile URLs; delete any you don't have |
| `BlogPosting.*` | `REPLACE-ME...` | Real title, author, dates (ISO 8601), image, slug per post |
| `BreadcrumbList` | Pricing example | The actual trail for each page |

**Do not add `aggregateRating`** until you have genuine, on-site reviews — fabricated ratings are a Google manual-action risk. When you do collect real reviews, add an `aggregateRating` node to the `WebApplication` to unlock the star annotation.

---

## 5. Generated code

Ready-to-paste JSON-LD is in **`generated-schema.json`** (same folder):
- `sitewide_plus_homepage_graph` — Organization + WebSite + WebApplication as one `@graph`
- `template_breadcrumb_subpage`, `template_contactpage`, `template_blogposting` — per-page templates

After pasting + replacing placeholders, validate every page through both the [Rich Results Test](https://search.google.com/test/rich-results) and the [Schema.org Validator](https://validator.schema.org/) before shipping.
