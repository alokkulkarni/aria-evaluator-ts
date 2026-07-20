#!/usr/bin/env node
// src/cli/run.ts — ARIA Evaluator CLI
// Connect mode remains default; additional provider modes are opt-in.

import 'dotenv/config';
import { parseArgs } from 'node:util';
import { readdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ScenarioRunner } from '../conversation/runner.js';
import { ConnectChatAdapter } from '../adapters/connect-chat.js';
import { ConnectWebRTCAdapter } from '../adapters/connect-webrtc.js';
import { LexChatAdapter } from '../adapters/lex-chat.js';
import { AzureDirectLineChatAdapter } from '../adapters/azure-directline-chat.js';
import { CustomHttpChatAdapter } from '../adapters/custom-http-chat.js';
import { OpenApiHttpChatAdapter } from '../adapters/openapi-http-chat.js';
import { CustomWebSocketVoiceAdapter } from '../adapters/custom-websocket-voice.js';
import { StrandsChatAdapter } from '../adapters/strands-chat.js';
import { WebSocketChatAdapter } from '../adapters/websocket-chat.js';
import { AzureOpenAIChatAdapter } from '../adapters/azure-openai-chat.js';
import type { BaseAdapter } from '../adapters/base.js';
import { providerCanVoice, isVoiceWsProvider } from '../shared/provider-channels.js';
import { JudgePanel } from '../judge/judge-panel.js';
import { getJudgeCommitteeConfig } from '../api/runtime-settings.js';
import { ReportGenerator } from '../report/generator.js';
import { explainTranscriptsForReport } from '../judge/explain/explain-run.js';
import {
  loadScenariosFromFile,
  filterScenarios,
} from '../conversation/scenario-loader.js';
import {
  EXIT_GATE_FAILED,
  buildGateBaseline,
  evaluateGate,
  parseGateBaselineFile,
  snapshotFromResults,
  type GateBaselineFile,
  type GateSeverity,
} from '../lib/regression-gate.js';
import type { Scenario } from '../types/scenario.js';
import type { Transcript } from '../types/transcript.js';
import type { EvalResult } from '../types/evaluation.js';
import type { TurnShapleyExplanation } from '../judge/explain/turn-shapley.js';

type EvaluatorProvider = 'connect' | 'lex' | 'azure' | 'azure-openai' | 'strands' | 'copilot' | 'custom' | 'openapi' | 'websocket';
const SUPPORTED_PROVIDERS: EvaluatorProvider[] = ['connect', 'lex', 'azure', 'azure-openai', 'strands', 'copilot', 'custom', 'openapi', 'websocket'];

// Parallel execution: triggered when scenario count exceeds this threshold
const PARALLEL_THRESHOLD = 10;
// Max concurrent scenario workers (bounded to avoid provider rate limits)
const MAX_CONCURRENCY = 5;

/**
 * Gated turn-attribution pre-compute for the HTML report (explainability Phase 2).
 * Off by default — set REPORT_EXPLAIN_TURNS=true to bake turn-Shapley bars into the
 * report for security-core / failed dimensions (spends extra judge tokens, capped
 * by REPORT_EXPLAIN_MAX, default 12 computations).
 */
async function reportExplanations(
  transcripts: Transcript[],
  results: EvalResult[],
): Promise<Record<string, Record<string, TurnShapleyExplanation>> | undefined> {
  const flag = (process.env['REPORT_EXPLAIN_TURNS'] ?? '').toLowerCase();
  if (flag !== 'true' && flag !== '1') return undefined;
  const max = Number(process.env['REPORT_EXPLAIN_MAX']);
  try {
    console.log('  🔍 Pre-computing turn attribution for the report…');
    return await explainTranscriptsForReport(transcripts, results, {
      max: Number.isFinite(max) && max > 0 ? max : 12,
    });
  } catch (err) {
    console.warn(`  ⚠  turn attribution skipped: ${(err as Error).message}`);
    return undefined;
  }
}

