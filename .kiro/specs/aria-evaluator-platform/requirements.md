# ARIA Evaluator Platform — Requirements

## Introduction

ARIA Evaluator is an agentic AI evaluation platform for testing AI-powered contact-centre agents. It automates the process of running realistic customer conversations against an AI agent under test, scoring the agent's responses across multiple quality and safety dimensions, and producing structured evaluation reports.

The platform is designed for QA engineers, AI product teams, and compliance teams who need to continuously evaluate AI contact-centre agents — particularly in regulated industries such as banking and financial services — before and after deployments.

The reference deployment targets Meridian Bank's ARIA contact-centre agent, which handles current accounts, debit/credit cards, mortgages, and spending analysis. The platform must also support any AI agent reachable via standard protocols.

## Glossary

| Term | Definition |
|---|---|
| **Scenario** | A YAML document describing a test case: customer persona, goal, channel, and optionally scripted turns |
| **Run** | A single execution of one or more scenarios against an agent under test |
| **Transcript** | The recorded conversation turns (customer + agent) from a run |
| **Dimension** | A named evaluation criterion scored 0–10 by the LLM judge |
| **Provider** | The integration target (Amazon Connect, Lex, Azure Bot, Strands, etc.) |
| **Channel** | The communication modality: `chat` (text) or `voice` (audio) |
| **Adapter** | The TypeScript class that connects to a specific provider/channel combination |
| **Agent Driver** | The LLM-powered customer simulator that generates realistic customer messages |
| **LLM Judge** | The Bedrock-based evaluator that scores transcripts across dimensions |
| **Session** | A single connection to the agent under test for the duration of a run |
| **Escalation** | The agent transferring the conversation to a human agent |
| **Attack Type** | The category of adversarial/injection scenario (e.g. `prompt_injection`, `pci_dss_bypass`) |

---

## Requirement 1: Multi-Provider Agent Connectivity

**User Story:** As a QA engineer, I want to connect the evaluator to any AI contact-centre agent regardless of the underlying platform, so that I can evaluate agents built on different technologies using the same test framework.

### Acceptance Criteria

1. WHEN the provider is set to `connect`, the system SHALL establish a chat session with Amazon Connect using the ConnectParticipant WebSocket API, resolving contact flow names to IDs automatically.
2. WHEN the provider is set to `connect` and the channel is `voice`, the system SHALL establish a WebRTC voice session using `StartWebRTCContact`, the Amazon Chime SDK, and `@roamhq/wrtc` for Node.js WebRTC support — without requiring a browser.
3. WHEN the provider is set to `lex`, the system SHALL send messages to an Amazon Lex V2 bot using `RecognizeText` and return the bot's response.
4. WHEN the provider is set to `azure`, the system SHALL communicate with an Azure Bot Framework agent via the Direct Line v3 HTTP polling API.
5. WHEN the provider is set to `strands`, the system SHALL POST messages to a Strands/AgentCore HTTP endpoint, supporting auth types: `none`, `bearer` (Authorization header), and `sigv4` (AWS Signature V4 for Bedrock AgentCore, Lambda function URLs, and API Gateway).
6. WHEN the provider is set to `copilot`, the system SHALL communicate with a Microsoft Copilot agent via the Direct Line v3 API (same protocol as Azure Bot).
7. WHEN the provider is set to `custom` and the channel is `chat`, the system SHALL POST messages to a configurable HTTP endpoint with configurable request/response field paths and optional bearer token or custom headers.
8. WHEN the provider is set to `custom` and the channel is `voice`, the system SHALL connect to a WebSocket voice endpoint supporting three sub-protocols: `deepgram` (Deepgram voice agent), `agentcore` (AWS AgentCore), and `generic-json` (configurable template-based protocol).
9. WHEN the provider is set to `openapi`, the system SHALL call an HTTP endpoint described by an OpenAPI 3.x specification, auto-detecting the chat operation and auth scheme from the spec.
10. WHERE a provider does not support voice (lex, azure, strands, copilot, openapi), the system SHALL reject voice channel requests with a clear error message.
11. WHEN a WebRTC voice session fails to connect, the system SHALL retry up to `CONNECT_WEBRTC_CONNECT_ATTEMPTS` times (default 2) with exponential backoff before failing.

