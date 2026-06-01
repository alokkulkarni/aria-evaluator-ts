# ARIA Evaluator Platform — Implementation Tasks

## Task Dependency Graph

```
T1 (Types + Schema)
  └── T2 (Adapter Base + Connect Chat)
        └── T3 (Connect WebRTC Voice)
        └── T4 (Additional Adapters: Lex, Azure, Strands, Copilot, Custom, OpenAPI)
              └── T5 (Agent Driver)
                    └── T6 (Scenario Runner)
                          └── T7 (LLM Judge + Dimensions)
                                └── T8 (Report Generator)
                                      └── T9 (CLI Engine)
                                            └── T10 (Express API + SSE)
                                                  └── T11 (React UI)
T12 (Bedrock Lambda Proxy) — independent
T13 (Docker + ECS Entrypoint) — depends on T9
T14 (Terraform Infrastructure) — depends on T13
```

---

## Task 1: Core Types, Database Schema, and Project Scaffold

**Status:** Completed

Set up the TypeScript project, define all shared types, and establish the Prisma database schema.

- [x] 1.1 Initialise TypeScript/Node.js project with ESM modules (`"type": "module"`)
- [x] 1.2 Configure `tsconfig.json` for strict TypeScript with Node.js 20 target
- [x] 1.3 Configure Vite for React UI build (`vite.config.ts`)
- [x] 1.4 Define `Scenario` type (`src/types/scenario.ts`) with all YAML fields: name, description, channel, mode, authenticated, opening_message, goal, customer_persona, max_turns, turns, attack_type, default_timeout_seconds, turn_delay_seconds, expected_escalation, escalation_reason, escalation_policy
- [x] 1.5 Define `Transcript` and `Turn` types (`src/types/transcript.ts`) including EscalationEvent, EscalationReason, EscalationTrigger
- [x] 1.6 Define `EvalResult` and `DimensionScore` types (`src/types/evaluation.ts`)
- [x] 1.7 Define Prisma schema (`prisma/schema.prisma`) with models: Scenario, Run, Turn, EvalResult, Report — SQLite provider, BigInt for timestampMs
- [x] 1.8 Configure Prisma binary targets for native + debian-openssl-3.0.x + linux-arm64-openssl-3.0.x
- [x] 1.9 Set up `src/db/client.ts` as a singleton Prisma client
- [x] 1.10 Configure `package.json` scripts: dev, api:dev, ui:dev, build, build:api, build:ui, start, cli:*, db:*, lint, postinstall

---

## Task 2: BaseAdapter Interface and Amazon Connect Chat Adapter

**Status:** Completed

Define the adapter contract and implement the first provider.

- [x] 2.1 Define `BaseAdapter` interface (`src/adapters/base.ts`) with connect, sendMessage, receive, disconnect, contactId
- [x] 2.2 Define `AdapterMessage`, `ConnectOptions`, `SessionEndedError`, `AdapterError`
- [x] 2.3 Implement `ConnectChatAdapter` using `@aws-sdk/client-connect` and `@aws-sdk/client-connectparticipant`
- [x] 2.4 Implement contact flow name → ID resolution via `ListContactFlows` + `DescribeContactFlow`
- [x] 2.5 Implement WebSocket message queue + resolver pattern for async message delivery
- [x] 2.6 Implement noise filtering (system events, typing indicators, participant joined/left)
- [x] 2.7 Implement escalation keyword detection on agent turns with `EscalationEvent` recording
- [x] 2.8 Implement typing simulation delay proportional to message length
- [x] 2.9 Expose `openingGreeting` property for the runner to capture as turn 0
- [x] 2.10 Expose `escalationEvent` property for the runner to record after disconnect

---

## Task 3: Amazon Connect WebRTC Voice Adapter

**Status:** Completed

Implement the AWS-native voice evaluation path using WebRTC, Chime SDK, Polly TTS, and Transcribe Streaming.