console.log(`
🚀 ARIA Evaluator TS  starting at ${new Date().toISOString()}

  How to run:
    Connect all scenarios (chat):  npx tsx src/cli/run.ts
    Connect all scenarios (voice): npx tsx src/cli/run.ts --channel voice
    One scenario:                  npx tsx src/cli/run.ts --scenario banking/account_query
    Lex (chat):                    npx tsx src/cli/run.ts --provider lex --scenario banking/account_query
    Azure (chat):                  npx tsx src/cli/run.ts --provider azure --scenario banking/account_query
    Strands (chat):                npx tsx src/cli/run.ts --provider strands --scenario banking/account_query
    Copilot (chat):                npx tsx src/cli/run.ts --provider copilot --scenario banking/account_query
    Custom (voice):                npx tsx src/cli/run.ts --provider custom --channel voice --scenario banking/account_query
    Re-evaluate saved:             npx tsx src/cli/run.ts --transcript transcripts/foo.json

  CI regression gate (exit 0 = pass, ${EXIT_GATE_FAILED} = quality gate failed, 1 = operational error):
    Absolute pass-rate floor:      npx tsx src/cli/run.ts --scenario banking --min-pass-rate 90
    Compare vs baseline:           npx tsx src/cli/run.ts --scenario banking --gate-baseline baselines/banking.json [--fail-on low|medium|critical] [--fail-on-drift]
    Bless a new baseline:          npx tsx src/cli/run.ts --scenario banking --gate-baseline baselines/banking.json --update-baseline
`);

const { values: args } = parseArgs({
  options: {
    provider:           { type: 'string', short: 'p', default: process.env['EVAL_PROVIDER'] ?? 'connect' },
    scenario:           { type: 'string', short: 's' },
    channel:            { type: 'string', short: 'c', default: 'chat' },
    transcript:         { type: 'string', short: 't' },
    'conversation-only': { type: 'boolean', default: false },
    'no-eval':          { type: 'boolean', default: false },
    'scenarios-dir':    { type: 'string', default: '../aria-evaluator/scenarios' },
    headless:           { type: 'boolean', default: true },
    'gate-baseline':    { type: 'string' },
    'update-baseline':  { type: 'boolean', default: false },
    'min-pass-rate':    { type: 'string' },
    'fail-on':          { type: 'string', default: 'medium' },
    'fail-on-drift':    { type: 'boolean', default: false },
  },
  strict: false,
});

const provider = normalizeProvider(args['provider'] as string);
process.env['EVAL_PROVIDER'] = provider;
const channel = (args['channel'] as string).toLowerCase() === 'voice' ? 'voice' : 'chat';
const conversationOnly = args['conversation-only'] as boolean;
const noEval = args['no-eval'] as boolean;
const scenariosDir = resolve(args['scenarios-dir'] as string);

// ── CI regression-gate flags ────────────────────────────────────────────────
const gateBaselinePath = args['gate-baseline'] ? resolve(args['gate-baseline'] as string) : undefined;
const updateBaseline = args['update-baseline'] as boolean;
const failOnDrift = args['fail-on-drift'] as boolean;
const failOnRaw = (args['fail-on'] as string).toLowerCase();
const minPassRateRaw = args['min-pass-rate'] as string | undefined;
const gatingRequested = gateBaselinePath != null || minPassRateRaw != null;

if (!['low', 'medium', 'critical'].includes(failOnRaw)) {
  console.error(`  ✗ Invalid --fail-on value: ${failOnRaw}. Use low, medium, or critical.`);
  process.exit(1);
}
const failOn = failOnRaw as GateSeverity;

let minPassRate: number | undefined;
if (minPassRateRaw != null) {
  minPassRate = Number(minPassRateRaw);
  if (!Number.isFinite(minPassRate) || minPassRate < 0 || minPassRate > 100) {
    console.error(`  ✗ Invalid --min-pass-rate: ${minPassRateRaw}. Use a number between 0 and 100.`);
    process.exit(1);
  }
}
if (updateBaseline && gateBaselinePath == null) {
  console.error('  ✗ --update-baseline requires --gate-baseline <path> (where to write the baseline).');
  process.exit(1);
}
if ((gatingRequested || updateBaseline) && (conversationOnly || noEval)) {
  console.error('  ✗ Regression gating needs evaluation results — remove --no-eval / --conversation-only.');
  process.exit(1);
}

