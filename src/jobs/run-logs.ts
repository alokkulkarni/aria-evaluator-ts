import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { runLogsDir } from '../runtime/paths.js';

const MAX_PERSISTED_LOG_LINES = Number.parseInt(process.env['MAX_PERSISTED_LOG_LINES'] ?? '3000', 10);

export function runLogPath(runId: string): string {
  return resolve(join(runLogsDir, `run-${runId}.log`));
}

export function resetRunLog(runId: string, headerLine: string): void {
  const line = headerLine.endsWith('\n') ? headerLine : `${headerLine}\n`;
  writeFileSync(runLogPath(runId), line, 'utf-8');
}

export function appendRunLogLine(runId: string, line: string): void {
  try {
    appendFileSync(runLogPath(runId), `${line}\n`, 'utf-8');
  } catch {
    // best-effort persistence
  }
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
