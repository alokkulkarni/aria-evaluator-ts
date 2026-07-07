// src/report/generator.ts
// Generates HTML and JSON evaluation reports.

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { appPaths } from '../runtime/paths.js';
import type { Transcript } from '../types/transcript.js';
import type { EvalResult, TurnContribution, RiskInsight } from '../types/evaluation.js';
import type { TurnShapleyExplanation } from '../judge/explain/turn-shapley.js';
import { ALL_DIMENSIONS_BY_ID } from '../judge/dimensions.js';

export interface ReportData {
  runId: string;
  generatedAt: string;
  transcripts: Transcript[];
  results: EvalResult[];
  /**
   * Pre-computed turn-level Shapley attributions, keyed by scenarioName →
   * dimensionId (explainability Phase 2, baked statically into the HTML report).
   * Optional and gated — populated only when REPORT_EXPLAIN_TURNS is enabled.
   */
  explanations?: Record<string, Record<string, TurnShapleyExplanation>>;
}

export class ReportGenerator {
  constructor(private readonly reportsDir: string = appPaths.reportsDir) {}

  generate(data: ReportData): { htmlPath: string; jsonPath: string } {
    mkdirSync(this.reportsDir, { recursive: true });
    const ts = data.generatedAt.replace(/[:.]/g, '-').slice(0, 19);
    const baseName = `report_${ts}`;

    const jsonPath = join(this.reportsDir, `${baseName}.json`);
    writeFileSync(jsonPath, JSON.stringify(data, null, 2));

    const htmlPath = join(this.reportsDir, `${baseName}.html`);
    writeFileSync(htmlPath, this.renderHtml(data));

    console.log(`\n  📊 Report saved:`);
    console.log(`     JSON: ${jsonPath}`);
    console.log(`     HTML: ${htmlPath}`);

    return { htmlPath, jsonPath };
  }