const missing = validateProviderEnv(provider, channel);
if (missing.length > 0) {
  console.error(`  ✗ Missing environment variables or unsupported mode: ${missing.join(', ')}`);
  console.error('    Update .env / portal settings for the selected provider.');
  process.exit(1);
}

if (args['transcript']) {
  const transcriptPath = resolve(args['transcript'] as string);
  if (!existsSync(transcriptPath)) {
    console.error(`  ✗ Transcript not found: ${transcriptPath}`);
    process.exit(1);
  }
  const transcript: Transcript = JSON.parse(readFileSync(transcriptPath, 'utf-8'));
  console.log(`  ℹ  Re-evaluating: ${transcript.scenarioName}`);

  const judge = new JudgePanel(getJudgeCommitteeConfig());
  const result = await judge.evaluate(transcript, 'Evaluate transcript quality');
  const explanations = await reportExplanations([transcript], [result]);
  const reporter = new ReportGenerator();
  reporter.generate({
    runId: transcript.id,
    generatedAt: new Date().toISOString(),
    transcripts: [transcript],
    results: [result],
    ...(explanations ? { explanations } : {}),
  });
  process.exit(0);
}

const scenarioFiles = discoverScenarioFiles(scenariosDir, args['scenario'] as string | undefined);
if (scenarioFiles.length === 0) {
  console.error(`  ✗ No scenario files found in: ${scenariosDir}`);
  process.exit(1);
}

console.log(`📂 Running ${scenarioFiles.length} scenario file(s) on channel: ${channel} [provider=${provider}]\n`);

const runner = new ScenarioRunner();
const allTranscripts: Transcript[] = [];
const allResults: EvalResult[] = [];
const judge = conversationOnly || noEval ? null : new JudgePanel(getJudgeCommitteeConfig());
const runId = randomUUID();

for (const file of scenarioFiles) {
  console.log(`\n── ${file} ──`);

  let scenarios: Scenario[];
  try {
    scenarios = loadScenariosFromFile(file);
  } catch (err) {
    console.error(`  ✗ Failed to load ${file}: ${(err as Error).message}`);
    continue;
  }

  const filtered = filterScenarios(scenarios, undefined);
  if (filtered.length === 0) {
    console.log(`  ℹ  No scenarios in this file`);
    continue;
  }

  if (channel === 'voice' && !providerCanVoice(provider)) {
    console.error(`  ✗ Provider "${provider}" does not support voice mode in this evaluator yet.`);
    process.exit(1);
  }

  if (channel === 'voice' && provider === 'connect') {
    const sharedAdapter = new ConnectWebRTCAdapter({
      instanceId: process.env['CONNECT_INSTANCE_ID']!,
      contactFlowId: process.env['CONNECT_WEBRTC_FLOW_ID']!,
      region: process.env['AWS_REGION'] ?? process.env['CONNECT_REGION'] ?? 'eu-west-2',
    });
    await runVoiceBatch(filtered, sharedAdapter, runner, judge, allTranscripts, allResults);
    continue;
  }

  // custom / strands / openapi / websocket all run voice over the generic
  // bidirectional-audio WebSocket adapter — voice is transport-agnostic.
  if (channel === 'voice' && isVoiceWsProvider(provider)) {
    const sharedAdapter = createCustomVoiceAdapter();
    await runVoiceBatch(filtered, sharedAdapter, runner, judge, allTranscripts, allResults);
    continue;
  }

  if (filtered.length > PARALLEL_THRESHOLD) {
    console.log(`  ℹ  Running ${filtered.length} scenarios in parallel (max ${MAX_CONCURRENCY} concurrent)`);
    await runParallelChatBatch(filtered, provider, judge, allTranscripts, allResults);
  } else {
    for (const scenario of filtered) {
      const adapter = createChatAdapter(provider);
      const transcript = await runner.run(scenario, adapter);
      allTranscripts.push(transcript);
      if (judge) {
        const result = await judge.evaluate(transcript, scenario.goal ?? scenario.name, scenario);
        allResults.push(result);
      }
    }
  }
}

if (allTranscripts.length === 0) {
  console.log('\n⚠  No transcripts collected.');
  process.exit(1);
}

