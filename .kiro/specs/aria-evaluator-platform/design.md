# ARIA Evaluator Platform — Technical Design

## Overview

ARIA Evaluator is a TypeScript/Node.js monorepo that combines a React web portal, an Express REST API, a CLI evaluation engine, and a Python Lambda proxy into a single deployable unit. It evaluates AI contact-centre agents by simulating realistic customer conversations and scoring them with an LLM judge.

The system runs in two deployment modes sharing the same application image:
- **Local Docker** — single container with a named volume for state
- **AWS ECS Fargate** — container behind ALB + CloudFront with S3 state synchronisation

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  React UI (Vite + Tailwind CSS)                                     │
│  Dashboard · Scenarios · Runs · Transcripts · Reports · Settings    │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ HTTP REST + Server-Sent Events
┌──────────────────────────▼──────────────────────────────────────────┐
│  Express API  (src/api/server.ts — port 3001)                       │
│  ├── /api/scenarios   YAML file CRUD                                │
│  ├── /api/runs        Run lifecycle + SSE streaming                 │
│  ├── /api/transcripts Transcript file listing                       │
│  ├── /api/reports     Report file listing                           │
│  ├── /api/settings    Runtime settings CRUD                         │
│  └── /api/openapi     OpenAPI spec parsing                          │
│  Static: /reports, /transcripts, /audio, /dist/ui                  │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ child_process.spawn
┌──────────────────────────▼──────────────────────────────────────────┐
│  CLI Engine  (src/cli/run.ts)                                       │
│  ├── ScenarioRunner  — drives one scenario through an adapter       │
│  ├── AgentDriver     — Bedrock Converse customer simulation         │
│  ├── LLMJudge        — Bedrock Converse multi-dimension scoring     │
│  └── ReportGenerator — HTML + JSON report output                   │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────────┐
│  Adapters  (src/adapters/)                                          │
│  ConnectChat · ConnectWebRTC · Lex · AzureDirectLine                │
│  Strands · CopilotDirectLine · CustomHttp · CustomWebSocket         │
│  OpenApiHttp                                                        │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────────┐
│  State Layer                                                        │
│  SQLite (Prisma) · File system (YAML, JSON, WAV, HTML)             │
│  ECS: synced to/from S3 every 30s via ecs-entrypoint.sh            │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Component Design

### 1. Adapter Layer (`src/adapters/`)

All adapters implement `BaseAdapter`:

```typescript
interface BaseAdapter {
  readonly channel?: 'chat' | 'voice';
  connect(options: ConnectOptions): Promise<void>;
  sendMessage(content: string, simulateTyping?: boolean): Promise<void>;
  receive(timeoutMs?: number): Promise<AdapterMessage | null>;
  disconnect(): Promise<void>;
  readonly contactId: string | null;
}
```

**Message delivery model:** Adapters use an internal queue + resolver pattern. When a message arrives asynchronously (WebSocket push, Transcribe result), it is either delivered to a waiting `receive()` resolver or queued for the next `receive()` call. This decouples the async transport from the synchronous conversation loop.

#### ConnectChatAdapter
- Uses `@aws-sdk/client-connect` (`StartChatContact`) and `@aws-sdk/client-connectparticipant` (WebSocket)
- Resolves contact flow names to IDs via `ListContactFlows` + `DescribeContactFlow`
- Filters noise messages (system events, typing indicators) before delivery
- Detects escalation via keyword patterns on agent turns
- Simulates typing delay proportional to message length

#### ConnectWebRTCAdapter
- Uses `StartWebRTCContact` → Chime meeting credentials
- Patches Node.js globals (`RTCPeerConnection`, `MediaStream`, `AudioContext`, `navigator.mediaDevices`) before importing Chime SDK
- `RTCAudioSource` → Polly PCM → agent hears customer speech
- `RTCAudioSink` → raw PCM → Amazon Transcribe Streaming → text
- Drift-compensating audio scheduler (10ms frames at 16kHz) to avoid QEMU-style timing issues on ECS
- Injects 700ms silence tail after each customer utterance for clean VAD transition
- Mixes agent + customer PCM tracks into a single WAV recording
- Retries connection on transient Chime errors (configurable attempts)

#### StrandsChatAdapter
- Supports three auth modes: `none`, `bearer`, `sigv4`
- SigV4 signing via `@smithy/signature-v4` with `defaultProvider()` credential chain
- Maintains conversation history for multi-turn context
- Configurable field paths for request/response mapping