  private renderHtml(data: ReportData): string {
    const { transcripts, results } = data;
    const providers = Array.from(
      new Set(transcripts.map((t) => t.provider ?? 'unknown')),
    );

    const overallAvg =
      results.length > 0
        ? results.reduce((a, b) => a + b.overallScore, 0) / results.length
        : 0;

    const passCount = results.filter((r) => r.passed).length;
    const failCount = results.length - passCount;

    const scenarioRows = results
      .map((r) => {
        const t = transcripts.find((t) => t.id === r.runId);
        const channel = t?.channel ?? 'unknown';
        const provider = t?.provider ?? 'unknown';
        const turns = t?.turns.length ?? 0;
        const statusIcon = r.passed ? '✅' : '❌';
        return `
        <tr>
          <td>${r.scenarioName}</td>
          <td>${provider}</td>
          <td>${channel}</td>
          <td>${turns}</td>
          <td class="${r.passed ? 'pass' : 'fail'}">${statusIcon} ${r.overallScore.toFixed(1)}/10</td>
          <td>${r.summary}</td>
        </tr>`;
      })
      .join('');

    const dimTable = this.renderDimensionTable(results, data.explanations);
    const committeeSection = this.renderJudgeConsensus(results);
    const transcriptCards = this.renderTranscriptCards(transcripts);

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>ARIA Evaluation Report — ${data.generatedAt.slice(0, 10)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           background: #f5f7fa; color: #2d3748; }
    .header { background: #0D2A66; color: white; padding: 24px 32px; }
    .header h1 { font-size: 24px; }
    .header p  { opacity: .8; margin-top: 4px; font-size: 14px; }
    .container { max-width: 1200px; margin: 0 auto; padding: 24px 32px; }
    .summary-cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 32px; }
    .card { background: white; border-radius: 8px; padding: 20px; box-shadow: 0 1px 4px rgba(0,0,0,.08); }
    .card .label { font-size: 12px; color: #718096; text-transform: uppercase; letter-spacing: .05em; }
    .card .value { font-size: 32px; font-weight: 700; margin-top: 8px; }
    .card.pass .value { color: #38a169; }
    .card.fail .value { color: #e53e3e; }
    .card.score .value { color: #0D2A66; }
    section { background: white; border-radius: 8px; box-shadow: 0 1px 4px rgba(0,0,0,.08);
               padding: 24px; margin-bottom: 24px; }
    h2 { font-size: 18px; margin-bottom: 16px; color: #1a202c; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; font-size: 12px; font-weight: 600; color: #718096;
         text-transform: uppercase; padding: 8px 12px; border-bottom: 2px solid #e2e8f0; }
    td { padding: 10px 12px; border-bottom: 1px solid #edf2f7; font-size: 14px; }
    tr:last-child td { border-bottom: none; }
    .pass { color: #38a169; font-weight: 600; }
    .fail { color: #e53e3e; font-weight: 600; }
    .transcript-card { background: #f7fafc; border: 1px solid #e2e8f0; border-radius: 6px;
                        padding: 16px; margin-bottom: 12px; }
    .transcript-card h3 { font-size: 14px; margin-bottom: 12px; color: #2d3748; }
    .turn { display: flex; gap: 10px; margin-bottom: 8px; }
    .turn .role { font-size: 11px; font-weight: 700; width: 70px; flex-shrink: 0;
                   padding-top: 2px; }
    .turn.customer .role { color: #0D2A66; }
    .turn.agent .role { color: #718096; }
    .turn .text { font-size: 13px; line-height: 1.5; }
    .score-bar { background: #e2e8f0; border-radius: 4px; height: 8px; margin-top: 4px; }
    .score-bar-fill { height: 8px; border-radius: 4px; }
    .fill-pass { background: #38a169; }
    .fill-fail { background: #e53e3e; }
    .score-pass { font-weight: 700; color: #38a169; }
    .score-fail { font-weight: 700; color: #e53e3e; }
    .committee-intro { font-size: 13px; color: #718096; margin-bottom: 16px; }
    .committee-block { background: #f7fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 14px 16px; margin-bottom: 16px; }
    .committee-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; gap: 12px; }
    .committee-scenario { font-weight: 600; font-size: 14px; color: #2d3748; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .committee-consensus { font-size: 13px; font-weight: 700; padding: 2px 10px; border-radius: 999px; background: #edf2f7; flex-shrink: 0; }
    .committee-consensus.pass { color: #38a169; } .committee-consensus.fail { color: #e53e3e; }
    .committee-table { width: 100%; border-collapse: collapse; background: white; border-radius: 6px; overflow: hidden; }
    .committee-table th { font-size: 11px; padding: 6px 12px; }
    .committee-table td { font-size: 13px; padding: 7px 12px; }
    .judge-model { color: #718096; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
    .committee-summary-row td { border-top: 2px solid #e2e8f0; background: #f7fafc; }
    .committee-disagree { font-size: 12px; color: #b7791f; margin-top: 8px; }
    .committee-why { margin-top: 10px; border-top: 1px solid #e2e8f0; padding-top: 8px; }
    .committee-why > summary { font-size: 12px; font-weight: 600; color: #4a6fa5; cursor: pointer; user-select: none; }
    .committee-why > summary:hover { text-decoration: underline; }
    .committee-why-body { margin-top: 10px; }
    .why-dim { margin-bottom: 12px; }
    .why-dim-head { font-size: 13px; color: #2d3748; text-transform: capitalize; margin-bottom: 4px; }
    .why-disagree { color: #b7791f; font-weight: 600; font-size: 11px; text-transform: none; margin-left: 4px; }
    .why-votes { list-style: none; margin: 0; padding: 0; }
    .why-votes li { font-size: 12px; line-height: 1.5; color: #4a5568; padding: 3px 0 3px 10px; border-left: 2px solid #e2e8f0; margin-bottom: 3px; }
    .why-judge { font-weight: 600; color: #2d3748; }
    .why-vote { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 600; margin: 0 4px; }
    .dim-table { width: 100%; border-collapse: collapse; }
    .dim-category { width: 160px; color: #718096; font-size: 13px; font-weight: 600; padding: 12px; border-bottom: 1px solid #edf2f7; vertical-align: top; }
    .dim-description { padding: 12px; border-bottom: 1px solid #edf2f7; }
    .dim-score { width: 100px; padding: 12px; border-bottom: 1px solid #edf2f7; vertical-align: top; }
    .dim-details { margin-top: 6px; }
    .dim-summary { font-size: 12px; color: #4a6fa5; cursor: pointer; user-select: none; display: inline-block; }
    .dim-summary:hover { text-decoration: underline; }
    .dim-detail-body { margin-top: 8px; font-size: 13px; }
    .scenario-block { padding: 10px 12px; background: #f7fafc; border-left: 3px solid #cbd5e0; border-radius: 0 4px 4px 0; margin-bottom: 8px; }
    .scenario-block.low-scorer { background: #fff8f0; border-left-color: #ed8936; }
    .scenario-block.failing { background: #fff5f5; border-left-color: #e53e3e; }
    .scenario-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; gap: 8px; }
    .scenario-name { font-weight: 600; color: #2d3748; font-size: 13px; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .scenario-score-badge { font-size: 12px; font-weight: 700; padding: 2px 8px; border-radius: 12px; white-space: nowrap; flex-shrink: 0; }
    .badge-pass { background: #c6f6d5; color: #276749; }
    .badge-warn { background: #feebc8; color: #7b341e; }
    .badge-fail { background: #fed7d7; color: #9b2c2c; }
    .low-flag { font-size: 11px; color: #ed8936; font-weight: 600; margin-left: 4px; }
    .score-gap-block { margin: 6px 0 8px 0; padding: 7px 10px; background: #fffaf0; border: 1px solid #f6ad55; border-radius: 4px; font-size: 12px; color: #744210; display: flex; gap: 6px; align-items: flex-start; }
    .score-gap-icon { font-size: 13px; flex-shrink: 0; margin-top: 1px; }
    .score-gap-text { line-height: 1.5; }
    .score-gap-text strong { color: #c05621; }
    .score-interp { margin-top: 3px; color: #7b341e; font-style: italic; }
    .score-gap-why { margin-top: 4px; color: #744210; }
    .reasoning-block ul { margin: 4px 0 8px 16px; padding: 0; }
    .reasoning-block li { margin-bottom: 4px; line-height: 1.5; color: #2d3748; }
    .evidence-block { margin-top: 8px; }
    .evidence-label { display: block; font-size: 11px; font-weight: 700; color: #718096; text-transform: uppercase; letter-spacing: .04em; margin-bottom: 4px; }
    .evidence-quote { background: #fff; border: 1px solid #e2e8f0; border-radius: 4px; padding: 6px 10px; font-family: 'SF Mono', Consolas, monospace; font-size: 12px; color: #4a5568; margin-bottom: 4px; white-space: pre-wrap; word-break: break-word; }
    /* Risk insights — bias / hallucination reasons + improvement suggestions */
    .risk-block { margin-top: 8px; border-radius: 6px; padding: 8px 12px; border: 1px solid; }
    .risk-high { background: #fff5f5; border-color: #fc8181; color: #9b2c2c; }
    .risk-medium { background: #fffaf0; border-color: #f6ad55; color: #9c4221; }
    .risk-low { background: #fffff0; border-color: #ecc94b; color: #975a16; }
    .risk-head { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; }
    .risk-sev { font-size: 9px; font-weight: 600; background: rgba(255,255,255,.6); border-radius: 3px; padding: 1px 4px; margin-left: 6px; }
    .risk-sub { font-size: 10px; font-weight: 700; text-transform: uppercase; opacity: .7; margin: 6px 0 2px; }
    .risk-block ul { margin: 0 0 0 16px; padding: 0; }
    .risk-block li { font-size: 12px; line-height: 1.5; margin-bottom: 2px; }
    .risk-quote { font-style: italic; font-size: 11px; opacity: .85; border-left: 2px solid currentColor; padding-left: 8px; margin-top: 4px; }
    /* Explainability — per-turn contributions (Phase 1) + turn Shapley (Phase 2) */
    .turn-attrib { margin-top: 8px; background: #fff; border: 1px solid #e2e8f0; border-radius: 4px; padding: 10px 12px; }
    .ta-title { font-size: 12px; font-weight: 700; color: #2d3748; margin-bottom: 4px; }
    .ta-body { font-size: 11px; line-height: 1.5; color: #718096; margin-bottom: 8px; }
    .ta-body strong { color: #2d3748; }
    .ta-legend { display: flex; gap: 14px; font-size: 10px; color: #a0aec0; margin-bottom: 8px; }
    .ta-key { display: inline-flex; align-items: center; gap: 5px; }
    .ta-swatch { width: 10px; height: 8px; border-radius: 2px; display: inline-block; }
    .ta-swatch.good { background: #38a169; } .ta-swatch.bad { background: #e53e3e; }
    .ta-item { margin-bottom: 7px; }
    .ta-preview { font-size: 10px; color: #a0aec0; font-style: italic; padding-left: 76px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 2px; }
    .ta-foot { font-size: 9px; color: #a0aec0; margin-top: 8px; border-top: 1px solid #edf2f7; padding-top: 6px; }
    .tb-row { display: flex; align-items: center; gap: 8px; }
    .tb-name { font-size: 10px; color: #718096; width: 68px; flex-shrink: 0; }
    .tb-track { flex: 1; height: 9px; background: #edf2f7; border-radius: 5px; overflow: hidden; }
    .tb-fill { display: block; height: 9px; border-radius: 5px; }
    .tb-fill.good { background: #38a169; } .tb-fill.mid { background: #dd6b20; } .tb-fill.bad { background: #e53e3e; }
    .tb-val { font-size: 10px; font-family: ui-monospace, Menlo, monospace; font-weight: 700; width: 56px; text-align: right; flex-shrink: 0; color: #4a5568; }
    .tb-val.pos { color: #2f855a; } .tb-val.neg { color: #c53030; }
  </style>
</head>
<body>
<div class="header">
  <h1>ARIA Evaluation Report</h1>
  <p>Generated ${data.generatedAt} · Run ID: ${data.runId} · Provider(s): ${providers.join(', ')}</p>
</div>
<div class="container">

  <div class="summary-cards">
    <div class="card score">
      <div class="label">Overall Score</div>
      <div class="value">${overallAvg.toFixed(1)}</div>
    </div>
    <div class="card">
      <div class="label">Scenarios Run</div>
      <div class="value">${results.length}</div>
    </div>
    <div class="card pass">
      <div class="label">Passed</div>
      <div class="value">${passCount}</div>
    </div>
    <div class="card fail">
      <div class="label">Failed</div>
      <div class="value">${failCount}</div>
    </div>
  </div>

  <section>
    <h2>Scenario Results</h2>
    <table>
      <thead><tr><th>Scenario</th><th>Provider</th><th>Channel</th><th>Turns</th><th>Score</th><th>Summary</th></tr></thead>
      <tbody>${scenarioRows}</tbody>
    </table>
  </section>

  <section>
    <h2>Dimension Scores</h2>
    ${dimTable}
  </section>

  ${committeeSection}

  <section>
    <h2>Conversation Transcripts</h2>
    ${transcriptCards}
  </section>

</div>
</body>
</html>`;
  }

  private scoreInterpretation(score: number): string {
    if (score >= 9.5) return 'Excellent — near-perfect performance across the board';
    if (score >= 9.0) return 'Very good — strong performance; the 1-point gap reflects a subtle area the judge detected but did not describe explicitly in the justification';
    if (score >= 8.0) return 'Good — solid performance with some identifiable gaps';
    if (score >= 7.0) return 'Acceptable — meets the passing threshold but notable areas need improvement';
    if (score >= 6.0) return 'Borderline — passing, but significant weaknesses present';
    return 'Failing — critical issues detected';
  }

  /** Per-judge scores and the committee consensus, for multi-judge runs. */
  private renderJudgeConsensus(results: EvalResult[]): string {
    const committeeResults = results.filter((r) =>
      Object.values(r.dimensionScores).some((d) => (d.judgeVotes?.length ?? 0) > 1),
    );
    if (committeeResults.length === 0) return '';

    const blocks = committeeResults
      .map((r) => {
        // Each judge's mean score across the dimensions they voted on.
        const perJudge = new Map<string, { provider: string; modelId: string; total: number; count: number }>();
        for (const ds of Object.values(r.dimensionScores)) {
          for (const v of ds.judgeVotes ?? []) {
            const cur = perJudge.get(v.judgeId) ?? { provider: v.provider, modelId: v.modelId, total: 0, count: 0 };
            cur.total += v.score;
            cur.count += 1;
            perJudge.set(v.judgeId, cur);
          }
        }
        const judgeRows = [...perJudge.entries()]
          .map(([id, j]) => {
            const avg = j.count > 0 ? j.total / j.count : 0;
            return `<tr>
              <td><strong>${escapeHtml(id)}</strong></td>
              <td class="judge-model">${escapeHtml(j.provider)}:${escapeHtml(j.modelId)}</td>
              <td class="${avg >= 6 ? 'pass' : 'fail'}">${avg.toFixed(1)}/10</td>
            </tr>`;
          })
          .join('');
        const agreementPct = r.judgeAgreement != null ? `${Math.round(r.judgeAgreement * 100)}%` : '—';
        const disagreedCount = Object.values(r.dimensionScores).filter((d) => d.disagreement).length;

        // "Why these scores" — each judge's reasoning per dimension (the data the
        // per-judge averages summarise). Collapsed by default to keep the table scannable.
        const whyDims = Object.entries(r.dimensionScores)
          .filter(([, ds]) => (ds.judgeVotes?.length ?? 0) > 1)
          .map(([dimId, ds]) => {
            const voteItems = (ds.judgeVotes ?? [])
              .map((v) => `<li><span class="why-judge">${escapeHtml(v.judgeId)}</span> <span class="why-vote ${v.score >= 6 ? 'pass' : 'fail'}">${v.score.toFixed(1)}/10</span>${v.justification ? ` — ${escapeHtml(v.justification)}` : ''}</li>`)
              .join('');
            return `<div class="why-dim">
              <div class="why-dim-head"><strong>${escapeHtml(dimId.replace(/_/g, ' '))}</strong> · consensus ${ds.score.toFixed(1)}/10${ds.disagreement ? ' <span class="why-disagree">⚠ judges disagreed</span>' : ''}</div>
              <ul class="why-votes">${voteItems}</ul>
            </div>`;
          })
          .join('');
        const whyBlock = whyDims
          ? `<details class="committee-why"><summary>Why these scores — each judge's reasoning per dimension</summary><div class="committee-why-body">${whyDims}</div></details>`
          : '';

        return `
      <div class="committee-block">
        <div class="committee-head">
          <span class="committee-scenario" title="${escapeHtml(r.scenarioName)}">${escapeHtml(r.scenarioName)}</span>
          <span class="committee-consensus ${r.passed ? 'pass' : 'fail'}">Consensus ${r.overallScore.toFixed(1)}/10</span>
        </div>
        <table class="committee-table">
          <thead><tr><th>Judge</th><th>Model</th><th>Avg score</th></tr></thead>
          <tbody>
            ${judgeRows}
            <tr class="committee-summary-row">
              <td><strong>Consensus (mean)</strong></td>
              <td class="judge-model" title="How closely the judges' scores matched on the dimensions that drive the verdict — independent of the score itself.">agreement ${agreementPct}</td>
              <td class="${r.passed ? 'pass' : 'fail'}"><strong>${r.overallScore.toFixed(1)}/10</strong></td>
            </tr>
          </tbody>
        </table>
        ${disagreedCount > 0 ? `<p class="committee-disagree">⚠ Judges disagreed beyond threshold on ${disagreedCount} dimension${disagreedCount === 1 ? '' : 's'}.</p>` : ''}
        ${whyBlock}
      </div>`;
      })
      .join('');

    return `
  <section>
    <h2>Judge Committee — per-judge scores &amp; consensus</h2>
    <p class="committee-intro">Each committee member's mean score across dimensions, and the consensus those votes aggregated into. <strong>Agreement</strong> is how closely the judges' scores matched on the dimensions that drive the verdict (for security scenarios, the guardrail / prompt-injection / bias core) — it's separate from the score, so a unanimous 10/10 reads as 100% agreement. Expand <em>Why these scores</em> under a scenario for each judge's reasoning.</p>
    ${blocks}
  </section>`;
  }

  /** Phase 1: per-agent-turn scores that were averaged into a TRACE dimension. */
  private renderTurnContribBars(contributions: TurnContribution[]): string {
    const rows = contributions
      .map((c) => {
        const cls = c.score >= 7 ? 'good' : c.score >= 5 ? 'mid' : 'bad';
        return `<div class="ta-item"><div class="tb-row">
          <span class="tb-name">Turn ${c.turnIndex}</span>
          <span class="tb-track"><span class="tb-fill ${cls}" style="width:${Math.max(2, c.score * 10)}%"></span></span>
          <span class="tb-val">${c.score}/10</span>
        </div></div>`;
      })
      .join('');
    return `<div class="turn-attrib">
      <div class="ta-title">Score per agent turn</div>
      <div class="ta-body">Each agent turn's own score for this dimension — these are averaged into the score above.</div>
      ${rows}
    </div>`;
  }

  /**
   * Phase 2: pre-computed turn-level Shapley attribution. Each bar is a turn's
   * share of the score swing from "all agent turns removed" (baseline) to the
   * full conversation; green raised the score, red lowered it.
   */
  private renderShapleyBars(exp: TurnShapleyExplanation): string {
    const maxAbs = Math.max(0.01, ...exp.turns.map((t) => Math.abs(t.value)));
    const delta = (exp.fullScore - exp.baselineScore).toFixed(1);
    const dimLabel = exp.dimensionId.replace(/_/g, ' ');
    const isSecurity = exp.dimensionId === 'guardrail_compliance' || exp.dimensionId === 'prompt_injection_resistance';
    const rows = [...exp.turns]
      .sort((a, b) => a.turnIndex - b.turnIndex)
      .map((t) => {
        const positive = t.value >= 0;
        const widthPct = Math.max(3, (Math.abs(t.value) / maxAbs) * 100);
        const role = t.role === 'agent' ? 'agent' : 'cust';
        const preview = t.contentPreview ? `<div class="ta-preview">“${escapeHtml(t.contentPreview)}”</div>` : '';
        return `<div class="ta-item">
          <div class="tb-row">
            <span class="tb-name">Turn ${t.turnIndex} · ${role}</span>
            <span class="tb-track"><span class="tb-fill ${positive ? 'good' : 'bad'}" style="width:${widthPct}%"></span></span>
            <span class="tb-val ${positive ? 'pos' : 'neg'}">${positive ? '+' : ''}${t.value.toFixed(1)} pts</span>
          </div>
          ${preview}
        </div>`;
      })
      .join('');
    const note = `${exp.exact ? 'exact' : 'sampled'} · ${exp.coalitionsEvaluated} re-scores · ${escapeHtml(exp.judgeModel.split('.').pop() ?? exp.judgeModel)}`;
    const securityNote = isSecurity ? ' — how much that response helped hold the guardrail' : '';
    return `<div class="turn-attrib">
      <div class="ta-title">Which turns drove the ${escapeHtml(dimLabel)} score?</div>
      <div class="ta-body">Re-scoring the conversation with each agent turn removed gives a baseline of <strong>${exp.baselineScore}/10</strong>; the full conversation scores <strong>${exp.fullScore}/10</strong>. Each bar is that turn's share of the ${delta}-point difference${securityNote}.</div>
      <div class="ta-legend"><span class="ta-key"><span class="ta-swatch good"></span>raised the score</span><span class="ta-key"><span class="ta-swatch bad"></span>lowered the score</span></div>
      ${rows}
      <div class="ta-foot">Contributions sum to the ${delta}-pt change · ${note} · approximate, complements the judge's rationale</div>
    </div>`;
  }

  /** Render a bias/hallucination risk insight: reasons flagged + how to improve. */
  private renderRiskInsight(insight: RiskInsight): string {
    if (!insight.detected || (insight.reasons.length === 0 && insight.suggestions.length === 0)) return '';
    const label = insight.category === 'bias' ? 'Bias' : 'Hallucination';
    const sevClass = insight.severity === 'high' ? 'risk-high' : insight.severity === 'low' ? 'risk-low' : 'risk-medium';
    const reasons = insight.reasons.length
      ? `<div class="risk-sub">Why flagged</div><ul>${insight.reasons.map((r) => `<li>${escapeHtml(r)}</li>`).join('')}</ul>`
      : '';
    const suggestions = insight.suggestions.length
      ? `<div class="risk-sub">How to improve</div><ul>${insight.suggestions.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ul>`
      : '';
    const quotes = (insight.evidenceQuotes ?? [])
      .map((q) => `<div class="risk-quote">${escapeHtml(q)}</div>`)
      .join('');
    return `<div class="risk-block ${sevClass}">
      <div class="risk-head">⚠ ${label} risk<span class="risk-sev">${escapeHtml(insight.severity)}</span></div>
      ${reasons}
      ${suggestions}
      ${quotes}
    </div>`;
  }

  private renderDimensionTable(
    results: EvalResult[],
    explanations?: Record<string, Record<string, TurnShapleyExplanation>>,
  ): string {
    if (results.length === 0) return '<p>No results.</p>';

    const allDimIds = new Set<string>();
    for (const r of results) {
      for (const id of Object.keys(r.dimensionScores)) allDimIds.add(id);
    }

    const rows = Array.from(allDimIds)
      .map((dimId) => {
        const dim = ALL_DIMENSIONS_BY_ID[dimId];
        // Pair each score with its originating result so we can show scenario name + per-scenario score.
        const dimScoresWithResult = results.flatMap((r) =>
          r.dimensionScores[dimId] ? [{ ds: r.dimensionScores[dimId]!, result: r }] : [],
        );
        const numericScores = dimScoresWithResult.map((d) => d.ds.score);
        const avg = numericScores.length > 0 ? numericScores.reduce((a, b) => a + b, 0) / numericScores.length : 0;
        const pct = (avg / 10) * 100;
        const passing = avg >= 6;
        const scoreClass = passing ? 'score-pass' : 'score-fail';
        const minScore = numericScores.length > 0 ? Math.min(...numericScores) : 0;

        // Build per-scenario justification blocks with score badges and low-score highlighting.
        const detailBlocks = dimScoresWithResult
          .map(({ ds, result }, i) => {
            const scenarioScore = ds.score;
            const isFailing = scenarioScore < 6;
            const isLow = !isFailing && scenarioScore < avg && numericScores.length > 1;
            const isLowest = scenarioScore === minScore && numericScores.length > 1 && scenarioScore < avg;

            const blockClass = isFailing ? 'failing' : isLow ? 'low-scorer' : '';
            const badgeClass = isFailing ? 'badge-fail' : isLow ? 'badge-warn' : 'badge-pass';
            const gapFromPerfect = (10 - scenarioScore).toFixed(1);
            const gapFromAvg = (avg - scenarioScore).toFixed(1);
            const lowFlag = isLowest ? `<span class="low-flag">↓ −${gapFromAvg} below avg</span>` : '';

            const scenarioName = result.scenarioName ?? `Scenario ${i + 1}`;
            const scenarioLabel = dimScoresWithResult.length > 1
              ? `<div class="scenario-header">
                   <span class="scenario-name" title="${escapeHtml(scenarioName)}">${escapeHtml(scenarioName)}</span>
                   <span class="scenario-score-badge ${badgeClass}">${scenarioScore.toFixed(1)}/10${lowFlag}</span>
                 </div>`
              : '';

            // Gap analysis block for amber/failing scenarios — explains the deduction explicitly
            const gapBlock = (isLow || isFailing)
              ? (() => {
                  const gapDetail = ds.gap
                    ? `<div class="score-gap-why"><strong>Why not 10/10:</strong> ${escapeHtml(ds.gap)}</div>`
                    : `<div class="score-interp">${escapeHtml(this.scoreInterpretation(scenarioScore))}</div>`;
                  return `<div class="score-gap-block">
                   <span class="score-gap-icon">ℹ️</span>
                   <div class="score-gap-text">
                     <strong>${scenarioScore.toFixed(1)}/10 — ${gapFromPerfect} point${parseFloat(gapFromPerfect) !== 1 ? 's' : ''} below perfect${numericScores.length > 1 ? `, ${gapFromAvg} below group average (${avg.toFixed(1)}/10)` : ''}</strong>
                     ${gapDetail}
                   </div>
                 </div>`;
                })()
              : '';

            const justLines = ds.justification
              ? ds.justification.split(' | ').map((line) => `<li>${escapeHtml(line)}</li>`).join('')
              : '';
            const evidenceLines = ds.evidence
              ? ds.evidence.split('\n').map((line) => `<div class="evidence-quote">${escapeHtml(line)}</div>`).join('')
              : '';
            const riskBlock = ds.riskInsight ? this.renderRiskInsight(ds.riskInsight) : '';

            // Explainability: per-turn contributions (Phase 1) + baked Shapley (Phase 2).
            const turnBars = (ds.turnContributions?.length ?? 0) > 1
              ? this.renderTurnContribBars(ds.turnContributions!)
              : '';
            const shap = explanations?.[result.scenarioName]?.[dimId];
            const shapBars = shap ? this.renderShapleyBars(shap) : '';

            return `<div class="scenario-block ${blockClass}">
                ${scenarioLabel}
                ${gapBlock}
                ${justLines ? `<div class="reasoning-block"><ul>${justLines}</ul></div>` : ''}
                ${evidenceLines ? `<div class="evidence-block"><span class="evidence-label">📎 Evidence</span>${evidenceLines}</div>` : ''}
                ${riskBlock}
                ${turnBars}
                ${shapBars}
              </div>`;
          })
          .join('');

        return `
        <tr class="dim-row">
          <td class="dim-category">${dim?.category ?? 'Other'}</td>
          <td class="dim-description">
            <div>${dim?.description ?? dimId}</div>
            <details class="dim-details">
              <summary class="dim-summary">Why this score?</summary>
              <div class="dim-detail-body">${detailBlocks || '<div class="scenario-block"><p>No detail available.</p></div>'}</div>
            </details>
          </td>
          <td class="dim-score">
            <div class="${scoreClass}">${avg.toFixed(1)}/10</div>
            <div class="score-bar"><div class="score-bar-fill ${passing ? 'fill-pass' : 'fill-fail'}" style="width:${pct}%"></div></div>
          </td>
        </tr>`;
      })
      .join('');

    return `<table class="dim-table">
      <thead><tr><th>Category</th><th>Dimension</th><th>Score</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }

  private renderTranscriptCards(transcripts: Transcript[]): string {
    return transcripts
      .map((t) => {
        const turns = t.turns
          .map(
            (turn) => `
          <div class="turn ${turn.role}">
            <div class="role">${turn.role === 'customer' ? '👤 You' : '🤖 Agent'}</div>
            <div class="text">${escapeHtml(turn.content)}</div>
          </div>`,
          )
          .join('');

        return `
        <div class="transcript-card">
          <h3>📋 ${escapeHtml(t.scenarioName)} <small style="color:#718096">[${t.provider ?? 'unknown'} · ${t.channel}]</small></h3>
          ${turns}
          ${t.error && !isInfrastructureError(t.error) ? `<p style="color:#e53e3e;margin-top:8px">⚠ Error: ${escapeHtml(t.error)}</p>` : ''}
        </div>`;
      })
      .join('');
  }
}

/**
 * Provider/infrastructure failures (Bedrock model-invocation errors, throttling,
 * auth, quota, timeouts) are platform issues, not evaluation signal. We never
 * surface their raw SDK text in the report: it's noise to the reader and can leak
 * internal model IDs / ARNs. Genuine run-ending reasons (e.g. session ended) still
 * render. The correct response to one of these is to fix it at the source, not to
 * show it to a report consumer.
 */
function isInfrastructureError(message: string): boolean {
  const m = message.toLowerCase();
  return [
    'invocation of model id',
    'inference profile',
    'on-demand throughput',
    'throttlingexception',
    'too many requests',
    'accessdeniedexception',
    'validationexception',
    'serviceunavailable',
    'service unavailable',
    'resourcenotfoundexception',
    'modeltimeoutexception',
    'modelnotready',
    'modelerrorexception',
    'expiredtoken',
    'could not load credentials',
    'security token',
    'bedrock',
  ].some((needle) => m.includes(needle));
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