if (allResults.length > 0) {
  const explanations = await reportExplanations(allTranscripts, allResults);
  const reporter = new ReportGenerator();
  reporter.generate({
    runId,
    generatedAt: new Date().toISOString(),
    transcripts: allTranscripts,
    results: allResults,
    ...(explanations ? { explanations } : {}),
  });

  const passCount = allResults.filter((r) => r.passed).length;
  const avgScore = allResults.reduce((a, b) => a + b.overallScore, 0) / allResults.length;
  console.log(`\n✅ Done. ${passCount}/${allResults.length} passed. Average score: ${avgScore.toFixed(1)}/10`);
} else {
  const failedCount = allTranscripts.filter((t) => !!t.error).length;
  if (!judge) {
    console.log(`\n✅ Done. ${allTranscripts.length} transcript(s) saved (no evaluation run).`);
  } else if (failedCount === allTranscripts.length) {
    console.log(`\n✅ Done. ${allTranscripts.length} transcript(s) saved. No evaluation results produced.`);
  } else {
    console.log(`\n✅ Done. ${allTranscripts.length} transcript(s) saved.`);
  }
}

// ── CI regression gate ──────────────────────────────────────────────────────
if (gatingRequested || updateBaseline) {
  const snapshot = snapshotFromResults(allResults, allTranscripts);
  const currentJudgeConfigHash = allResults.find((r) => r.judgeConfigHash)?.judgeConfigHash ?? null;

  if (updateBaseline) {
    if (allResults.length === 0) {
      console.error('  ✗ Cannot update the baseline: no evaluation results were produced.');
      process.exit(1);
    }
    const baseline = buildGateBaseline(allResults, allTranscripts, {
      name: (args['scenario'] as string | undefined) ?? 'ci-baseline',
      judgeConfigHash: currentJudgeConfigHash,
    });
    writeFileSync(gateBaselinePath!, JSON.stringify(baseline, null, 2) + '\n');
    console.log(
      `\n📌 Baseline updated: ${gateBaselinePath} — ${baseline.totalRuns} run(s), ` +
        `pass rate ${(baseline.passRate * 100).toFixed(1)}%, avg score ${baseline.avgScore.toFixed(1)}/10`,
    );
    process.exit(0);
  }

  let baselineFile: GateBaselineFile | null = null;
  if (gateBaselinePath != null) {
    if (!existsSync(gateBaselinePath)) {
      console.error(`  ✗ Gate baseline not found: ${gateBaselinePath}. Create it with --update-baseline.`);
      process.exit(1);
    }
    try {
      baselineFile = parseGateBaselineFile(readFileSync(gateBaselinePath, 'utf-8'));
    } catch (err) {
      console.error(`  ✗ ${(err as Error).message} (${gateBaselinePath})`);
      process.exit(1);
    }
  }

  const decision = evaluateGate(baselineFile, snapshot, {
    minPassRate,
    failOn,
    failOnDrift,
    currentJudgeConfigHash,
  });
  for (const warning of decision.warnings) console.warn(`  ⚠  ${warning}`);
  if (decision.passed) {
    console.log(`\n🟢 Regression gate PASSED${decision.severity ? ` (regression severity: ${decision.severity})` : ''}.`);
    process.exit(0);
  }
  console.error('\n🔴 Regression gate FAILED:');
  for (const reason of decision.reasons) console.error(`  ✗ ${reason}`);
  process.exit(EXIT_GATE_FAILED);
}

