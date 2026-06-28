# Guardrail Advisor — Phase 1 Spec

## Overview

A new "Guardrail Advisor" section in ARIA that guides developers through a domain-aware clarifying question flow and returns recommended guardrails with rationale, regulatory citations, and platform-specific formatted configs. Built on a RAG engine backed by live platform documentation.

**Not in scope (Phase 1):** compliance catalog, review/approval workflow, user roles, post-eval guardrail suggestions (Phase 2).

---

## Goals

1. User selects a domain → answers 3–5 clarifying questions → receives guardrail recommendations ranked by severity.
2. User selects their agent platform → receives copy-paste config/code formatted for that platform.
3. Recommendations include regulatory citations where applicable (GDPR, FINRA, HIPAA, FCA, etc.).
4. Platform configs are generated via RAG over live docs, not hardcoded templates.

---

## User Stories

- **As a developer** building a banking compliance agent on Bedrock, I want to know what guardrails I must configure before I go live, without reading 200 pages of docs.
- **As a developer** building an HR onboarding agent on LangChain, I want formatted Python code for each recommended guardrail I can paste directly into my project.
- **As a compliance-aware developer**, I want each recommendation to cite the regulation it satisfies so I can defend the choices to my risk team.

---

## Domain Taxonomy (Static JSON — Phase 1)

Stored at `src/guardrail/domain-taxonomy.json`. Structure:

```json
{
  "domains": [
    {
      "id": "banking",
      "label": "Banking & Financial Services",
      "subFunctions": [
        { "id": "customer-support", "label": "Customer Support Agent" },
        { "id": "compliance",       "label": "Compliance Agent (Regulatory)" },
        { "id": "loan-application", "label": "Loan Application Agent" },
        { "id": "bereavement",      "label": "Bereavement / Sensitive Account Agent" },
        { "id": "fraud-detection",  "label": "Fraud Detection & Prevention" }
      ]
    },
    {
      "id": "legal",
      "label": "Legal",
      "subFunctions": [
        { "id": "contract-review",   "label": "Contract Review Agent" },
        { "id": "legal-research",    "label": "Legal Research Agent" },
        { "id": "client-intake",     "label": "Client Intake Agent" }
      ]
    },
    {
      "id": "healthcare",
      "label": "Healthcare",
      "subFunctions": [
        { "id": "patient-support",   "label": "Patient Support Agent" },
        { "id": "clinical-decision", "label": "Clinical Decision Support" },
        { "id": "scheduling",        "label": "Appointment Scheduling Agent" }
      ]
    },
    {
      "id": "hr",
      "label": "Human Resources",
      "subFunctions": [
        { "id": "recruitment",   "label": "Recruitment Agent" },
        { "id": "onboarding",    "label": "Employee Onboarding Agent" },
        { "id": "policy-qa",     "label": "Policy Q&A Agent" }
      ]
    },
    {
      "id": "insurance",
      "label": "Insurance",
      "subFunctions": [
        { "id": "claims",        "label": "Claims Processing Agent" },
        { "id": "underwriting",  "label": "Underwriting Agent" },
        { "id": "customer-care", "label": "Customer Care Agent" }
      ]
    },
    {
      "id": "retail",
      "label": "Retail & E-Commerce",
      "subFunctions": [
        { "id": "customer-service", "label": "Customer Service Agent" },
        { "id": "product-advisor",  "label": "Product Advisor Agent" }
      ]
    }
  ]
}
```

Add new domains without code changes — the UI reads this file at runtime.

---

## Clarifying Questions

After domain + sub-function selection, the backend generates 3–5 clarifying questions using Claude via Bedrock. The LLM prompt is pre-seeded with the domain context. Questions cover:

1. **Jurisdiction** — Which regulatory regions apply? (EU/GDPR, US/FINRA, UK/FCA, HIPAA, multi-jurisdiction)
2. **User type** — Is this agent user-facing (customers) or internal (staff)?
3. **Data sensitivity** — Does the agent handle PII? What types? (SSN, account numbers, health records, biometrics)
4. **Autonomy level** — Can the agent take actions (execute transactions, update records), or is it read-only?
5. **Sub-function specific** — e.g. for "bereavement agent": Does it handle account closures or just information queries?