#### CustomWebSocketVoiceAdapter
- Three sub-protocols: `deepgram`, `agentcore`, `generic-json`
- Deepgram: handles `Welcome`/`SettingsApplied` handshake, sends `Settings` frame
- Generic: configurable init JSON, send template (`{{message}}` substitution), agent event type filter, message path extraction

### 2. Conversation Engine (`src/conversation/`)

#### ScenarioRunner
Drives a single scenario through an adapter. Two execution modes:

**Script mode** (when `mode: script` or `turns` array is present):
```
for each turn in scenario.turns:
  send turn.send to adapter
  receive agent response (with per-turn timeout)
  record both turns
```

**Agent mode** (default):
```
while turnIndex < max_turns and not goalAchieved:
  message, goalAchieved, giveUp, waitForAgent = AgentDriver.nextMessage(scenario, history)
  if waitForAgent and channel == voice: receive agent turn (may still be speaking)
  if waitForAgent and channel == chat: skip receive (nothing in queue until we send)
  send message to adapter
  receive agent response (with voice settle timeout)
  check shouldAcceptGoalAchieved (reject premature signals on deferred replies)
```

Voice-specific handling:
- Pre-send guard: waits for trailing agent speech before sending next customer turn
- Turn settle: collects trailing speech packets within a settle window
- Silent wait cycles: if agent hasn't responded, prompts with a follow-up message

#### AgentDriver
Uses Bedrock Converse API to simulate the customer. Builds alternating `user`/`assistant` message history from the transcript turns. Returns special tokens embedded in the response text:
- `[GOAL_ACHIEVED]` — customer's goal has been met
- `[WAIT_FOR_AGENT]` — agent is still processing, don't send yet
- `[GIVE_UP]` — conversation is stuck, end the run

The system prompt encodes the customer persona, goal, and strict behavioural rules (don't confirm identity when greeted by name, don't send filler replies, only signal GOAL_ACHIEVED when actual data is delivered).

### 3. LLM Judge (`src/judge/`)

#### Evaluation Strategy

Three batched Bedrock calls per transcript:

```
Batch 1 (SESSION dims):
  Input: full conversation + scenario goal
  Output: goal_success, task_completion_rate, guardrail_compliance, prompt_injection_resistance

Batch 2 (TRACE dims — per agent turn):
  Input: conversation up to turn N + agent turn N
  Output: correctness, faithfulness, helpfulness, response_relevance, conciseness, tone_and_empathy, clarity
  Final score: mean across all agent turns

Batch 3 (ESCALATION dims — only when escalation context exists):
  Input: full conversation + escalation metadata
  Output: escalation_appropriateness, escalation_handover_quality, vulnerability_detection
```

Security scenarios skip Batch 2 entirely (SECURITY_TRACE_DIMENSIONS = []) and use only guardrail_compliance + prompt_injection_resistance for pass/fail.

#### Dimension Scoring

Each dimension uses a 5-point rating scale (0.0, 0.25, 0.5, 0.75, 1.0) mapped to 0–10 integer scores. The judge returns JSON:
```json
{"dimension_id": {"score": 0.75, "reason": "...", "evidence": "..."}}
```

JSON repair handles common model output issues: literal control characters in strings, trailing commas.

#### Pass/Fail Threshold
- Quality scenarios: overall score ≥ 6.0/10 (average of all active dimensions)
- Security scenarios: core security dimension average ≥ 6.0/10

### 4. API Server (`src/api/`)

#### Run Lifecycle

```
POST /api/runs
  → validate scenario refs
  → write temp YAML to .tmp/portal-runs/
  → create Run record (status: pending)
  → respond 202 with runId
  → setImmediate: spawn npm run cli:<provider>
      → stream stdout/stderr via SSE
      → parse transcript/report paths from log output
      → persist turns to DB
      → upsert EvalResult and Report records
      → update Run status (completed/failed)
      → emit SSE complete/failed event
      → delete temp YAML

GET /api/runs/:id/events (SSE)
  → replay persisted log lines (with Last-Event-ID dedup)
  → if run already finished: synthesise terminal event and close
  → otherwise: register SSE client, stream live events
```

The child process is spawned with `detached: true` so the entire process group (npm + sh + node) can be killed with `process.kill(-pid, 'SIGTERM')`. A hard timeout (default 1 hour) and a done-grace timer (12s after "Done." banner) prevent zombie processes.

#### Runtime Settings

`runtime-settings.json` is read on every `getEffectiveSettings()` call (no caching). This means settings changes take effect on the next run without restarting the server. The file stores only overrides — missing keys fall back to `process.env`.

### 5. React UI (`src/ui/`)

Single-page application with client-side routing via URL query params (`?page=runs`).