async function runParallelChatBatch(
  scenarios: Scenario[],
  provider: EvaluatorProvider,
  judge: JudgePanel | null,
  transcripts: Transcript[],
  results: EvalResult[],
): Promise<void> {
  // Pre-allocate slots to preserve scenario ordering in final output
  const tSlots: (Transcript | null)[] = new Array(scenarios.length).fill(null);
  const rSlots: (EvalResult | null)[] = new Array(scenarios.length).fill(null);

  // nextIdx is read+incremented atomically (no await between read and write)
  // This is safe in single-threaded JS — no mutex needed.
  let nextIdx = 0;

  async function worker(): Promise<void> {
    while (true) {
      // Claim the next scenario index atomically
      const idx = nextIdx++;
      if (idx >= scenarios.length) return;

      const scenario = scenarios[idx]!;
      // Each parallel scenario gets its own runner (avoids shared conversationHistory in AgentDriver)
      const parallelRunner = new ScenarioRunner();
      const adapter = createChatAdapter(provider);

      const label = scenario.name ?? `scenario[${idx}]`;
      console.log(`  ▶ [parallel ${idx + 1}/${scenarios.length}] starting: ${label}`);

      try {
        const transcript = await parallelRunner.run(scenario, adapter);
        tSlots[idx] = transcript;

        if (judge) {
          const evalResult = await judge.evaluate(transcript, scenario.goal ?? scenario.name, scenario);
          rSlots[idx] = evalResult;
          const status = evalResult.passed ? '✅' : '❌';
          console.log(`  ${status} [parallel ${idx + 1}/${scenarios.length}] done: ${label} (score ${evalResult.overallScore}/10)`);
        } else {
          console.log(`  ✅ [parallel ${idx + 1}/${scenarios.length}] done: ${label}`);
        }
      } catch (err) {
        console.error(`  ✗ [parallel ${idx + 1}/${scenarios.length}] failed: ${label}: ${(err as Error).message}`);
        // Leave the slot null — gap in results is intentional (mirrors sequential error handling)
      }
    }
  }

  // Spawn up to MAX_CONCURRENCY workers and wait for all to finish
  const workerCount = Math.min(MAX_CONCURRENCY, scenarios.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  // Collect results in order, skipping any null slots (failed scenarios)
  for (const t of tSlots) {
    if (t !== null) transcripts.push(t);
  }
  for (const r of rSlots) {
    if (r !== null) results.push(r);
  }
}

async function runVoiceBatch(
  scenarios: Scenario[],
  sharedAdapter: BaseAdapter,
  runner: ScenarioRunner,
  judge: JudgePanel | null,
  transcripts: Transcript[],
  results: EvalResult[],
): Promise<void> {
  let sessionConnected = false;
  try {
    for (let idx = 0; idx < scenarios.length; idx++) {
      const scenario = scenarios[idx]!;
      const connectNow = !sessionConnected;
      const disconnectNow = idx === scenarios.length - 1;

      const transcript = await runner.run(
        scenario,
        sharedAdapter,
        undefined,
        { connect: connectNow, disconnect: disconnectNow },
      );
      transcripts.push(transcript);

      if (judge) {
        const result = await judge.evaluate(transcript, scenario.goal ?? scenario.name, scenario);
        results.push(result);
      }

      const sharedSessionEnded = hasSharedVoiceSessionEnded(sharedAdapter, transcript);
      sessionConnected = !disconnectNow && !sharedSessionEnded;

      if (sharedSessionEnded && !disconnectNow) {
        const endReason = transcript.error ?? 'unknown reason';
        console.warn(`  ⚠ Shared voice session ended before all scenarios completed (${endReason}).`);
        break;
      }
    }
  } finally {
    try {
      await sharedAdapter.disconnect();
    } catch {
      // ignore cleanup errors
    }
  }
}

function discoverScenarioFiles(scenariosDir: string, scenarioArg?: string): string[] {
  if (scenarioArg) {
    const candidate = join(scenariosDir, scenarioArg);
    const withYaml = candidate.endsWith('.yaml') ? candidate : `${candidate}.yaml`;
    if (existsSync(withYaml)) return [withYaml];
    if (existsSync(candidate)) {
      return readdirSync(candidate)
        .filter((f) => f.endsWith('.yaml'))
        .map((f) => join(candidate, f));
    }
    console.error(`  ✗ Scenario not found: ${scenarioArg}`);
    process.exit(1);
  }

  const walk = (dir: string): string[] => {
    if (!existsSync(dir)) return [];
    return readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
      d.isDirectory() ? walk(join(dir, d.name)) : d.name.endsWith('.yaml') ? [join(dir, d.name)] : [],
    );
  };
  return walk(scenariosDir);
}

function normalizeProvider(raw: string): EvaluatorProvider {
  const normalized = raw.toLowerCase();
  if (SUPPORTED_PROVIDERS.includes(normalized as EvaluatorProvider)) {
    return normalized as EvaluatorProvider;
  }
  console.error(`  ✗ Unsupported provider: ${raw}. Supported: ${SUPPORTED_PROVIDERS.join(', ')}`);
  process.exit(1);
}