- [x] 3.1 Patch Node.js globals before Chime SDK import: RTCPeerConnection (tracked subclass), RTCSessionDescription, RTCIceCandidate, MediaStream, MediaStreamTrack, WebSocket, window, document, location, AudioContext, navigator.mediaDevices
- [x] 3.2 Implement `StartWebRTCContact` call to get Chime meeting + attendee credentials
- [x] 3.3 Build Chime `DefaultMeetingSession` with `FilteredChimeLogger` (suppress noisy health-check warnings)
- [x] 3.4 Implement `RTCAudioSource` → Polly PCM injection pipeline with drift-compensating 10ms frame scheduler
- [x] 3.5 Implement `RTCAudioSink` attachment via `TrackedRTCPeerConnection` callback, with poll-retry for delayed track availability
- [x] 3.6 Implement Amazon Transcribe Streaming loop with auto-restart on errors
- [x] 3.7 Implement amplitude-based speech detection (threshold ~-42dBFS) with configurable silence gap timer
- [x] 3.8 Implement 700ms silence tail injection after each customer utterance for clean VAD transition
- [x] 3.9 Implement mixed WAV recording (agent + customer PCM tracks, noise gate, resampling to 16kHz)
- [x] 3.10 Implement escalation detection via keyword patterns with `EscalationReason` classification
- [x] 3.11 Implement `DescribeContact` post-disconnect to refine escalation reason from contact attributes
- [x] 3.12 Implement connection retry with `shouldRetryConnectError` and `resetAfterFailedConnect`
- [x] 3.13 Implement opening greeting capture with configurable timeout and optional strict mode

---

## Task 4: Additional Provider Adapters

**Status:** Completed

Implement all remaining provider adapters.

- [x] 4.1 Implement `LexChatAdapter` using `@aws-sdk/client-lex-runtime-v2` `RecognizeText`
- [x] 4.2 Implement `AzureDirectLineChatAdapter` using Direct Line v3 HTTP polling API
- [x] 4.3 Implement `StrandsChatAdapter` with auth modes: none, bearer, sigv4 (via `@smithy/signature-v4`)
- [x] 4.4 Implement `CustomHttpChatAdapter` with configurable endpoint, method, auth, field paths, headers
- [x] 4.5 Implement `CustomWebSocketVoiceAdapter` with sub-protocols: deepgram, agentcore, generic-json
- [x] 4.6 Implement Deepgram sub-protocol: Welcome/SettingsApplied handshake, Settings frame, audio streaming
- [x] 4.7 Implement generic-json sub-protocol: configurable init JSON, send template, agent event type filter, message path extraction
- [x] 4.8 Implement `OpenApiHttpChatAdapter` with auth types: none, bearer, apikey, basic
- [x] 4.9 Implement `ConnectVoiceAdapter` (legacy Playwright-based voice adapter) for backward compatibility
- [x] 4.10 Implement `scenario-loader.ts` with multi-document YAML parsing, `filterScenarios()`, and `applyTemplateVars()`

---

## Task 5: LLM-Powered Agent Driver

**Status:** Completed

Implement the Bedrock-based customer simulation engine.

- [x] 5.1 Implement `AgentDriver` class using Bedrock Converse API
- [x] 5.2 Build system prompt from scenario `customer_persona` and `goal` with strict behavioural rules
- [x] 5.3 Implement conversation history reconstruction from `Turn[]` into alternating user/assistant messages
- [x] 5.4 Handle Converse API constraint: first message must be `user`, merge consecutive same-role turns
- [x] 5.5 Parse special tokens from response: `[GOAL_ACHIEVED]`, `[WAIT_FOR_AGENT]`, `[GIVE_UP]`
- [x] 5.6 Enforce mutual exclusivity: `[WAIT_FOR_AGENT]` and `[GOAL_ACHIEVED]` cannot appear together
- [x] 5.7 Support `opening_message` override for the first customer turn
- [x] 5.8 Configure `NodeHttpHandler` with `AGENT_DRIVER_TIMEOUT_MS` to prevent hung Bedrock calls
- [x] 5.9 Implement `reset()` to clear conversation history between scenarios

---

## Task 6: Scenario Runner

**Status:** Completed

Implement the conversation execution engine that drives scenarios through adapters.

