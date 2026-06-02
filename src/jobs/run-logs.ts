import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { runLogsDir } from '../runtime/paths.js';

const parsedMaxPersistedLogLines = Number.parseInt(process.env['MAX_PERSISTED_LOG_LINES'] ?? '3000', 10);
const MAX_PERSISTED_LOG_LINES = Math.max(0, Number.isNaN(parsedMaxPersistedLogLines) ? 3000 : parsedMaxPersistedLogLines);

const runLogLineCounts = new Map<string, number>();

export function runLogPath(runId: string): string {
  return resolve(join(runLogsDir, `run-${runId}.log`));
}

function initLineCountFromFile(runId: string): number {
  const path = runLogPath(runId);
  if (!existsSync(path)) return 0;
  const text = readFileSync(path, 'utf-8');
  return text.split(/\r?\n/).filter((line) => line.length > 0).length;
}

export function resetRunLog(runId: string, headerLine: string): void {
  const line = headerLine.endsWith('\n') ? headerLine : `${headerLine}\n`;
  writeFileSync(runLogPath(runId), line, 'utf-8');
  runLogLineCounts.set(runId, 1);
}

export function appendRunLogLine(runId: string, line: string): number {
  if (!runLogLineCounts.has(runId)) {
    runLogLineCounts.set(runId, initLineCountFromFile(runId));
  }
  const index = runLogLineCounts.get(runId)!;
  runLogLineCounts.set(runId, index + 1);
  try {
    appendFileSync(runLogPath(runId), `${line}\n`, 'utf-8');
  } catch {
    // best-effort persistence
  }
  return index;
}

export function readRunLogLines(runId: string): string[] {
  const path = runLogPath(runId);
  if (!existsSync(path)) return [];

  const text = readFileSync(path, 'utf-8');
  const lines = text.split(/\r?\n/).filter((line) => line.length > 0);
  if (MAX_PERSISTED_LOG_LINES > 0 && lines.length > MAX_PERSISTED_LOG_LINES) {
    return lines.slice(lines.length - MAX_PERSISTED_LOG_LINES);
  }
  return lines;
}