function hasAwsCreds(): boolean {
  return (
    !!(process.env['AWS_ACCESS_KEY_ID'] && process.env['AWS_SECRET_ACCESS_KEY'])
    || !!process.env['AWS_PROFILE']
    || !!process.env['AWS_ROLE_ARN']
    || !!process.env['AWS_CONTAINER_CREDENTIALS_RELATIVE_URI']  // ECS task role
    || !!process.env['AWS_CONTAINER_CREDENTIALS_FULL_URI']       // ECS container creds
    || !!process.env['AWS_WEB_IDENTITY_TOKEN_FILE']              // EKS IRSA / WebIdentity
    || existsSync(join(process.env['HOME'] ?? '', '.aws', 'credentials'))
  );
}

/**
 * Missing env for a generic voice-WebSocket run (shared by custom / strands /
 * openapi / websocket — voice is transport-agnostic, so the same voice endpoint
 * settings apply regardless of the chat provider).
 */
function validateVoiceWsEnv(): string[] {
  const missing: string[] = [];
  const protocol = (process.env['CUSTOM_VOICE_PROTOCOL'] ?? 'deepgram').toLowerCase();
  if (protocol === 'deepgram') {
    if (!process.env['DEEPGRAM_VOICE_WS_URL']) missing.push('DEEPGRAM_VOICE_WS_URL');
    if (!process.env['DEEPGRAM_API_KEY']) missing.push('DEEPGRAM_API_KEY');
    return missing;
  }
  if (!process.env['CUSTOM_VOICE_WS_URL']) missing.push('CUSTOM_VOICE_WS_URL');
  return missing;
}

function validateProviderEnv(provider: EvaluatorProvider, channel: 'chat' | 'voice'): string[] {
  const missing: string[] = [];

  if (provider === 'connect') {
    if (!process.env['CONNECT_INSTANCE_ID']) missing.push('CONNECT_INSTANCE_ID');
    if (channel === 'chat') {
      if (!process.env['CONNECT_CONTACT_FLOW'] && !process.env['CONNECT_CONTACT_FLOW_NAME']) {
        missing.push('CONNECT_CONTACT_FLOW or CONNECT_CONTACT_FLOW_NAME');
      }
    }
    if (channel === 'voice' && !process.env['CONNECT_WEBRTC_FLOW_ID']) {
      missing.push('CONNECT_WEBRTC_FLOW_ID');
    }
    if (!hasAwsCreds()) missing.push('AWS credentials');
    return missing;
  }

  if (provider === 'lex') {
    if (channel === 'voice') missing.push('lex provider supports chat only');
    if (!process.env['LEX_BOT_ID']) missing.push('LEX_BOT_ID');
    if (!process.env['LEX_BOT_ALIAS_ID']) missing.push('LEX_BOT_ALIAS_ID');
    if (!process.env['LEX_BOT_LOCALE_ID']) missing.push('LEX_BOT_LOCALE_ID');
    if (!hasAwsCreds()) missing.push('AWS credentials');
    return missing;
  }

  if (provider === 'azure') {
    if (channel === 'voice') missing.push('azure provider supports chat only');
    if (!process.env['AZURE_DIRECT_LINE_SECRET']) missing.push('AZURE_DIRECT_LINE_SECRET');
    return missing;
  }

  if (provider === 'azure-openai') {
    if (channel === 'voice') missing.push('azure-openai provider supports chat only');
    if (!process.env['AZURE_OPENAI_AGENT_ENDPOINT']) missing.push('AZURE_OPENAI_AGENT_ENDPOINT');
    if (!process.env['AZURE_OPENAI_AGENT_API_KEY']) missing.push('AZURE_OPENAI_AGENT_API_KEY');
    if (!process.env['AZURE_OPENAI_AGENT_DEPLOYMENT']) missing.push('AZURE_OPENAI_AGENT_DEPLOYMENT');
    return missing;
  }

  if (provider === 'strands') {
    if (channel === 'voice') return validateVoiceWsEnv();
    if (!process.env['STRANDS_ENDPOINT']) missing.push('STRANDS_ENDPOINT');
    return missing;
  }

  if (provider === 'copilot') {
    if (channel === 'voice') missing.push('copilot provider supports chat only');
    if (!process.env['COPILOT_DIRECT_LINE_SECRET']) missing.push('COPILOT_DIRECT_LINE_SECRET');
    return missing;
  }

  if (provider === 'custom') {
    if (channel === 'voice') return validateVoiceWsEnv();
    if (!process.env['CUSTOM_CHAT_ENDPOINT']) missing.push('CUSTOM_CHAT_ENDPOINT');
    return missing;
  }

  if (provider === 'openapi') {
    if (channel === 'voice') return validateVoiceWsEnv();
    if (!process.env['OPENAPI_ENDPOINT_URL']) missing.push('OPENAPI_ENDPOINT_URL');
    return missing;
  }

  if (provider === 'websocket') {
    if (channel === 'voice') return validateVoiceWsEnv();
    if (!process.env['WS_CHAT_URL']) missing.push('WS_CHAT_URL');
    return missing;
  }

  return ['unsupported provider'];
}