Questions are returned as structured JSON (not free text) so the UI can render them as multi-choice chips or short text inputs.

---

## Guardrail Recommendation Engine

### Location: `src/guardrail/`

```
src/guardrail/
  domain-taxonomy.json     ← static domain/subfunction map
  guardrail-knowledge.json ← curated guardrail requirements per domain+function
  engine.ts                ← core recommendation logic
  clarifier.ts             ← LLM-based clarifying question generator
  formatter.ts             ← RAG-based platform config generator
  types.ts                 ← shared TypeScript types
```

### `guardrail-knowledge.json` structure (curated, Phase 1)

```json
{
  "banking:customer-support": {
    "required": [
      {
        "id": "topic-denial-financial-advice",
        "type": "TOPIC_DENIAL",
        "title": "Deny unsolicited financial advice",
        "rationale": "Agents must not provide personalised investment advice without FCA/SEC authorisation.",
        "regulations": ["FCA COBS 9", "SEC Rule 15l-1"]
      },
      {
        "id": "pii-account-numbers",
        "type": "PII_FILTER",
        "title": "Redact account numbers and sort codes in responses",
        "rationale": "PII leakage in logs violates GDPR Art. 5(1)(f).",
        "regulations": ["GDPR Art. 5", "PSD2"]
      }
    ],
    "recommended": [ ... ],
    "optional": [ ... ]
  }
}
```

### Recommendation logic (`engine.ts`)

```typescript
export async function getRecommendations(
  domain: string,
  subFunction: string,
  clarifyingAnswers: ClarifyingAnswers
): Promise<GuardrailRecommendation[]>
```

1. Load `guardrail-knowledge.json` entry for `domain:subFunction`.
2. Filter/augment based on `clarifyingAnswers` (e.g. if jurisdiction = EU, add GDPR-specific entries).
3. Return sorted: REQUIRED → RECOMMENDED → OPTIONAL.

---

## RAG Pipeline for Platform Formatting

### Location: `src/rag/`

```
src/rag/
  crawler.ts      ← fetches and chunks platform doc pages
  embedder.ts     ← Bedrock Titan Text Embeddings v2 wrapper
  retriever.ts    ← pgvector cosine similarity search
  formatter.ts    ← retrieval + Claude generation → platform config
  chunker.ts      ← 512-token chunks, 50-token overlap, preserves code blocks
  doc-targets.ts  ← list of URLs to crawl per platform
```

### Supported platforms (Phase 1)

| Platform ID   | Label                        |
|---------------|------------------------------|
| `bedrock`     | AWS Bedrock Guardrails       |
| `langchain`   | LangChain (Python)           |
| `copilot`     | Microsoft Copilot Studio     |
| `foundry`     | Azure AI Foundry             |
| `strands`     | AWS Strands Agents           |

### `doc-targets.ts`

```typescript
export const DOC_TARGETS: Record<string, string[]> = {
  bedrock: [
    'https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails.html',
    'https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails-create.html',
    'https://docs.aws.amazon.com/bedrock/latest/APIReference/API_CreateGuardrail.html',
  ],
  langchain: [
    'https://python.langchain.com/docs/how_to/output_parser_json/',
    'https://python.langchain.com/docs/concepts/structured_outputs/',
  ],
  copilot: [
    'https://learn.microsoft.com/en-us/microsoft-copilot-studio/advanced-ai-features',
  ],
  foundry: [
    'https://learn.microsoft.com/en-us/azure/ai-foundry/concepts/content-filtering',
  ],
  strands: [
    'https://strandsagents.com/latest/documentation/docs/safety-privacy/',
  ],
};
```

### Prisma schema additions