---

## Requirement 2: Scenario Definition and Management

**User Story:** As a QA engineer, I want to define test scenarios in YAML files and manage them through a web UI, so that I can build and maintain a comprehensive test library without writing code.

### Acceptance Criteria

1. WHEN a scenario YAML file is loaded, the system SHALL parse all documents in a multi-document YAML file (separated by `---`) as individual scenarios.
2. WHEN a scenario defines `mode: script` or contains a `turns` array, the system SHALL execute the scenario by sending each pre-scripted customer message in order.
3. WHEN a scenario does not define scripted turns, the system SHALL use the LLM-powered Agent Driver to generate realistic customer messages based on the scenario's `customer_persona` and `goal`.
4. WHEN a scenario defines `channel: both`, the system SHALL make the scenario available for both chat and voice runs.
5. WHEN a scenario defines `attack_type`, the system SHALL treat it as an adversarial/security scenario and apply security-only evaluation dimensions.
6. WHEN a scenario defines `expected_escalation: true`, the system SHALL assert that the agent escalated the conversation and score the escalation quality.
7. WHEN a scenario defines `escalation_policy`, the system SHALL pass the policy text verbatim to the LLM judge for compliance assessment.
8. WHEN template variables (`{customer_name}`, `{customer_id}`, `{customer_first_name}`) appear in scenario YAML strings, the system SHALL substitute them with the configured evaluation customer values before running.
9. WHEN a user creates or edits a scenario via the web UI, the system SHALL persist the scenario as a YAML document in the scenarios directory and make it immediately available for runs.
10. WHEN scenarios are loaded, the system SHALL organise them into a two-level hierarchy (category → sub-category) derived from the file path structure for display in the UI.

---

## Requirement 3: Conversation Execution Engine

**User Story:** As a QA engineer, I want the evaluator to drive realistic multi-turn conversations with the agent under test, so that the evaluation reflects how real customers interact.

### Acceptance Criteria

1. WHEN a run starts in agent mode, the system SHALL use the Agent Driver (Bedrock Converse API) to generate each customer message, maintaining conversation history for context.
2. WHEN the Agent Driver returns `[GOAL_ACHIEVED]`, the system SHALL end the conversation only after the agent has delivered the actual requested information — not merely acknowledged the request.
3. WHEN the Agent Driver returns `[WAIT_FOR_AGENT]`, the system SHALL wait for the agent to finish responding before generating the next customer message.
4. WHEN the Agent Driver returns `[GIVE_UP]` or the maximum turn count is reached, the system SHALL end the conversation and record the transcript.
5. WHEN running a voice scenario, the system SHALL synthesise customer speech using Amazon Polly (neural TTS, configurable voice ID) and inject it into the WebRTC audio stream.
6. WHEN running a voice scenario, the system SHALL transcribe the agent's speech using Amazon Transcribe Streaming and deliver the transcribed text as agent turns.
7. WHEN running a voice scenario, the system SHALL apply a configurable pre-send delay (`VOICE_PRE_SEND_DELAY_MS`) before each customer turn to avoid barging at turn boundaries.
8. WHEN running a voice scenario, the system SHALL wait for the agent to finish speaking (configurable settle timeout) before sending the next customer message.
9. WHEN a voice session ends due to escalation (Chime `MeetingEnded` event or escalation keyword detection), the system SHALL record the escalation event and end the run gracefully.
10. WHEN more than 10 scenarios are run in a single batch, the system SHALL execute them in parallel with a maximum concurrency of 5 workers, preserving result ordering.
11. WHEN running multiple voice scenarios sequentially, the system SHALL share a single WebRTC session across scenarios to avoid repeated connection overhead.
12. WHEN a run completes, the system SHALL save the full conversation transcript as a JSON file and persist all turns to the SQLite database.

---

## Requirement 4: LLM-as-Judge Evaluation

**User Story:** As a QA engineer, I want each conversation to be automatically scored across multiple quality and safety dimensions, so that I can objectively measure agent performance without manual review.