function createChatAdapter(provider: EvaluatorProvider): BaseAdapter {
  if (provider === 'connect') {
    return new ConnectChatAdapter({
      instanceId: process.env['CONNECT_INSTANCE_ID']!,
      contactFlowIdOrName: process.env['CONNECT_CONTACT_FLOW'] ?? process.env['CONNECT_CONTACT_FLOW_NAME']!,
      region: process.env['AWS_REGION'] ?? process.env['CONNECT_REGION'] ?? 'eu-west-2',
    });
  }

  if (provider === 'lex') {
    return new LexChatAdapter({
      botId: process.env['LEX_BOT_ID']!,
      botAliasId: process.env['LEX_BOT_ALIAS_ID']!,
      localeId: process.env['LEX_BOT_LOCALE_ID']!,
      region: process.env['LEX_REGION'] ?? process.env['AWS_REGION'] ?? 'eu-west-2',
    });
  }

  if (provider === 'azure') {
    return new AzureDirectLineChatAdapter({
      secret: process.env['AZURE_DIRECT_LINE_SECRET']!,
      endpoint: process.env['AZURE_DIRECT_LINE_ENDPOINT'],
      userId: process.env['AZURE_DIRECT_LINE_USER_ID'],
    });
  }

  if (provider === 'azure-openai') {
    return new AzureOpenAIChatAdapter({
      endpoint: process.env['AZURE_OPENAI_AGENT_ENDPOINT']!,
      apiKey: process.env['AZURE_OPENAI_AGENT_API_KEY']!,
      deployment: process.env['AZURE_OPENAI_AGENT_DEPLOYMENT']!,
      apiVersion: process.env['AZURE_OPENAI_AGENT_API_VERSION'],
      systemPrompt: process.env['AZURE_OPENAI_AGENT_SYSTEM_PROMPT'],
    });
  }

  if (provider === 'strands') {
    return new StrandsChatAdapter({
      endpoint: process.env['STRANDS_ENDPOINT']!,
      method: (process.env['STRANDS_METHOD'] as 'POST' | 'PUT' | undefined) ?? 'POST',
      authType: (process.env['STRANDS_AUTH_TYPE'] as 'none' | 'bearer' | 'sigv4' | undefined) ?? 'none',
      authBearerToken: process.env['STRANDS_AUTH_BEARER'],
      sigv4Region: process.env['STRANDS_SIGV4_REGION'] ?? process.env['AWS_REGION'],
      sigv4Service: process.env['STRANDS_SIGV4_SERVICE'],
      messageField: process.env['STRANDS_MESSAGE_FIELD'],
      responseField: process.env['STRANDS_RESPONSE_FIELD'],
      headersJson: process.env['STRANDS_HEADERS_JSON'],
      historyField: process.env['STRANDS_HISTORY_FIELD'],
      sessionIdField: process.env['STRANDS_SESSION_ID_FIELD'],
    });
  }

  if (provider === 'copilot') {
    return new AzureDirectLineChatAdapter({
      secret: process.env['COPILOT_DIRECT_LINE_SECRET']!,
      endpoint: process.env['COPILOT_DIRECT_LINE_ENDPOINT'],
      userId: process.env['COPILOT_DIRECT_LINE_USER_ID'],
    });
  }

  if (provider === 'openapi') {
    return new OpenApiHttpChatAdapter({
      endpoint: process.env['OPENAPI_ENDPOINT_URL']!,
      method: (process.env['OPENAPI_METHOD'] as 'POST' | 'PUT' | undefined) ?? 'POST',
      authType: (process.env['OPENAPI_AUTH_TYPE'] as 'none' | 'bearer' | 'apikey' | 'basic' | undefined) ?? 'none',
      authValue: process.env['OPENAPI_AUTH_VALUE'],
      authHeaderName: process.env['OPENAPI_AUTH_HEADER_NAME'],
      extraHeadersJson: process.env['OPENAPI_HEADERS_JSON'],
      messageField: process.env['OPENAPI_MESSAGE_FIELD'],
      responseField: process.env['OPENAPI_RESPONSE_FIELD'],
    });
  }

  if (provider === 'websocket') {
    return new WebSocketChatAdapter({
      url: process.env['WS_CHAT_URL']!,
      authHeaderName: process.env['WS_CHAT_AUTH_HEADER_NAME'],
      authHeaderValue: process.env['WS_CHAT_AUTH_HEADER_VALUE'],
      subprotocol: process.env['WS_CHAT_SUBPROTOCOL'],
      initJson: process.env['WS_CHAT_INIT_JSON'],
      sendTemplate: process.env['WS_CHAT_SEND_TEMPLATE'],
      agentEventTypes: process.env['WS_CHAT_AGENT_EVENT_TYPES'],
      messagePath: process.env['WS_CHAT_MESSAGE_PATH'],
    });
  }

  return new CustomHttpChatAdapter({
    endpoint: process.env['CUSTOM_CHAT_ENDPOINT']!,
    method: (process.env['CUSTOM_CHAT_METHOD'] as 'POST' | 'PUT' | undefined) ?? 'POST',
    authBearerToken: process.env['CUSTOM_CHAT_AUTH_BEARER'],
    messageField: process.env['CUSTOM_CHAT_MESSAGE_FIELD'],
    responseField: process.env['CUSTOM_CHAT_RESPONSE_FIELD'],
    headersJson: process.env['CUSTOM_CHAT_HEADERS_JSON'],
  });
}