#### Key UI Patterns

**Live transcript parsing:** The `parseLiveTranscript()` function scans SSE log lines for emoji-prefixed patterns:
- `▶  Scenario Name` → new scenario block
- `🤖 agent: text` → agent turn bubble
- `🧑 customer: text` → customer turn bubble
- `✓ Name (N turns)` → scenario completion

**Parallel progress board:** `buildParallelProgress()` parses `[parallel N/total]` log lines into a scenario state map, rendered as a grid with a progress bar.

**Artifact URL resolution:** `toPublicArtifactUrl()` converts absolute filesystem paths (from log output) to relative `/reports/` or `/transcripts/` URLs served by Express static middleware.

**SSE reconnect:** Uses `Last-Event-ID` header to resume from the correct log line position after a browser reconnect, avoiding duplicate log lines.

### 6. Report Generator (`src/report/`)

Generates self-contained HTML (no external CSS/JS dependencies) using template string interpolation. The HTML includes:
- Summary cards (overall score, scenario count, pass/fail)
- Scenario results table
- Dimension scores table with `<details>` expandable justification blocks
- Conversation transcript cards with role-coloured turns

### 7. Bedrock Proxy Lambda (`lambda/bedrock_proxy/`)

Python 3.12 Lambda with API Gateway HTTP API v2 event format.

**Request normalisation:** Accepts three input formats:
1. `{"message": "..."}` — single turn
2. `{"messages": [...]}` — multi-turn (Bedrock format)
3. `{"history": [...], "message": "..."}` — evaluator format (customer/agent → user/assistant)

**Region detection:** Extracts region from ARN regex `arn:aws[a-z-]*:bedrock:([a-z0-9-]+):` or falls back to `BEDROCK_REGION` env var.

**Client caching:** Boto3 clients are cached per region in a module-level dict to avoid cold-start overhead on repeated calls.

**Local server:** `server.py` wraps the handler in a `ThreadingHTTPServer` that converts raw HTTP requests to API GW v2 event format, enabling local testing without SAM or LocalStack.

---

## Data Model

### SQLite Schema (Prisma)

```
Scenario
  id          CUID (PK)
  filePath    String (UNIQUE) — "banking/account_query#0"
  name        String
  channel     String — "chat" | "voice"
  description String?
  yamlContent String — full YAML text
  createdAt   DateTime
  updatedAt   DateTime

Run
  id           CUID (PK)
  scenarioId   String? (FK → Scenario)
  scenarioName String
  channel      String
  status       String — pending|running|completed|failed|deleted
  startedAt    DateTime?
  completedAt  DateTime?
  errorMessage String?
  audioPath    String? — WAV filename under transcripts/audio/
  createdAt    DateTime

Turn
  id          CUID (PK)
  runId       String (FK → Run)
  index       Int
  role        String — "customer" | "agent"
  content     String
  durationMs  Int?
  timestampMs BigInt — wall-clock ms since epoch
  [INDEX on runId]

EvalResult
  id              CUID (PK)
  runId           String (UNIQUE FK → Run)
  overallScore    Float
  passed          Boolean
  dimensionScores String — JSON: Record<string, DimensionScore>
  summary         String
  recommendation  String?
  judgeModel      String
  scenarioType    String? — "security" | "quality" | "mixed"
  createdAt       DateTime

Report
  id        CUID (PK)
  runId     String (UNIQUE FK → Run)
  htmlPath  String — absolute filesystem path
  jsonPath  String — absolute filesystem path
  createdAt DateTime
```

### File System Layout

```
/app/state/                    (Docker volume or S3-synced directory)
  data/
    aria-evaluator.db          SQLite database
    runtime-settings.json      Runtime configuration overrides
  reports/
    report_<timestamp>.html
    report_<timestamp>.json
    run-logs/
      run-<uuid>.log           Persisted SSE log lines (up to 3000 lines)
  transcripts/
    <scenario>_<timestamp>.json
    audio/
      <scenario>_<timestamp>.wav
  scenarios/                   YAML scenario files (user-managed)
```

---

## Infrastructure Design

### AWS Deployment (dev/prod)

