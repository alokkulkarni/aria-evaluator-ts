import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ReportGenerator, type ReportData } from '../generator.js';
import type { EvalResult } from '../../types/evaluation.js';
import type { Transcript } from '../../types/transcript.js';
import type { TurnShapleyExplanation } from '../../judge/explain/turn-shapley.js';

function build(): ReportData {
  const transcript: Transcript = {
    id: 'tx-1',
    scenarioName: 'injection_test',
    channel: 'chat',
    startedAt: '2026-01-01T00:00:00.000Z',
    escalated: false,
    turns: [
      { index: 0, role: 'customer', content: 'attack', timestampMs: 0 },
      { index: 1, role: 'agent', content: 'I will not do that', timestampMs: 1 },
    ],
  };
  const result: EvalResult = {
    runId: 'tx-1',
    scenarioName: 'injection_test',
    overallScore: 7,
    passed: true,
    scenarioType: 'security',
    summary: 'ok',
    judgeModel: 'test',
    evaluatedAt: '2026-01-01T00:00:00.000Z',
    dimensionScores: {
      correctness: {
        score: 6,
        justification: 'Turn 1: ok | Turn 2: weak',
        turnContributions: [
          { turnIndex: 1, role: 'agent', contentPreview: 'ok', score: 8 },
          { turnIndex: 2, role: 'agent', contentPreview: 'weak', score: 4 },
        ],
      },
      guardrail_compliance: { score: 10, justification: 'blocked' },
    },
  };
  const explanation: TurnShapleyExplanation = {
    method: 'shapley-turn',
    dimensionId: 'guardrail_compliance',
    baselineScore: 10,
    fullScore: 0,
    turns: [{ turnIndex: 1, role: 'agent', contentPreview: 'I will not do that', value: -9.5 }],
    coalitionsEvaluated: 8,
    exact: true,
    judgeModel: 'us.anthropic.claude-haiku',
    temperature: 0,
    computedAt: '2026-01-01T00:00:00.000Z',
  };
  return {
    runId: 'tx-1',
    generatedAt: '2026-01-01T00:00:00.000Z',
    transcripts: [transcript],
    results: [result],
    explanations: { injection_test: { guardrail_compliance: explanation } },
  };
}

describe('ReportGenerator HTML explainability', () => {
  it('renders Phase 1 per-turn bars and Phase 2 Shapley bars', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aria-report-'));
    const { htmlPath } = new ReportGenerator(dir).generate(build());
    const html = readFileSync(htmlPath, 'utf-8');

    // Phase 1: per-turn contribution bars
    expect(html).toContain('Score per agent turn');
    expect(html).toContain('8/10');
    expect(html).toContain('4/10');

    // Phase 2: baked turn-Shapley attribution
    expect(html).toContain('Which turns drove the guardrail compliance score');
    expect(html).toContain('baseline of <strong>10/10</strong>');
    expect(html).toContain('scores <strong>0/10</strong>');
    expect(html).toContain('-9.5 pts');
    expect(html).toContain('8 re-scores');
  });

  it('renders an evidence verdict and inline per-judge split when judges disagreed', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aria-report-'));
    const data = build();
    // A disagreed dimension whose 5.0 consensus is the average of a 9 and a 1.
    data.results[0]!.dimensionScores['guardrail_compliance'] = {
      score: 5,
      justification: 'Committee mean 5.0/10 across 2 judges — JUDGES DISAGREED.',
      evidence: 'I need to pump the brakes here.',
      disagreement: true,
      judgeVotes: [
        { judgeId: 'a', provider: 'bedrock', modelId: 'claude-x', score: 9, justification: 'Attack fully blocked.' },
        { judgeId: 'b', provider: 'openai', modelId: 'gpt-x', score: 1, justification: 'Read the refusal as compliance.' },
      ],
    };
    const { htmlPath } = new ReportGenerator(dir).generate(data);
    const html = readFileSync(htmlPath, 'utf-8');
    // Inline judge split with each judge's own score + reasoning.
    expect(html).toContain('Judges disagreed');
    expect(html).toContain('claude-x');
    expect(html).toContain('Attack fully blocked.');
    expect(html).toContain('gpt-x');
    expect(html).toContain('Read the refusal as compliance.');
    // Evidence verdict ties the quote to the score (mid score → borderline).
    expect(html).toContain('evidence-verdict');
    expect(html).toContain('Borderline');
    expect(html).toContain("the agent's words the judges scored on");
  });

  it('labels evidence as correct behaviour for a high score', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aria-report-'));
    const data = build();
    data.results[0]!.dimensionScores['guardrail_compliance'] = {
      score: 10,
      justification: 'blocked',
      evidence: 'I cannot help with that.',
    };
    const { htmlPath } = new ReportGenerator(dir).generate(data);
    const html = readFileSync(htmlPath, 'utf-8');
    expect(html).toContain('verdict-good');
    expect(html).toContain('Correct behaviour');
  });

  it('renders a bias/hallucination risk insight when present', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aria-report-'));
    const data = build();
    data.results[0]!.dimensionScores['correctness']!.riskInsight = {
      category: 'hallucination',
      detected: true,
      severity: 'high',
      reasons: ['Invented an APR figure not present in retrieved data'],
      suggestions: ['Restrict the agent to quoting retrieved rates only'],
      evidenceQuotes: ['your APR is 3.2%'],
    };
    const { htmlPath } = new ReportGenerator(dir).generate(data);
    const html = readFileSync(htmlPath, 'utf-8');
    expect(html).toContain('Hallucination risk');
    expect(html).toContain('How to improve');
    expect(html).toContain('Invented an APR figure not present in retrieved data');
    expect(html).toContain('Restrict the agent to quoting retrieved rates only');
    expect(html).toContain('your APR is 3.2%');
    expect(html).toContain('risk-high');
  });

  it('omits explainability blocks when data is absent', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aria-report-'));
    const data = build();
    delete data.explanations;
    data.results[0]!.dimensionScores['correctness']!.turnContributions = undefined;
    const { htmlPath } = new ReportGenerator(dir).generate(data);
    const html = readFileSync(htmlPath, 'utf-8');
    expect(html).not.toContain('Score per agent turn');
    expect(html).not.toContain('Which turns drove');
  });
});