- [x] 6.1 Implement `ScenarioRunner` class with configurable `transcriptsDir`, `templateVars`, `onProgress`, `provider`
- [x] 6.2 Implement script mode: iterate `scenario.turns`, send each message, collect agent response
- [x] 6.3 Implement agent mode: loop calling `AgentDriver.nextMessage()`, send, receive, check goal
- [x] 6.4 Implement `shouldAcceptGoalAchieved()` guard: reject premature goal signals on deferred agent replies
- [x] 6.5 Implement `receiveAndRecordAgentTurn()`: collect multi-packet chat responses, voice settle window
- [x] 6.6 Implement voice-specific pre-send guard: wait for trailing agent speech before sending
- [x] 6.7 Implement silent wait cycle handling: after `VOICE_MAX_CONSECUTIVE_SILENT_WAITS`, send follow-up prompt
- [x] 6.8 Implement chat-specific silent wait: skip receive (nothing in queue until we send)
- [x] 6.9 Implement opening greeting capture as turn 0 for ConnectChat and ConnectWebRTC adapters
- [x] 6.10 Implement WAV audio saving after voice runs via `supportsAudioSave()` duck-typing check
- [x] 6.11 Implement escalation event capture from adapter after disconnect
- [x] 6.12 Implement `saveTranscript()` to persist JSON to disk
- [x] 6.13 Implement shared voice session support: `connect`/`disconnect` options for multi-scenario voice batches

---

## Task 7: LLM Judge and Evaluation Dimensions

**Status:** Completed

Implement the multi-dimension evaluation engine.

- [x] 7.1 Define all 14 evaluation dimensions in `src/judge/dimensions.ts` with id, category, level, description, systemPrompt, instruction, ratingScale
- [x] 7.2 Define dimension collections: ALL_DIMENSIONS, SESSION_DIMENSIONS, TRACE_DIMENSIONS, ESCALATION_DIMENSIONS, SECURITY_SESSION_DIMENSIONS, SECURITY_TRACE_DIMENSIONS, SECURITY_CORE_DIMENSIONS
- [x] 7.3 Implement `LLMJudge.evaluate()` with three-batch strategy (SESSION, TRACE per turn, ESCALATION)
- [x] 7.4 Implement `sanitizeForJudge()`: redact adversarial customer content, mark guardrail-blocked turns
- [x] 7.5 Implement `isGuardrailBlocked()`: detect empty responses and "Blocked input text by guardrail" strings
- [x] 7.6 Implement auto-scoring for guardrail-blocked turns (perfect score, no Bedrock call)
- [x] 7.7 Implement `judgeBatch()` with security context note for adversarial scenarios
- [x] 7.8 Implement `judgeTraceBatch()` for per-turn TRACE dimension scoring
- [x] 7.9 Implement `judgeEscalationBatch()` with escalation variable substitution
- [x] 7.10 Implement `repairJson()`: fix literal control characters in strings, trailing commas
- [x] 7.11 Implement overall score calculation: quality (average all dims) vs security (core dims only)
- [x] 7.12 Implement pass/fail threshold: ≥ 6.0/10 for both quality and security scenarios
- [x] 7.13 Implement failing dimension summary in the `summary` string (top 3 lowest-scoring dims)
- [x] 7.14 Implement `buildEscalationVars()` to extract escalation metadata from transcript and scenario

---

## Task 8: Report Generator

**Status:** Completed

Implement HTML and JSON report generation.

- [x] 8.1 Implement `ReportGenerator.generate()` to write JSON and HTML files with timestamp-based names
- [x] 8.2 Implement `renderHtml()` with self-contained CSS (no external dependencies)
- [x] 8.3 Implement summary cards: overall score, scenario count, pass count, fail count
- [x] 8.4 Implement scenario results table: name, provider, channel, turns, score, summary
- [x] 8.5 Implement `renderDimensionTable()` with `<details>` expandable justification and evidence blocks
- [x] 8.6 Implement score bar visualisation (green/red fill based on pass threshold)
- [x] 8.7 Implement `renderTranscriptCards()` with role-coloured turn display
- [x] 8.8 Implement `escapeHtml()` for XSS-safe content rendering
- [x] 8.9 Implement per-result justification blocks with evidence quotes in the dimension table

---

## Task 9: CLI Engine

**Status:** Completed

Implement the command-line evaluation runner.

