# Building Guardrail Advisor with Claude Code CLI

This guide walks through the exact sequence to implement Phase 1 using Claude Code CLI, following spec-driven + test-driven development.

---

## Prerequisites

```bash
# Ensure you're on main and up to date
git checkout main && git pull

# Create the feature branch — never code on main
git checkout -b feature/guardrail-advisor-phase1

# Verify the dev environment runs
npm run dev
```

---

## How to Start Claude Code

```bash
# From the project root
claude
```

Claude Code reads `CLAUDE.md` automatically on startup. It will know the stack, rules, and conventions. You don't need to re-explain them.

---

## Implementation Sequence

Work through these in order. Each step is a focused prompt to Claude Code. Finish one before starting the next — each step's output is used by the next.

---

### Step 1 — Types and Domain Taxonomy

**Prompt:**
```
Read docs/GUARDRAIL_ADVISOR_PHASE1.md.

Create src/guardrail/types.ts with all TypeScript types defined in the spec
(ClarifyingQuestion, GuardrailRecommendation, ClarifyingAnswers, Platform enum,
GuardrailSeverity enum, FormattedConfig).

Then create src/guardrail/domain-taxonomy.json with all 6 domains and their
sub-functions exactly as specified.

No implementation logic yet — types and data only.
```

---

### Step 2 — Prisma Schema

**Prompt:**
```
Add the three new Prisma models from docs/GUARDRAIL_ADVISOR_PHASE1.md to
prisma/schema.prisma:
  - PlatformDocChunk
  - GuardrailAdvisorSession
  - GuardrailRecommendationRecord

Note the embeddingRaw field stores JSON for SQLite dev compat — add a comment
explaining the prod migration path to vector(1536).

After editing schema.prisma run:
  npm run db:generate

Do not run db:migrate yet — we'll do that after reviewing the schema.
```

After Claude Code edits the schema, review it yourself, then run:

```bash
npm run db:migrate
```

---

### Step 3 — RAG Chunker (TDD)

**Prompt:**
```
Following TDD: write src/rag/chunker.test.ts first with these three tests:
  1. Chunks a 2000-word string into segments ≤512 tokens
  2. Preserves fenced code blocks intact (never splits inside a code block)
  3. Overlap between consecutive chunks is approximately 50 tokens

Run the tests — they must fail first.

Then implement src/rag/chunker.ts to make them pass.
Use tiktoken or a simple word-count heuristic (1 token ≈ 0.75 words) —
no external tokenizer dependency needed for Phase 1.
```

---

### Step 4 — Embedder

**Prompt:**
```
Create src/rag/embedder.ts.

It wraps AWS Bedrock Titan Text Embeddings v2 (model: amazon.titan-embed-text-v2:0).
Export a single function:
  embedText(text: string): Promise<number[]>

Use the existing Bedrock client pattern from src/judge/ — check how it
initialises BedrockRuntimeClient there and reuse the same approach.

Add a mock export for tests:
  embedTextMock(text: string): Promise<number[]>  // returns deterministic fake vector
```

---

### Step 5 — RAG Retriever (TDD)

**Prompt:**
```
Following TDD: write src/rag/retriever.test.ts first with these tests:
  1. Returns top-5 chunks ordered by cosine similarity for a given platform
  2. Returns empty array gracefully when no chunks exist for platform
  3. Filters strictly by platform — chunks from other platforms not returned

Use embedTextMock from src/rag/embedder.ts in tests.

Then implement src/rag/retriever.ts:
  retrieveChunks(query: string, platform: string, topK = 5): Promise<DocChunk[]>

For dev (SQLite): compute cosine similarity in TypeScript over stored JSON vectors.
For prod (PostgreSQL): use pgvector <=> operator via Prisma $queryRaw.
Detect which to use via DATABASE_URL starting with 'postgresql'.
```

---

### Step 6 — Guardrail Knowledge Base + Engine (TDD)

**Prompt:**
```
Create src/guardrail/guardrail-knowledge.json with at minimum these entries
(I'll expand it later):
  - banking:customer-support  (3 REQUIRED, 2 RECOMMENDED guardrails)
  - banking:bereavement       (2 REQUIRED, 1 RECOMMENDED)
  - legal:contract-review     (2 REQUIRED, 1 RECOMMENDED)
  - healthcare:patient-support (3 REQUIRED — include HIPAA citations)

Use the structure defined in docs/GUARDRAIL_ADVISOR_PHASE1.md.

Then write src/guardrail/engine.test.ts with these tests:
  1. Returns correct REQUIRED guardrails for banking:customer-support
  2. Adding jurisdiction=EU augments results with GDPR-specific entries
  3. Results are ordered REQUIRED → RECOMMENDED → OPTIONAL

Run tests — must fail.

Then implement src/guardrail/engine.ts to make them pass.
```

---

### Step 7 — Clarifying Question Generator

**Prompt:**
```
Write src/guardrail/clarifier.test.ts with these tests (mock Bedrock):
  1. Returns between 3 and 5 questions for any domain/subFunction
  2. Every question has a valid type: single-choice | multi-choice | text
  3. Single/multi-choice questions always have at least 2 options

Then implement src/guardrail/clarifier.ts:
  generateQuestions(domain: string, subFunction: string): Promise<ClarifyingQuestion[]>

Prompt to Claude via Bedrock (claude-3-haiku — cheap, fast enough for this):
  - Include domain + subFunction in the system prompt
  - Ask it to return structured JSON matching ClarifyingQuestion[]
  - Parse and validate response with Zod before returning
  - On parse failure, return a hardcoded fallback set of 4 questions
    (jurisdiction, user-facing, PII types, autonomy level) so the UI
    never breaks due to an LLM response failure.
```

