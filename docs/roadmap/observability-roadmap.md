# ARIA Evaluator — Observability Roadmap

> Status: Living document · Last updated: June 2026

## Current Capabilities (Implemented ✅)

### Metrics & Analytics
- **Token tracking** — scenario tokens (chars/4 estimate) + judge tokens (Bedrock actual) per run
- **Cost estimation** — judge LLM cost calculated from model pricing registry (15 models supported)
- **Latency monitoring** — per-run latency with avg and P95 aggregation
- **Failure classification** — automatic categorisation (timeout, auth, network, validation, unknown)
- **Provider breakdown** — per-provider run counts, failure rates, token usage
- **Quality trends** — 30-day time-series of scores, pass rates, costs (daily or hourly buckets)
- **Dimension analytics** — per-dimension avg scores and pass rates with weakest/strongest insights
- **Security attack metrics** — attack category distribution with severity breakdown

### Dashboard
- Real-time observability card with fail rate, latency, cost
- Score trend sparkline (30-day)
- Safety dimension strength/weakness bars
- Release readiness KPIs (attack block rate, quality score, completion rate)

### APIs
- `GET /api/metrics?hours=N` — aggregated observability totals
- `GET /api/metrics/trends?days=N&bucket=day|hour` — quality time-series
- `GET /api/metrics/dimensions?hours=N` — per-dimension analytics
- `GET /api/health` — system health (DB, jobs, scheduler, process)
- `GET /api/runs/failures/summary` — failure cluster analysis

---

## Phase 1 — Enhanced Observability (Q3 2026)

### OpenTelemetry Integration
- [ ] Add OpenTelemetry SDK to control plane
- [ ] Instrument run executor with spans: `run.start` → `scenario.load` → `agent.call` → `judge.evaluate` → `run.complete`
- [ ] Capture span attributes: model ID, token counts, latency, region, error class
- [ ] Export traces to OTLP-compatible backends (Jaeger, Grafana Tempo, AWS X-Ray)
- [ ] Add trace ID correlation to run logs and eval results

### Cost Tracking Enhancements
- [ ] Track scenario/provider costs when model identity is available (e.g. via agent endpoint metadata)
- [ ] Add cost budgets and alerts (monthly budget, per-run cap)
- [ ] Cost attribution by scenario category, provider, and team
- [ ] Historical cost trends with month-over-month comparison

### Quality Drift Detection
- [ ] Establish baseline scores per scenario over configurable window
- [ ] Detect statistically significant score regressions (z-score or control chart)
- [ ] Auto-flag runs where score dropped > 2 standard deviations from baseline
- [ ] Dashboard "drift alerts" card with affected scenarios

---

## Phase 2 — Production Monitoring (Q4 2026)

### Production Sidecar Mode
- [ ] Run ARIA as a transparent proxy/sidecar that monitors live agent traffic
- [ ] Passive scoring: sample N% of production conversations for quality evaluation
- [ ] No added latency — evaluation happens asynchronously post-response
- [ ] Dashboard toggle: "Eval Mode" vs "Production Mode"
- [ ] Production vs eval metrics separated in dashboards

### Alerting & Notifications
- [ ] Slack integration for quality alerts, drift detection, cost thresholds
- [ ] PagerDuty/OpsGenie integration for critical security failures
- [ ] Email digest — weekly quality summary and trend report
- [ ] Webhook support for custom integrations
- [ ] Alert rules engine: condition → channel → severity → cooldown

### Prompt & Judge Versioning
- [ ] Track judge prompt versions with change history
- [ ] Version tagging on eval results (`judgePromptVersion`, `judgeConfigVersion`)
- [ ] Trend annotations showing when prompt/model changes occurred
- [ ] A/B comparison of eval results across judge versions

---

## Phase 3 — Enterprise Analytics (2027)

### Advanced Analytics
- [ ] Provider A/B testing — compare model performance across same scenarios
- [ ] Scenario effectiveness scoring — which scenarios best differentiate good/bad agents
- [ ] Cohort analysis — track quality improvements over release cycles
- [ ] Custom dashboards with drag-and-drop metric widgets
- [ ] Data export to BI tools (CSV, API, S3 sink)

### Compliance Reporting
- [ ] Auto-generated model risk validation reports (quantitative + qualitative)
- [ ] Audit trail with immutable scoring records
- [ ] SOC 2 evidence generation from run metrics
- [ ] EU AI Act conformity assessment integration
- [ ] Scheduled compliance snapshot generation

### Multi-Tenant Observability
- [ ] Per-team/workspace metric isolation
- [ ] Role-based dashboard access (viewer, editor, admin)
- [ ] Cross-team benchmark comparisons (opt-in)
- [ ] Usage quotas and cost allocation by team

---

## Architecture Notes

### Token Estimation
Current approach uses `text.length / 4` heuristic for scenario tokens. Judge tokens are actual values from Bedrock Converse API responses. Long-term plan:
1. Use tiktoken/tokenizer libraries for accurate pre-call estimates
2. Capture actual usage from all provider APIs where available
3. Flag estimated vs actual in all UIs and APIs

### Cost Model
Pricing data is maintained in `src/lib/model-pricing.ts` with a `PRICING_VERSION` field for auditability. Cost estimates are nullable — when model is unknown, cost is `null`, not `0`. The API returns `judgeCostKnownCount` and `judgeCostUnknownCount` for transparency.

### Time Bucketing
All trend endpoints use UTC. `completedAt` (not `createdAt`) is used for time windowing to ensure accurate temporal placement. Indexes exist on both `createdAt` and `completedAt` for query performance.