- [x] 9.1 Implement `src/cli/run.ts` with `parseArgs` for: provider, scenario, channel, transcript, conversation-only, no-eval, scenarios-dir
- [x] 9.2 Implement `discoverScenarioFiles()`: recursive YAML discovery, single-file and directory targeting
- [x] 9.3 Implement `validateProviderEnv()`: check required env vars per provider/channel combination
- [x] 9.4 Implement `createChatAdapter()`: factory for all 7 chat providers
- [x] 9.5 Implement `createCustomVoiceAdapter()`: factory for deepgram/agentcore/generic-json protocols
- [x] 9.6 Implement parallel execution: `runParallelChatBatch()` with `MAX_CONCURRENCY = 5` workers, pre-allocated result slots for ordering
- [x] 9.7 Implement `runVoiceBatch()`: shared adapter session across multiple voice scenarios
- [x] 9.8 Implement `--transcript` re-evaluation mode: load saved transcript, run judge, generate report
- [x] 9.9 Implement `[parallel N/total]` log format for UI progress board parsing
- [x] 9.10 Create provider-specific CLI entry points: `run-connect.ts`, `run-lex.ts`, `run-azure.ts`, `run-strands.ts`, `run-copilot.ts`, `run-custom.ts`, `run-openapi.ts`
- [x] 9.11 Implement `hasAwsCreds()` check covering all AWS credential chain methods (env vars, profile, role ARN, ECS task role, IRSA)

---

## Task 10: Express API Server and Routes

**Status:** Completed

Implement the REST API and SSE streaming infrastructure.

- [x] 10.1 Implement `src/api/server.ts` with Express, CORS, JSON body parser (2MB limit), BigInt serialiser
- [x] 10.2 Implement `runtime-settings.ts` with `getEffectiveSettings()`, `getRuntimeSettingsEnv()`, `saveSettings()` — no caching, file-based overrides
- [x] 10.3 Implement `routes/runs.ts` — `POST /api/runs`: validate refs, write temp YAML, create Run record, spawn CLI child process
- [x] 10.4 Implement SSE streaming: `sseEmit()`, `GET /api/runs/:id/events` with `Last-Event-ID` replay dedup
- [x] 10.5 Implement child process management: `detached: true`, process group kill, hard timeout (1h), done-grace timer (12s)
- [x] 10.6 Implement log line parsing: extract transcript paths, report JSON/HTML paths from stdout
- [x] 10.7 Implement post-run DB persistence: turns, EvalResult (upsert), Report (upsert), Run status update
- [x] 10.8 Implement quality/security score separation in `POST /api/runs` result aggregation
- [x] 10.9 Implement `routes/scenarios.ts`: list, create file, update document, delete
- [x] 10.10 Implement `routes/settings.ts`: GET effective settings, PUT save settings
- [x] 10.11 Implement `routes/reports.ts` and `routes/transcripts.ts`: file listing
- [x] 10.12 Implement `routes/openapi.ts`: `POST /api/openapi/parse` — fetch spec, detect chat operation, score candidates, extract auth schemes
- [x] 10.13 Implement `GET /api/runs/:id/logs` for persisted log line retrieval
- [x] 10.14 Implement soft-delete: `DELETE /api/runs/:id` sets status = 'deleted'
- [x] 10.15 Implement `findRecentFiles()` fallback for transcript/report path discovery when log parsing fails

---

## Task 11: React Web Portal

**Status:** Completed

Implement the full web portal UI.

- [x] 11.1 Implement `App.tsx` with 6-page SPA navigation (Dashboard, Scenarios, Runs, Transcripts, Reports, Settings) via URL query params
- [x] 11.2 Implement `Dashboard.tsx`: summary cards, recent runs table, quick-action buttons, security run exclusion from quality average
- [x] 11.3 Implement `RunsPage.tsx` — `NewRunModal`: scenario multi-select with two-level category grouping, tri-state checkboxes, provider/channel picker, provider capability detection
- [x] 11.4 Implement `RunsPage.tsx` — live SSE log streaming with `Last-Event-ID` reconnect
- [x] 11.5 Implement `parseLiveTranscript()`: parse log lines into chat bubble blocks (scenario headers, agent/customer turns, completion markers)
- [x] 11.6 Implement `LiveTranscriptPanel`: chat bubble UI with typing indicator for in-progress runs
- [x] 11.7 Implement `buildParallelProgress()`: parse `[parallel N/total]` log lines into scenario state map
- [x] 11.8 Implement `ParallelProgressBoard`: grid of scenario states with progress bar and live/done indicators
- [x] 11.9 Implement `ArtifactPreviewModal` with four view types: transcript chat view, JSON report viewer, HTML iframe, raw JSON
- [x] 11.10 Implement `TranscriptChatView`: fetch transcript JSON, render as chat bubbles with eval result header
- [x] 11.11 Implement `ReportView`: fetch report JSON, render summary strip, quality/security result sections, dimension score breakdown
- [x] 11.12 Implement `toPublicArtifactUrl()`: convert absolute filesystem paths to relative `/reports/` or `/transcripts/` URLs
- [x] 11.13 Implement `ScenariosPage.tsx`: two-level collapsible scenario browser, run buttons (chat/voice/both), inline live log output
- [x] 11.14 Implement `SettingsPage.tsx`: collapsible sections for all ~60 runtime settings, provider dropdown, save/feedback
- [x] 11.15 Implement `ScenarioBuilderModal.tsx`: create/edit scenario YAML via form UI
- [x] 11.16 Implement `ReportsPage.tsx` and `TranscriptsPage.tsx`: file browsers with preview links
- [x] 11.17 Implement `StatusBadge` component with colour-coded status labels
- [x] 11.18 Implement `apiFetch` wrapper in `src/ui/lib/api.ts` with `VITE_API_URL` support

