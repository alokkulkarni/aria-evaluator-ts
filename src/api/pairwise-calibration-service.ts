// src/api/pairwise-calibration-service.ts
// Pairwise calibration: have each active committee judge compare response A vs B
// for every imported item, then measure agreement with the human vote (e.g.
// LMSYS Chatbot Arena). Distinct from the absolute per-dimension κ track.

import { prisma } from '../db/client.js';
import { availableProviders } from '../judge/providers/factory.js';
import { judgePairwise } from '../judge/pairwise-judge.js';
import { pairwiseAgreement, type PairwiseChoice } from '../lib/calibration.js';
import { getJudgeCommitteeConfig } from './runtime-settings.js';

/**
 * Run the active committee over every item in a pairwise dataset, store each
 * judge's verdict, and (re)compute per-judge agreement with the human vote.
 * Makes real judge LLM calls — run it in the background, not inline with HTTP.
 */
export async function runPairwiseCalibration(
  datasetId: string,
): Promise<{ judges: number; items: number; verdicts: number }> {
  const items = await prisma.pairwiseItem.findMany({ where: { datasetId } });
  const committee = getJudgeCommitteeConfig();
  const ap = availableProviders();
  const specs = committee.judges.filter((j) => ap.has(j.provider));

  const buckets = new Map<string, { provider: string; modelId: string; pairs: [PairwiseChoice, PairwiseChoice][] }>();
  let verdicts = 0;

  for (const item of items) {
    // Deliberately NOT the committee's absolute-scoring system prompt — judgePairwise
    // uses a dedicated pairwise prompt.
    const results = await judgePairwise(item.prompt, item.responseA, item.responseB, specs);
    for (const r of results) {
      await prisma.pairwiseVerdict.upsert({
        where: { itemId_judgeModelId: { itemId: item.id, judgeModelId: r.modelId } },
        update: { preferred: r.preferred, reason: r.reason, judgeProvider: r.provider },
        create: {
          itemId: item.id,
          judgeProvider: r.provider,
          judgeModelId: r.modelId,
          preferred: r.preferred,
          reason: r.reason,
        },
      });
      verdicts++;
      let b = buckets.get(r.modelId);
      if (!b) {
        b = { provider: r.provider, modelId: r.modelId, pairs: [] };
        buckets.set(r.modelId, b);
      }
      b.pairs.push([r.preferred, item.humanWinner as PairwiseChoice]);
    }
  }

  await prisma.pairwiseCalibration.deleteMany({ where: { datasetId } });
  for (const b of buckets.values()) {
    const stats = pairwiseAgreement(b.pairs);
    await prisma.pairwiseCalibration.create({
      data: {
        judgeProvider: b.provider,
        judgeModelId: b.modelId,
        datasetId,
        sampleCount: stats.sampleCount,
        agreementAccuracy: stats.accuracy,
        binaryKappa: stats.kappa,
        tieRate: stats.tieRate,
      },
    });
  }

  return { judges: buckets.size, items: items.length, verdicts };
}

export async function getPairwiseSummary(): Promise<{
  pairwise: Awaited<ReturnType<typeof prisma.pairwiseCalibration.findMany>>;
  datasets: Awaited<ReturnType<typeof prisma.pairwiseDataset.findMany>>;
}> {
  const [pairwise, datasets] = await Promise.all([
    prisma.pairwiseCalibration.findMany({ orderBy: [{ datasetId: 'asc' }, { judgeModelId: 'asc' }] }),
    prisma.pairwiseDataset.findMany({ orderBy: { createdAt: 'desc' } }),
  ]);
  return { pairwise, datasets };
}