```
Internet
    │
    ▼
CloudFront Distribution
  ├── /api/*          → ALB (no-cache, forward all headers)
  ├── /reports/*      → ALB (no-cache)
  ├── /transcripts/*  → ALB (no-cache)
  ├── /audio/*        → ALB (no-cache)
  ├── /health         → ALB (no-cache)
  └── /*              → ALB (static cache, 5min TTL)
    │
    ▼
Application Load Balancer (HTTP:80, internet-facing)
    │
    ▼
ECS Fargate Service (linux/amd64, public subnet, public IP)
  Task: aria-evaluator container
    Port: 3001
    Health: GET /health → 200
    State: /app/state → S3 sync every 30s
    │
    ├── IAM Task Role permissions:
    │   S3: ListBucket, GetObject, PutObject, DeleteObject (state bucket)
    │   Connect: StartChatContact, StartWebRTCContact, DescribeContact, etc.
    │   ConnectParticipant: CreateParticipantConnection, SendMessage, etc.
    │   Bedrock: InvokeModel, InvokeModelWithResponseStream (foundation-model/*, inference-profile/*, provisioned-model/*)
    │   BedrockAgentRuntime: InvokeAgent, Retrieve, RetrieveAndGenerate
    │   Polly: SynthesizeSpeech
    │   Transcribe: StartStreamTranscription, StartStreamTranscriptionWebSocket
    │   STS: GetCallerIdentity
    │
    └── IAM Task Execution Role:
        AmazonECSTaskExecutionRolePolicy (ECR pull + CloudWatch logs)

S3 State Bucket
  Encryption: AES256
  Public access: blocked
  Versioning: enabled (prod only)
  Lifecycle: abort incomplete multipart after 7 days

ECR Repository
  Image scanning: on push (prod), disabled (dev)
  Tag mutability: IMMUTABLE (prod), MUTABLE (dev)
  Lifecycle: expire untagged after 14 days, keep last 10 tagged

Bedrock Lambda (optional, independently deployable)
  Runtime: Python 3.12
  Memory: 512 MiB
  Timeout: 120s
  API Gateway: HTTP API v2
    POST /chat  — AWS_IAM auth
    GET /health — no auth
  IAM: AWSLambdaBasicExecutionRole + bedrock:InvokeModel on *
```

### Terraform Module Structure

```
modules/
  networking/     VPC, subnets, IGW, route tables, security groups (ALB + ECS)
  ecr/            ECR repository + lifecycle policy
  s3/             State bucket + encryption + versioning + lifecycle
  iam/            Task execution role + task role + 6 inline policies
  alb/            ALB + target group (IP type, /health check) + HTTP listener
  ecs/            CloudWatch log group + ECS cluster + task definition + service
  cloudfront/     Distribution + 2 cache policies + origin request policy + 5 behaviours
  bedrock-lambda/ Lambda + IAM role + API GW + routes + stage + Lambda permission
  docker-local/   Docker image (auto-build) + volume + network + container
  docker-bedrock-proxy/  Standalone proxy container

environments/
  local/    → docker-local module (kreuzwerker/docker provider)
  bedrock-proxy-local/ → docker-bedrock-proxy module
  dev/      → all AWS modules (dev settings)
  prod/     → all AWS modules (prod settings)
```

### Docker Build Strategy

The Dockerfile uses a two-stage build to solve the Apple Silicon / ECS Fargate platform mismatch:

```dockerfile
# Stage 1: Build (native arch — arm64 on M-series, amd64 on x86)
# npm ci installs the correct native esbuild/vite binary for the host
FROM node:20-bookworm-slim AS build
RUN npm ci && npx prisma generate
RUN npm run build   # TypeScript + Vite

# Stage 2: Runtime (pinned linux/amd64 for ECS Fargate x86)
FROM --platform=linux/amd64 node:20-bookworm-slim AS runtime
# Copies compiled JS from build stage (platform-agnostic)
```

This avoids the QEMU emulation crash where esbuild's native binary panics when forced to run under `linux/amd64` emulation on ARM hardware.

---

## Key Design Decisions

### 1. CLI-as-subprocess for Run Isolation

The API server spawns the CLI as a child process rather than calling the evaluation engine in-process. This provides:
- **Process isolation:** a crashed evaluation doesn't take down the API server
- **Log streaming:** stdout/stderr can be streamed directly to SSE clients
- **Timeout enforcement:** the entire process group can be killed cleanly
- **Provider compatibility:** some adapters (Playwright, wrtc) have global state that conflicts with concurrent in-process runs

### 2. SQLite + S3 for State

SQLite is used instead of a managed database to keep the deployment simple (no RDS, no VPC endpoints for DB access). The S3 sync pattern provides durability without the operational overhead of a managed database. The trade-off is that only one ECS task can run at a time (desired_count = 1) to avoid concurrent SQLite writes.

### 3. Batched LLM Judge Calls

Rather than one Bedrock call per dimension (14 calls per transcript), the judge batches all SESSION dimensions into one call and all TRACE dimensions for each agent turn into one call. This reduces latency and cost by ~10x while maintaining per-dimension granularity.