```prisma
// pgvector extension must be enabled on PostgreSQL:
// CREATE EXTENSION IF NOT EXISTS vector;

model PlatformDocChunk {
  id           String   @id @default(cuid())
  platform     String
  docUrl       String
  chunkIndex   Int
  content      Text
  contentHash  String
  // Raw float array stored as JSON for SQLite dev compat.
  // In prod migrations, ALTER this column to vector(1536).
  embeddingRaw String   @default("[]")
  crawledAt    DateTime @default(now())
  updatedAt    DateTime @default(now()) @updatedAt

  @@unique([docUrl, chunkIndex])
  @@index([platform])
}

model GuardrailAdvisorSession {
  id               String   @id @default(cuid())
  tenantId         String   @default("")
  domain           String
  subFunction      String
  jurisdiction     String?
  userFacing       Boolean  @default(true)
  dataTypes        String   @default("[]")   // JSON array of PII types
  autonomyLevel    String?  // read-only | transactional | agentic
  platform         String?  // set after platform selection step
  rawAnswers       String   @default("{}")   // full clarifying answers JSON
  createdAt        DateTime @default(now())
  updatedAt        DateTime @default(now()) @updatedAt

  recommendations  GuardrailRecommendationRecord[]

  @@index([tenantId])
}

model GuardrailRecommendationRecord {
  id              String   @id @default(cuid())
  sessionId       String
  session         GuardrailAdvisorSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  guardrailId     String   // e.g. "topic-denial-financial-advice"
  guardrailType   String   // TOPIC_DENIAL | PII_FILTER | CONTENT_FILTER | etc.
  severity        String   // REQUIRED | RECOMMENDED | OPTIONAL
  title           String
  description     String
  rationale       String
  regulations     String   @default("[]")   // JSON array of citation strings
  platformConfig  String?  // JSON — formatted config for chosen platform
  sourceDocUrls   String   @default("[]")   // RAG source citations JSON array
  configGeneratedAt DateTime?
  createdAt       DateTime @default(now())

  @@index([sessionId])
}
```

---

## API Contract

All routes under `/api/guardrail-advisor`. Protected by `requireAuth`.

### `GET /api/guardrail-advisor/domains`
Returns the full domain taxonomy JSON. No auth required (public reference data).

**Response:**
```json
{ "domains": [ { "id": "banking", "label": "...", "subFunctions": [...] } ] }
```

---

### `POST /api/guardrail-advisor/sessions`
Start a new advisor session.

**Body (Zod-validated):**
```typescript
{
  domain: string,
  subFunction: string
}
```

**Response:** `{ sessionId: string, questions: ClarifyingQuestion[] }`

```typescript
interface ClarifyingQuestion {
  id: string;
  text: string;
  type: 'single-choice' | 'multi-choice' | 'text';
  options?: { value: string; label: string }[];
}
```

---

### `POST /api/guardrail-advisor/sessions/:id/recommend`
Submit clarifying answers and get recommendations.

**Body:**
```typescript
{ answers: Record<string, string | string[]> }
```

**Response:**
```typescript
{
  recommendations: {
    id: string;
    guardrailType: string;
    severity: 'REQUIRED' | 'RECOMMENDED' | 'OPTIONAL';
    title: string;
    rationale: string;
    regulations: string[];
  }[]
}
```

---

### `POST /api/guardrail-advisor/sessions/:id/format`
Generate platform-specific config for one or all recommendations.

**Body:**
```typescript
{
  platform: 'bedrock' | 'langchain' | 'copilot' | 'foundry' | 'strands';
  guardrailIds: string[];   // empty array = format all
}
```

**Response:**
```typescript
{
  platform: string;
  configs: {
    guardrailId: string;
    config: string;           // formatted YAML/JSON/Python as string
    language: 'yaml' | 'json' | 'python' | 'text';
    sourceDocUrls: string[];
    docsFreshAsOf: string;    // ISO timestamp of most recent crawl
  }[]
}
```

---

### `GET /api/guardrail-advisor/sessions/:id`
Retrieve a full session with all recommendations and configs.

---

## UI Flow

### New page: `GuardrailAdvisorPage.tsx`

Add `'guardrail-advisor'` to the `Page` type in `App.tsx`. Add to `NAV` array.

**4-step wizard (single page, step state managed locally):**