function createCustomVoiceAdapter(): BaseAdapter {
  const protocol = (process.env['CUSTOM_VOICE_PROTOCOL'] ?? 'deepgram').toLowerCase();
  if (protocol === 'deepgram') {
    return new CustomWebSocketVoiceAdapter({
      protocol: 'deepgram',
      url: process.env['DEEPGRAM_VOICE_WS_URL']!,
      authHeaderName: 'Authorization',
      authHeaderValue: `Token ${process.env['DEEPGRAM_API_KEY']!}`,
      deepgramSettingsJson: process.env['DEEPGRAM_VOICE_SETTINGS_JSON'],
    });
  }
  return new CustomWebSocketVoiceAdapter({
    protocol: protocol === 'agentcore' ? 'agentcore' : 'generic-json',
    url: process.env['CUSTOM_VOICE_WS_URL']!,
    authHeaderName: process.env['CUSTOM_VOICE_WS_AUTH_HEADER_NAME'],
    authHeaderValue: process.env['CUSTOM_VOICE_WS_AUTH_HEADER_VALUE'],
    genericInitJson: process.env['CUSTOM_VOICE_WS_INIT_JSON'],
    genericSendTemplate: process.env['CUSTOM_VOICE_WS_SEND_TEMPLATE'],
    genericAgentEventTypes: process.env['CUSTOM_VOICE_WS_AGENT_EVENT_TYPES'],
    genericMessagePath: process.env['CUSTOM_VOICE_WS_MESSAGE_PATH'],
  });
}

function isSessionEndedError(error?: string): boolean {
  if (!error) return false;
  return error.toLowerCase().includes('session ended');
}

function hasSharedVoiceSessionEnded(adapter: BaseAdapter, transcript: Transcript): boolean {
  if (adapter instanceof ConnectWebRTCAdapter) {
    return adapter.lastSessionEndReason != null || isSessionEndedError(transcript.error);
  }
  return isSessionEndedError(transcript.error);
}