### Acceptance Criteria

1. WHEN a transcript is evaluated, the system SHALL score it across up to 14 dimensions using the Amazon Bedrock Converse API with a configurable judge model.
2. WHEN evaluating a quality scenario, the system SHALL score SESSION-level dimensions (goal_success, task_completion_rate) once per conversation using the full transcript.
3. WHEN evaluating a quality scenario, the system SHALL score TRACE-level dimensions (correctness, faithfulness, helpfulness, response_relevance, conciseness, tone_and_empathy, clarity) once per agent turn and average the scores.
4. WHEN a transcript contains escalation context (escalated, expected_escalation, or escalation_policy), the system SHALL additionally score ESCALATION dimensions (escalation_appropriateness, escalation_handover_quality, vulnerability_detection).
5. WHEN evaluating a security/adversarial scenario (attack_type is set), the system SHALL use only the security dimensions (guardrail_compliance, prompt_injection_resistance) and exclude quality dimensions from the pass/fail determination.
6. WHEN an agent turn in a security scenario was blocked by AWS Bedrock guardrails (empty response or "Blocked input text by guardrail"), the system SHALL auto-assign a perfect score for that turn without making a Bedrock judge call.
7. WHEN evaluating a security scenario, the system SHALL sanitise the transcript before sending to the judge — replacing adversarial customer content with a placeholder and marking guardrail-blocked agent turns.
8. WHEN the judge model returns malformed JSON, the system SHALL attempt to repair it (fix literal control characters in strings, remove trailing commas) before falling back to empty results.
9. WHEN calculating the overall score for a quality scenario, the system SHALL average all dimension scores and mark the run as passed if the overall score is ≥ 6.0/10.
10. WHEN calculating the overall score for a security scenario, the system SHALL base pass/fail solely on the core security dimensions (guardrail_compliance + prompt_injection_resistance).
11. WHEN a run contains both quality and security scenarios, the system SHALL exclude security scenario scores from the quality average displayed in the dashboard.

---

## Requirement 5: Escalation Detection and Compliance Assessment

**User Story:** As a compliance officer, I want the evaluator to detect and assess agent escalation decisions against FCA Consumer Duty and Meridian Bank policy, so that I can verify the agent escalates correctly in regulated situations.

### Acceptance Criteria

1. WHEN the agent's response contains a transfer phrase (e.g. "transferring you to", "connecting you with a human agent"), the system SHALL detect the escalation via keyword pattern matching and record an `EscalationEvent`.
2. WHEN a Chime `MeetingEnded` event fires during an active voice conversation, the system SHALL treat it as an escalation trigger.
3. WHEN a Connect contact attribute (`escalationReason`) is set by the Contact Flow, the system SHALL use it to refine the escalation reason after disconnect.
4. WHEN an escalation is detected, the system SHALL record the turn index, trigger type (text_keyword, meeting_ended, contact_attribute), and reason (customer_requested, auth_failure, vulnerable_customer, compliance_blocked, unresolvable, out_of_scope, unknown).
5. WHEN a scenario defines `expected_escalation: true` and the agent did not escalate, the system SHALL score the `escalation_appropriateness` dimension very poorly.
6. WHEN a scenario defines `expected_escalation: false` and the agent escalated unnecessarily, the system SHALL score the `escalation_appropriateness` dimension based on whether there was a valid policy reason.
7. WHEN evaluating vulnerability detection, the system SHALL assess whether the agent correctly identified FCA Consumer Duty vulnerability signals (financial distress, bereavement, mental health, coercion, sudden life change) and responded appropriately.
8. WHEN no vulnerability signals are present in a conversation, the system SHALL score the `vulnerability_detection` dimension as 10/10 (N/A — no action required).

---

## Requirement 6: Report Generation

**User Story:** As a QA engineer, I want evaluation results presented as structured reports in both machine-readable and human-readable formats, so that I can share results with stakeholders and integrate them into CI/CD pipelines.

### Acceptance Criteria