---

### Step 8 — RAG Formatter

**Prompt:**
```
Implement src/rag/formatter.ts:
  formatGuardrailForPlatform(
    recommendation: GuardrailRecommendation,
    platform: Platform
  ): Promise<FormattedConfig>

It should:
  1. Build a query string from the recommendation type + description + platform
  2. Call retriever.retrieveChunks(query, platform, 5)
  3. Build a prompt that includes: the guardrail spec + the retrieved doc chunks
  4. Call Claude via Bedrock to generate the formatted config
  5. Return { config, language, sourceDocUrls, docsFreshAsOf }

Detect language from platform:
  bedrock  → yaml
  langchain → python
  copilot  → text
  foundry  → json
  strands  → python

No test for this in Phase 1 — integration test via the API route.
```

---

### Step 9 — API Routes (TDD)

**Prompt:**
```
Write src/api/routes/guardrail-advisor.test.ts with these integration tests
(use supertest, mock src/guardrail/clarifier and src/rag/formatter):
  1. GET /api/guardrail-advisor/domains returns 6 domains
  2. POST /api/guardrail-advisor/sessions with valid body returns sessionId + questions
  3. POST /api/guardrail-advisor/sessions/:id/recommend returns grouped recommendations
  4. POST /api/guardrail-advisor/sessions/:id/format returns config with sourceDocUrls
  5. POST /api/guardrail-advisor/sessions with missing domain returns 400

Run tests — must fail.

Then implement src/api/routes/guardrail-advisor.ts following the API contract
in docs/GUARDRAIL_ADVISOR_PHASE1.md.

Rules:
  - Use requireAuth on all routes except GET /domains
  - Validate all POST bodies with Zod (put schemas in src/shared/)
  - Use recordAuditEventSafe() on session creation
  - 404 if session not found; 400 on invalid input
  - Register the router in src/api/server.ts
```

---

### Step 10 — UI: Guardrail Advisor Page

**Prompt:**
```
Create src/ui/pages/GuardrailAdvisorPage.tsx.

It's a 4-step wizard. Read docs/GUARDRAIL_ADVISOR_PHASE1.md for the
exact step descriptions. Use the existing UI patterns from ScenariosPage.tsx
and RunsPage.tsx for layout, card styles, and button styles — do not invent
new design patterns.

Steps:
  1. Domain selection — grid of 6 domain cards, sub-function chips on select
  2. Clarifying questions — rendered dynamically from API response
     (chips for single/multi-choice, text input for text type)
  3. Recommendations — grouped by severity with REQUIRED/RECOMMENDED/OPTIONAL
     badges. Platform dropdown at top.
  4. Formatted configs — syntax-highlighted code blocks with Copy button,
     source citation, and "Start over" button.

State management: local useState only (no external state lib needed).

After creating the page:
  1. Add 'guardrail-advisor' to the Page type in App.tsx
  2. Add it to the NAV array with label "Guardrail Advisor"
  3. Add the route in the main render switch
```

---

### Step 11 — Lambda Crawler

**Prompt:**
```
Create lambda/guardrail-doc-crawler/index.ts.

It is an AWS Lambda handler (EventBridge trigger — no HTTP event shape).

It should:
  1. Import DOC_TARGETS from src/rag/doc-targets.ts
  2. For each platform and URL: fetch the page, chunk it, embed each chunk,
     upsert into PlatformDocChunk (skip if contentHash unchanged)
  3. On content change: call a helper markConfigsStale(platform, docUrl)
     that sets configGeneratedAt = null on affected GuardrailRecommendationRecord rows
  4. Log a summary per platform: URLs checked / updated / skipped
  5. Never log actual doc content

Add src/rag/doc-targets.ts with the 5 platforms and URLs from the spec.

No Terraform yet — that's a separate step.
```

---

### Step 12 — Final Lint + Review

**Prompt:**
```
Run: npm run lint

Fix all TypeScript errors. Then run the full test suite.

Check:
  1. All new files have correct imports (no missing modules)
  2. New Prisma models are used correctly (no raw SQL except the pgvector query
     in retriever.ts which is intentionally raw)
  3. No transcript content or PII is logged anywhere in the new code
  4. The guardrail-advisor router is correctly mounted in server.ts
```

---

### Step 13 — Commit and PR

```bash
# From your terminal (not Claude Code)
git add -A
git commit -m "feat: guardrail advisor phase 1 — domain wizard, RAG formatter, platform configs"
git push origin feature/guardrail-advisor-phase1

# Open PR on GitHub — title should match commit message
# PR description should reference docs/GUARDRAIL_ADVISOR_PHASE1.md
```

---

## Tips for Working with Claude Code on This

**Context resets:** Claude Code loses context between sessions. Start each new session with:
```
Read CLAUDE.md and docs/GUARDRAIL_ADVISOR_PHASE1.md before doing anything.
```

**When Claude Code goes off-spec:** If it starts inventing types or routes not in the spec, redirect it:
```
Stop. Check docs/GUARDRAIL_ADVISOR_PHASE1.md — the [API contract / data model / UI flow]
section defines exactly what this should look like. Follow the spec.
```

**Bedrock mocking in tests:** Claude Code will want to make real Bedrock calls in tests. Preempt this:
```
All Bedrock calls in tests must be mocked with jest.mock() — never make real
HTTP calls in unit or integration tests.
```

**pgvector in dev:** The `embeddingRaw` JSON approach is intentional for SQLite dev compat. If Claude Code tries to add pgvector to the dev schema, stop it — that's a prod-only concern handled by a future migration.

**Step independence:** Each step above is self-contained. If a step fails or produces wrong output, fix it before moving to the next — later steps import from earlier ones.
