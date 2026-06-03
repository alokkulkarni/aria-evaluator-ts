interface TurnSnapshot {
  role: 'customer' | 'agent';
  content: string;
}

export interface TokenEstimate {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export const TOKEN_ESTIMATOR_VERSION = 1;

function estimateTokenCount(text: string): number {
  if (!text.trim()) return 0;
  // Conservative text-only estimate used when provider-level token usage is unavailable.
  return Math.max(1, Math.ceil(text.length / 4));
}

function isSyntheticSeparatorTurn(turn: TurnSnapshot): boolean {
  return turn.role === 'agent' && /^===\s.+\s===$/.test(turn.content.trim());
}

export function estimateTokensFromTurns(turns: TurnSnapshot[]): TokenEstimate {
  let inputTokens = 0;
  let outputTokens = 0;

  for (const turn of turns) {
    if (isSyntheticSeparatorTurn(turn)) continue;
    const tokens = estimateTokenCount(turn.content);
    if (turn.role === 'customer') {
      inputTokens += tokens;
    } else {
      outputTokens += tokens;
    }
  }

  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
  };
}

export function classifyFailure(errorMessage: string | null | undefined): string {
  const error = (errorMessage ?? '').toLowerCase();
  if (!error) return 'unknown';

  if (error.includes('timeout') || error.includes('timed out') || error.includes('exceeded')) {
    return 'timeout';
  }
  if (error.includes('auth') || error.includes('unauthorized') || error.includes('forbidden')) {
    return 'auth';
  }
  if (
    error.includes('network') ||
    error.includes('econn') ||
    error.includes('socket') ||
    error.includes('connection')
  ) {
    return 'network';
  }
  if (error.includes('validation') || error.includes('invalid') || error.includes('malformed')) {
    return 'validation';
  }
  return 'unknown';
}

export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  if (p <= 0) return Math.min(...values);
  if (p >= 100) return Math.max(...values);

  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.max(0, rank - 1)] ?? null;
}