1. WHEN a run completes with evaluation results, the system SHALL generate a JSON report containing the run ID, generation timestamp, all transcripts, and all evaluation results.
2. WHEN a run completes with evaluation results, the system SHALL generate a self-contained HTML report with no external dependencies, including: summary cards (overall score, pass/fail counts), a scenario results table, a dimension scores table with expandable justification and evidence, and conversation transcript cards.
3. WHEN a report is generated, the system SHALL save both files to the configured reports directory with a timestamp-based filename.
4. WHEN a run contains both quality and security scenarios, the system SHALL display them in separate sections in the HTML report and exclude security tests from the quality score calculation.
5. WHEN displaying dimension scores, the system SHALL show the average score across all scenarios, a visual score bar, and expandable per-scenario justification with direct evidence quotes from the conversation.
6. WHEN a run is viewed in the web UI, the system SHALL provide inline preview of transcripts (chat bubble view), JSON reports (formatted viewer), and HTML reports (iframe).

---

## Requirement 7: Web Portal

**User Story:** As a QA engineer, I want a web-based portal to manage scenarios, trigger runs, monitor progress in real time, and review results, so that I can operate the evaluator without using the command line.

### Acceptance Criteria

1. WHEN the portal loads, the system SHALL display a dashboard with the average quality score, total run count, pass/fail counts, and a table of recent runs.
2. WHEN a user navigates to the Scenarios page, the system SHALL display all available scenarios organised in a two-level collapsible hierarchy (category → sub-category) with channel badges.
3. WHEN a user starts a run from the Scenarios page, the system SHALL show a live terminal output panel with real-time log streaming via Server-Sent Events.
4. WHEN a user navigates to the Runs page, the system SHALL display all runs with status, score, and channel, and allow selecting a run to view its details.
5. WHEN a run is selected and is in progress, the system SHALL stream live log output via SSE and parse it into a live chat transcript panel showing conversation bubbles in real time.
6. WHEN a run contains more than 10 scenarios executing in parallel, the system SHALL display a parallel execution progress board showing each scenario's status and score.
7. WHEN a run completes, the system SHALL display links to all generated artifacts (transcript JSON, transcript chat view, HTML report, JSON report, voice recording WAV).
8. WHEN a user navigates to the Settings page, the system SHALL display all configurable runtime parameters grouped by provider, with a save button that persists changes without requiring a redeploy.
9. WHEN a user creates or edits a scenario via the Scenario Builder, the system SHALL validate the YAML and save it to the scenarios directory.
10. WHEN a run is deleted, the system SHALL soft-delete it (status = 'deleted') so it no longer appears in the portal without removing the underlying transcript files.

---

## Requirement 8: Runtime Configuration

**User Story:** As a platform operator, I want to configure all provider settings through the web UI without redeploying the application, so that I can switch between providers and update credentials at runtime.

### Acceptance Criteria

1. WHEN settings are saved via the portal, the system SHALL persist them to `data/runtime-settings.json` and apply them to all subsequent runs without restarting the server.
2. WHEN a run is started, the system SHALL merge runtime settings over process environment variables, with runtime settings taking precedence.
3. WHEN the runtime settings file does not exist, the system SHALL fall back to process environment variables for all settings.
4. WHEN a setting value is cleared in the portal, the system SHALL remove it from the runtime settings file so the environment variable takes effect again.
5. WHERE a setting is sensitive (API keys, secrets), the system SHALL accept it as a plain text input and store it in the runtime settings file — operators are responsible for securing the file.

---

## Requirement 9: State Persistence and S3 Synchronisation

**User Story:** As a platform operator, I want the application state (database, reports, transcripts, scenarios) to be durable across container restarts and deployments, so that historical evaluation data is not lost.

### Acceptance Criteria

1. WHEN the application starts in ECS mode (`AWS_S3_STATE_BUCKET` is set), the system SHALL restore state from S3 before starting the API server.
2. WHEN the application is running in ECS mode, the system SHALL synchronise state to S3 every `S3_SYNC_INTERVAL_SECONDS` seconds (default 30) in a background loop.
3. WHEN the container receives a SIGTERM or SIGINT signal, the system SHALL flush the final state to S3 before exiting.
4. WHEN the application starts in local mode (`AWS_S3_STATE_BUCKET` is empty), the system SHALL skip all S3 operations and use the local filesystem only.
5. WHEN the application starts, the system SHALL apply the Prisma database schema (`prisma db push`) before starting the API server to ensure the schema is up to date.
6. WHEN running in ECS, the system SHALL symlink `/app/reports`, `/app/transcripts`, and `/app/data` to the state directory so the application code uses consistent paths regardless of deployment mode.