```
Step 1: Domain Selection
  └─ Grid of domain cards (Banking, Legal, Healthcare, HR, Insurance, Retail)
  └─ On select → show sub-function chips
  └─ CTA: "Continue"

Step 2: Clarifying Questions
  └─ Rendered from API response (single/multi choice chips + optional text fields)
  └─ Progress indicator: "Step 2 of 4"
  └─ CTA: "Get Recommendations"

Step 3: Recommendations
  └─ Grouped by severity: REQUIRED (red badge) / RECOMMENDED (amber) / OPTIONAL (blue)
  └─ Each card: title, rationale, regulation badges (clickable → open regulation URL)
  └─ Platform selector dropdown at top of this step
  └─ CTA: "Generate Configs for [Platform]"

Step 4: Formatted Configs
  └─ One collapsible card per recommendation
  └─ Syntax-highlighted code block (use existing highlight approach in codebase)
  └─ "Copy" button per block
  └─ Source citation: "Generated from [doc URL] · Docs as of [date]"
  └─ "Start over" button → back to Step 1
```

---

## Lambda: Doc Crawler

**Location:** `lambda/guardrail-doc-crawler/index.ts`

- Triggered by EventBridge schedule: weekly (Sunday 02:00 UTC).
- Iterates `DOC_TARGETS`, fetches each URL, chunks content, embeds via Titan v2, upserts `PlatformDocChunk`.
- Detects changes via `contentHash` — skips re-embedding if unchanged.
- On change: sets `updatedAt`, calls `markConfigsStale(platform, docUrl)` to set `configGeneratedAt = null` on affected `GuardrailRecommendationRecord` rows.
- Logs crawl summary (URLs checked, updated, skipped) — **no doc content in logs**.

**Terraform:** `infra/terraform/guardrail-rag.tf`
- EventBridge rule + Lambda target
- IAM: Bedrock `InvokeModel` for Titan Embeddings, RDS access

---

## Testing Requirements (TDD)

Write tests before implementation. Run with `npm test`.

### Unit tests

| File | Tests |
|------|-------|
| `src/guardrail/engine.test.ts` | Returns REQUIRED guardrails for banking:customer-support; filters by jurisdiction (EU adds GDPR entries); orders REQUIRED before RECOMMENDED |
| `src/guardrail/clarifier.test.ts` | Generates 3–5 questions; question types are valid enum values; mocks Bedrock call |
| `src/rag/chunker.test.ts` | Chunks 2000-word doc into ≤512-token segments; preserves code blocks intact; overlap = ~50 tokens |
| `src/rag/retriever.test.ts` | Returns top-5 chunks ordered by similarity; filters by platform; handles empty vector store gracefully |

### Integration tests

| File | Tests |
|------|-------|
| `src/api/routes/guardrail-advisor.test.ts` | POST /sessions returns sessionId + questions; POST /recommend returns grouped recommendations; POST /format returns config with sourceDocUrls; GET /domains returns all 6 domains |

### E2E (manual checklist, not automated in Phase 1)

- [ ] Full flow: domain → questions → recommendations → Bedrock YAML config
- [ ] Copy button copies correct config to clipboard
- [ ] "Docs as of" date reflects latest crawl timestamp
- [ ] Stale config shows warning after doc crawler updates source

---

## File Checklist

```
src/
  guardrail/
    domain-taxonomy.json
    guardrail-knowledge.json
    engine.ts
    engine.test.ts
    clarifier.ts
    clarifier.test.ts
    types.ts
  rag/
    crawler.ts
    embedder.ts
    retriever.ts
    retriever.test.ts
    formatter.ts
    chunker.ts
    chunker.test.ts
    doc-targets.ts
  api/routes/
    guardrail-advisor.ts
    guardrail-advisor.test.ts
  ui/pages/
    GuardrailAdvisorPage.tsx

lambda/
  guardrail-doc-crawler/
    index.ts

infra/terraform/
  guardrail-rag.tf

prisma/
  schema.prisma    ← add PlatformDocChunk, GuardrailAdvisorSession,
                      GuardrailRecommendationRecord models
```

---

## Out of Scope (Phase 1)

- Compliance team catalog / pre-approved artifact library (Phase 3)
- Post-evaluation guardrail suggestions (Phase 2)
- User roles / compliance reviewer persona (Phase 3)
- Review & approval workflow (Phase 4)
- Versioned catalog entries (Phase 3)
- Export to PDF / shareable link (Phase 2)
- More than 6 domains or 5 platforms (add iteratively post-launch)
