# CLAUDE.md — ARIA Evaluator

AI safety & quality evaluation platform: tests conversational AI agents (Connect, Lex, Azure, OpenAPI…), runs scenarios, scores transcripts across 15 dimensions via an LLM judge (Bedrock/Claude), checks security + compliance.

**Stack:** TypeScript · Express · React (Vite + Tailwind) · Prisma · SQLite (dev) / PostgreSQL (prod) · AWS (Bedrock, Connect, Lex, ECS, Terraform).

**Data flow:** Scenario (YAML) → Adapter → Conversation runner → Transcript → LLM Judge → EvalResult → Reports/Dashboard.

📖 **Full architecture, directory map, and how-to guides live in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).** Read it before adding adapters, dimensions, routes, or pages.

## Rules

**Judge** (`src/judge/`)
- Security scenarios (`attack_type != null`): score on **GUARDRAIL_COMPLIANCE only**.
- Quality scenarios: all non-security dimensions, equal weight by default.
- Overall = weighted average of active dimensions; pass = `overall_score ≥ 0.7` (configurable).

**Conversation** (`src/conversation/`)
- Always call `applyTemplateVars()` before passing a scenario to the runner.
- Mode `script` = YAML turns; mode `agent` = Claude-generated turns.
- **Transcripts are immutable once saved.** Never modify them.

**Adapters** (`src/adapters/`)
- Implement `BaseAdapter` (`connect`→`sendMessage`→`receive`→`disconnect`); return `AdapterMessage`; throw `SessionEndedError` on close; return `null` on timeout.
- Register new providers in `src/conversation/runner.ts` (`normalizeProvider()`).

**API** (`src/api/`)
- `requireAuth` on protected routes; `checkRunQuota()` before queuing a run.
- Audit every mutation with `recordAuditEventSafe()`.
- 404 if not found, 400 on invalid input; stream progress via `registerSseClient(runId, res)`.

**Security**
- Sanitize scenario names (alphanumeric + dashes); reject path traversal (`..`, leading `/`).
- Validate API input with Zod (`shared/`). Never log transcripts to stdout (PII).

**DB:** edit `prisma/schema.prisma` → `npm run db:migrate`.

## Workflow

- For codebase-wide searches or changes spanning `src/`, `infra/terraform/`, `website/`, `lambda/`, use an **Explore/general-purpose subagent** rather than reading files inline.
- Commit messages: **Conventional Commits** (`feat:`/`fix:`/`refactor:`/`chore:`). Never commit with "Save uncommitted changes".
- Use Plan mode before large or infra changes.

## Releases

The public website shows a dismissible "aria-evaluator vX.Y.Z is now available" banner (`website/src/components/shared/VersionBanner.tsx`) that reads the repo's **GitHub Releases API** client-side at runtime — the website never needs a rebuild/redeploy for a new evaluator release. This is why publishing a release is a required step after merging evaluator changes to `main`, not optional bookkeeping:

- **After merging one or more evaluator PRs to `main`** (anything under `src/`, `prisma/`, root `package.json` — not `website/`-only changes), cut a release:
  ```bash
  npm version <patch|minor|major> -m "chore(release): %s"   # bumps package.json, commits, tags
  git push --follow-tags
  gh release create "$(git describe --tags --abbrev=0)" --generate-notes
  ```
- **Bump choice** follows semver from the merged changes: `patch` for fixes only, `minor` for backward-compatible new features (the common case), `major` for breaking changes (API/schema/CLI-flag removals, incompatible behavior changes).
- Website-only changes don't need a release — the banner tracks the evaluator's version, not the website's.
- If the website's CSP (`website/next.config.ts` **and** the duplicate in `infra/terraform/modules/website-frontend/main.tf` — keep both in sync) ever needs a new `connect-src` origin for this feature, that's a one-time infra deploy, not a per-release one.

## Commands

```bash
npm run dev          # API + UI (http://localhost:3001)
npm run lint         # tsc --noEmit
npm run build        # build API + UI
npm run db:migrate   # migrate from schema changes
npm run db:generate  # regenerate Prisma client
npm run cli:connect -- --scenario=...   # also: cli:lex, cli:azure, cli:openapi, cli:custom
```