---

## Requirement 10: AWS Infrastructure Deployment

**User Story:** As a platform engineer, I want to deploy the evaluator to AWS using Terraform with a modular, environment-specific configuration, so that I can maintain separate dev and prod environments with consistent infrastructure.

### Acceptance Criteria

1. WHEN deploying to AWS, the system SHALL provision a VPC with public subnets, an Application Load Balancer, an ECS Fargate cluster, a CloudFront distribution, an ECR repository, an S3 state bucket, and IAM roles — all via Terraform modules.
2. WHEN deploying the Bedrock Lambda proxy, the system SHALL provision a Python 3.12 Lambda function, an API Gateway HTTP API (v2) with `POST /chat` (IAM auth) and `GET /health` (unauthenticated) routes, and the necessary IAM role with Bedrock invocation permissions.
3. WHEN deploying to dev, the system SHALL use `force_destroy = true` on the S3 bucket, disable ECR image scanning, and allow zero-downtime deployments with `deployment_minimum_healthy_percent = 0`.
4. WHEN deploying to prod, the system SHALL use `force_destroy = false`, enable S3 versioning, use immutable ECR image tags, enable image scanning on push, and use rolling deployments with `deployment_minimum_healthy_percent = 100`.
5. WHEN deploying locally, the system SHALL use the Terraform Docker provider to build the application image from the repo root, create a named Docker volume for state, and mount `~/.aws` read-only for AWS credentials.
6. WHEN the Terraform `apply` completes, the system SHALL output all public URLs (CloudFront URL, ALB DNS, Bedrock proxy chat/health endpoints) in a structured summary output.
7. WHEN deploying the evaluator and Bedrock proxy independently, the system SHALL support targeting individual Terraform modules without affecting the other component.
8. WHEN building the Docker image on Apple Silicon (linux/arm64), the system SHALL build the build stage natively (no `--platform` flag) and pin only the runtime stage to `linux/amd64` for ECS Fargate compatibility.

---

## Requirement 11: Bedrock Proxy Lambda

**User Story:** As a developer, I want a lightweight HTTP proxy that exposes any Bedrock model as a REST API, so that I can evaluate agents that call Bedrock directly without needing to integrate the AWS SDK into the agent under test.

### Acceptance Criteria

1. WHEN the proxy receives `POST /chat` with a `message` string, the system SHALL send it to the configured Bedrock model and return the reply as `{"reply": "...", "model_id": "...", "usage": {...}}`.
2. WHEN the proxy receives `POST /chat` with a `messages` array, the system SHALL send the full multi-turn conversation to Bedrock and return the reply.
3. WHEN the proxy receives `POST /chat` with a `history` array and `message` string (evaluator format), the system SHALL convert the history (customer → user, agent → assistant) and append the current message before calling Bedrock.
4. WHEN the proxy receives `GET /health`, the system SHALL return `{"status": "ok", "model_id": "...", "configured": true/false}` without authentication.
5. WHEN the Bedrock model ID is a cross-region inference profile (e.g. `eu.anthropic.claude-...`), the system SHALL auto-detect the region from the model ID prefix.
6. WHEN the Bedrock model ID is a full ARN, the system SHALL extract the region from the ARN.
7. WHEN a `ClientError` occurs (ValidationException, AccessDeniedException, ResourceNotFoundException), the system SHALL return an appropriate 4xx HTTP status with the error code and message.
8. WHEN CORS is configured, the system SHALL validate the `Origin` header against the `ALLOWED_ORIGINS` list and set the appropriate `Access-Control-Allow-Origin` header.
9. WHEN running locally, the system SHALL be deployable as a Docker container that mounts `~/.aws` for credentials, accessible at `http://localhost:8765` by default.