### 4. Adapter Queue/Resolver Pattern

All adapters use the same internal message delivery pattern: an array of pending resolvers and a queue of pre-arrived messages. This allows `receive()` to be called before or after the message arrives, without polling or busy-waiting. The pattern is safe in single-threaded Node.js without locks.

### 5. Security Scenario Isolation

Security/adversarial scenarios use a completely separate evaluation path:
- Customer turns are redacted before sending to the judge (prevents the judge's own guardrails from triggering)
- Only security dimensions are scored (quality dimensions would always score 0 for a correct refusal)
- Pass/fail is determined solely by guardrail_compliance + prompt_injection_resistance
- Guardrail-blocked agent turns are auto-scored as perfect (no Bedrock call needed)

### 6. Voice Turn Timing

Voice evaluation requires careful timing to avoid:
- **Barging:** sending customer speech while the agent is still speaking
- **Early Transcribe finalisation:** abrupt audio cutoff causes Transcribe to finalise on a partial utterance

Solutions:
- Pre-send guard: waits for trailing agent speech before sending
- Silence tail injection: 700ms of silence after each customer utterance for clean VAD transition
- Drift-compensating scheduler: schedules audio frames relative to absolute start time, not accumulated setTimeout delays

---

## API Reference

### REST Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/scenarios` | List all scenarios |
| `POST` | `/api/scenarios/file` | Create/append scenario YAML file |
| `PUT` | `/api/scenarios/update-doc` | Update one document in a multi-doc YAML file |
| `DELETE` | `/api/scenarios/:filePath` | Delete a scenario file |
| `GET` | `/api/runs` | List runs (last 100, excluding deleted) |
| `POST` | `/api/runs` | Start a new run |
| `GET` | `/api/runs/:id` | Get run details with turns and eval result |
| `GET` | `/api/runs/:id/logs` | Get persisted log lines |
| `GET` | `/api/runs/:id/events` | SSE stream for live run progress |
| `DELETE` | `/api/runs/:id` | Soft-delete a run |
| `GET` | `/api/reports` | List report files |
| `GET` | `/api/transcripts` | List transcript files |
| `GET` | `/api/settings` | Get effective settings |
| `PUT` | `/api/settings` | Save runtime settings |
| `POST` | `/api/openapi/parse` | Parse an OpenAPI spec and detect chat endpoint |
| `GET` | `/health` | Health check |

### SSE Events

| Event | Payload | Description |
|---|---|---|
| `start` | `{runId, provider, channel, scenarioFiles, scenarioCount}` | Run started |
| `log` | `{message}` | Log line from CLI stdout/stderr |
| `complete` | `{runId, overallScore, passed, summary, reportJsonPath, reportHtmlPath}` | Run completed |
| `failed` | `{error}` | Run failed |

### POST /api/runs Request Body

```typescript
{
  scenarioRefs?: string[];    // ["banking/account_query#0", "adversarial/injection#2"]
  scenarioFiles?: string[];   // ["banking/account_query.yaml"]
  scenarioFile?: string;      // single file (legacy)
  scenarioIndex?: number;     // index within file (legacy)
  channel?: 'chat' | 'voice';
  provider?: 'connect' | 'lex' | 'azure' | 'strands' | 'copilot' | 'custom' | 'openapi';
}
```

---

## Correctness Properties

The following properties must hold for the system to be considered correct:

1. **Transcript completeness:** Every customer and agent turn in a conversation SHALL be recorded in the transcript, in order, with accurate timestamps.

2. **Evaluation determinism:** Given the same transcript and judge model, the evaluation SHALL produce the same dimension scores (temperature = 0.0 for judge calls).

3. **Security scenario isolation:** A security scenario evaluation SHALL never include quality dimension scores in its pass/fail determination, regardless of those scores.

4. **Escalation detection accuracy:** If the agent's response contains a known escalation phrase, the system SHALL detect it within the same turn — not on a subsequent turn.

5. **State durability:** After a graceful shutdown (SIGTERM), all run data written to the database SHALL be present in S3 within `S3_SYNC_INTERVAL_SECONDS` seconds.

6. **Run isolation:** A failure in one parallel scenario worker SHALL not affect the results of other workers in the same batch.

7. **Settings precedence:** Runtime settings SHALL always take precedence over environment variables for the same key, with no caching between runs.

8. **Score range:** All dimension scores SHALL be integers in the range [0, 10]. The overall score SHALL be a float in the range [0.0, 10.0] rounded to one decimal place.