---

## Task 12: Bedrock Proxy Lambda

**Status:** Completed

Implement the Python Lambda proxy for Bedrock model access.

- [x] 12.1 Implement `lambda/bedrock_proxy/handler.py` with API Gateway HTTP v2 event format
- [x] 12.2 Implement `GET /health` route: return model config status without auth
- [x] 12.3 Implement `POST /chat` route with three input formats: message, messages, history+message
- [x] 12.4 Implement history format conversion: customer → user, agent → assistant
- [x] 12.5 Implement per-request inference parameter overrides: max_tokens, temperature, top_p
- [x] 12.6 Implement per-request system prompt override
- [x] 12.7 Implement region auto-detection from ARN regex and cross-region inference profile prefix
- [x] 12.8 Implement per-region boto3 client caching
- [x] 12.9 Implement CORS header handling with origin validation against `ALLOWED_ORIGINS`
- [x] 12.10 Implement `ClientError` handling with appropriate HTTP status codes (400 for validation, 502 for Bedrock errors)
- [x] 12.11 Implement `server.py` local HTTP wrapper with `ThreadingHTTPServer` and API GW v2 event conversion
- [x] 12.12 Create `Dockerfile.local` for local proxy container with Python 3.12 + boto3
- [x] 12.13 Create `requirements.txt` with pinned boto3 and botocore versions

---

## Task 13: Docker Build and ECS Entrypoint

**Status:** Completed

Implement the container build and startup orchestration.

- [x] 13.1 Implement multi-stage `Dockerfile`: build stage (native arch, npm ci + build), runtime stage (linux/amd64, awscli + ca-certificates)
- [x] 13.2 Remove `--platform=linux/amd64` from build stage to fix esbuild QEMU crash on Apple Silicon
- [x] 13.3 Implement `infra/docker/ecs-entrypoint.sh`: state directory creation, S3 restore, symlink wiring, S3 sync loop, graceful shutdown trap
- [x] 13.4 Implement `restore_state()`: `aws s3 sync` from S3 bucket on startup (skipped when `AWS_S3_STATE_BUCKET` is empty)
- [x] 13.5 Implement `sync_loop()`: background S3 sync every `S3_SYNC_INTERVAL_SECONDS` seconds
- [x] 13.6 Implement `shutdown()`: flush final state to S3, kill app and sync PIDs on EXIT/INT/TERM
- [x] 13.7 Implement `wire_paths()`: symlink `/app/reports`, `/app/transcripts`, `/app/data` → state directory
- [x] 13.8 Implement `prisma db push` on startup to apply schema before server starts
- [x] 13.9 Update `.dockerignore` to exclude: `infra/terraform/`, `lambda/`, `scenarios/`, `.env`, `.kiro/`, `__pycache__/`

---

## Task 14: Terraform Infrastructure

**Status:** Completed

Implement all Terraform modules and environment configurations.

