// Splits platform documentation into overlapping chunks for embedding/retrieval.
//
// Phase 1 uses a word-count heuristic for token estimation (1 token ≈ 0.75 words)
// rather than a real tokenizer — no external dependency needed. Fenced code blocks
// are treated as atomic units so a config/code example is never split mid-block.

/** Heuristic: 1 token ≈ 0.75 words (i.e. 100 tokens ≈ 75 words). */
const WORDS_PER_TOKEN = 0.75;

export interface ChunkOptions {
  /** Maximum tokens per chunk (default 512). Oversized code blocks are kept whole. */
  maxTokens?: number;
  /** Approximate token overlap carried between consecutive prose chunks (default 50). */
  overlapTokens?: number;
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function tokensFromWords(words: number): number {
  return Math.ceil(words / WORDS_PER_TOKEN);
}

/** Estimate the token count of a string using the word-count heuristic. */
export function estimateTokens(text: string): number {
  const words = countWords(text);
  return words === 0 ? 0 : tokensFromWords(words);
}

interface Atom {
  text: string;
  /** Word-equivalent count, used for packing without per-word rounding inflation. */
  words: number;
  isCode: boolean;
}

const FENCE_START = /^\s*```/;
const FENCE_END = /^\s*```\s*$/;

/**
 * Tokenise the document into atoms: each prose word is one atom, and each fenced
 * code block (opening fence → closing fence, inclusive) is a single atomic unit.
 */
function tokenize(text: string): Atom[] {
  const atoms: Atom[] = [];
  const lines = text.split('\n');
  let proseBuffer: string[] = [];

  const flushProse = (): void => {
    if (proseBuffer.length === 0) return;
    for (const word of proseBuffer.join('\n').split(/\s+/).filter(Boolean)) {
      atoms.push({ text: word, words: 1, isCode: false });
    }
    proseBuffer = [];
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (FENCE_START.test(line)) {
      flushProse();
      const codeLines = [line];
      i++;
      while (i < lines.length) {
        codeLines.push(lines[i]!);
        const closing = FENCE_END.test(lines[i]!);
        i++;
        if (closing) break;
      }
      const codeText = codeLines.join('\n');
      atoms.push({ text: codeText, words: countWords(codeText), isCode: true });
    } else {
      proseBuffer.push(line);
      i++;
    }
  }
  flushProse();
  return atoms;
}

/**
 * Chunk `text` into overlapping segments of ≤`maxTokens` tokens with ~`overlapTokens`
 * of prose overlap between neighbours. Fenced code blocks are never split; a code
 * block larger than `maxTokens` is emitted whole in its own chunk.
 */
export function chunkDocument(text: string, opts: ChunkOptions = {}): string[] {
  const maxTokens = opts.maxTokens ?? 512;
  const overlapTokens = opts.overlapTokens ?? 50;
  const maxWords = Math.max(1, Math.floor(maxTokens * WORDS_PER_TOKEN));
  const overlapWords = Math.max(0, Math.round(overlapTokens * WORDS_PER_TOKEN));

  const atoms = tokenize(text);
  if (atoms.length === 0) return [];

  const chunks: string[] = [];
  let current: Atom[] = [];
  let currentWords = 0;

  const render = (segment: Atom[]): string => segment.map((a) => a.text).join(' ');

  // Trailing prose words (up to overlapWords) carried into the next chunk. Code
  // atoms are never carried — that would duplicate a whole block across chunks.
  const buildOverlap = (prev: Atom[]): Atom[] => {
    const carried: Atom[] = [];
    let n = 0;
    for (let j = prev.length - 1; j >= 0; j--) {
      const atom = prev[j]!;
      if (atom.isCode) break;
      carried.unshift(atom);
      n += atom.words;
      if (n >= overlapWords) break;
    }
    return carried;
  };

  for (const atom of atoms) {
    if (current.length > 0 && currentWords + atom.words > maxWords) {
      const finished = current;
      chunks.push(render(finished));

      if (atom.isCode && atom.words > maxWords) {
        // Oversized code block: emit on its own line with no surrounding overlap.
        chunks.push(atom.text);
        current = [];
        currentWords = 0;
        continue;
      }

      const overlap = buildOverlap(finished);
      current = [...overlap];
      currentWords = overlap.reduce((sum, a) => sum + a.words, 0);
    }

    current.push(atom);
    currentWords += atom.words;
  }

  if (current.length > 0) chunks.push(render(current));
  return chunks;
}