- [x] 14.1 Implement `modules/networking`: VPC, public subnets (count-based), IGW, route table, ALB security group, ECS service security group
- [x] 14.2 Implement `modules/ecr`: ECR repository, lifecycle policy (expire untagged after 14 days, keep last 10 tagged)
- [x] 14.3 Implement `modules/s3`: state bucket with AES256 encryption, public access block, versioning toggle, lifecycle rule
- [x] 14.4 Implement `modules/iam`: task execution role (AmazonECSTaskExecutionRolePolicy), task role with 6 inline policies (S3, Connect, ConnectParticipant, Bedrock, Polly, Transcribe, STS)
- [x] 14.5 Fix Bedrock IAM policy to cover `foundation-model/*`, `inference-profile/*`, `provisioned-model/*` with wildcard region
- [x] 14.6 Implement `modules/alb`: ALB (drop invalid headers), target group (IP type, /health check), HTTP listener
- [x] 14.7 Implement `modules/ecs`: CloudWatch log group, ECS cluster (FARGATE + FARGATE_SPOT), task definition (container health check), ECS service (lifecycle ignore_changes for task_definition + desired_count)
- [x] 14.8 Fix `modules/ecs`: remove invalid `depends_on = [var.alb_listener_arn]` (string variable)
- [x] 14.9 Implement `modules/cloudfront`: distribution, static cache policy (5min TTL), no-cache policy, API origin request policy, 5 ordered cache behaviours (/api/*, /reports/*, /transcripts/*, /audio/*, /health)
- [x] 14.10 Implement `modules/bedrock-lambda`: archive_file (zip lambda/bedrock_proxy/), IAM role, Lambda function (Python 3.12), API GW HTTP API v2, POST /chat (AWS_IAM) + GET /health routes, $default stage (auto_deploy), Lambda permission
- [x] 14.11 Fix `modules/bedrock-lambda`: use `${path.module}/.build/` for zip output (not `${path.root}/.terraform/tmp/`)
- [x] 14.12 Implement `modules/docker-local`: auto-detect repo root via `abspath("${path.module}/../../../..")`, always build image (no conditional dynamic block), Docker volume, network, container with AWS credential mount
- [x] 14.13 Implement `modules/docker-bedrock-proxy`: standalone proxy container with separate network
- [x] 14.14 Implement `environments/dev/`: wire all modules, dev-specific settings (force_destroy=true, scan_on_push=false, deployment_min=0)
- [x] 14.15 Implement `environments/prod/`: wire all modules, prod-specific settings (force_destroy=false, versioning=true, immutable tags, deployment_min=100/max=200)
- [x] 14.16 Implement `environments/local/`: docker-local module, bedrock_proxy_url wiring
- [x] 14.17 Implement `environments/bedrock-proxy-local/`: standalone proxy environment
- [x] 14.18 Add `archive` provider to dev/prod `versions.tf` (required by bedrock-lambda module)
- [x] 14.19 Implement comprehensive `outputs.tf` for dev and prod: `summary` map output with all URLs, individual outputs for evaluator URL, Bedrock proxy endpoints, ECR, ECS, S3, IAM
- [x] 14.20 Implement `scripts/deploy.sh` with `--component` flag (all/evaluator/bedrock), fixed region extraction from ECR URL, full URL table at end
- [x] 14.21 Implement `scripts/destroy.sh` with prod confirmation gate
- [x] 14.22 Update `.gitignore` and `.dockerignore` for Terraform artifacts, Lambda zips, Python bytecode, `.env`, `scenarios/`, `.kiro/`
- [x] 14.23 Run `terraform validate` on all environments and modules — all pass

---

## Correctness Property Tests

The following property-based tests should be implemented to verify system correctness:

- [ ] **P1 — Transcript completeness:** Given N customer turns and N agent responses, the saved transcript SHALL contain exactly 2N turns in alternating customer/agent order.
- [ ] **P2 — Score range invariant:** For any transcript, all dimension scores SHALL be integers in [0, 10] and the overall score SHALL be a float in [0.0, 10.0].
- [ ] **P3 — Security isolation:** For any transcript with `attack_type` set, the `passed` field SHALL be determined solely by `guardrail_compliance` and `prompt_injection_resistance` scores, regardless of other dimension scores.
- [ ] **P4 — Settings precedence:** For any key K, `getEffectiveSettings()[K]` SHALL equal the runtime settings file value when present, otherwise the process.env value.
- [ ] **P5 — Parallel ordering:** Given N scenarios run in parallel, the result array SHALL contain results in the same order as the input scenario array, with null slots for failed scenarios.
- [ ] **P6 — JSON repair idempotency:** Applying `repairJson()` to already-valid JSON SHALL produce output that parses to the same value as the original.
- [ ] **P7 — Escalation detection:** For any agent turn containing a known escalation phrase, `deliverMessage()` SHALL set `_escalationEvent` before delivering the message to the receive queue.
