import { mkdirSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';

const projectRoot = resolve(process.cwd());
const configuredStateRoot = process.env['APP_STATE_DIR']?.trim();
const managedStateRoot = configuredStateRoot ? resolve(configuredStateRoot) : projectRoot;
const configuredReportsDir = process.env['EVAL_REPORT_OUTPUT_DIR']?.trim();

function resolveFromProjectRoot(pathValue: string): string {
  return resolve(projectRoot, pathValue);
}

function isWithinPath(parentPath: string, candidatePath: string): boolean {
  const rel = relative(parentPath, candidatePath);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

function getDatabaseFilePath(): string | null {
  const databaseUrl = process.env['DATABASE_URL']?.trim();
  if (!databaseUrl?.startsWith('file:')) return null;

  const dbPath = databaseUrl.slice('file:'.length).split('?')[0]?.trim();
  if (!dbPath) return null;

  return resolveFromProjectRoot(dbPath);
}

export const appPaths = {
  projectRoot,
  managedStateRoot,
  dataDir: join(managedStateRoot, 'data'),
  transcriptsDir: join(managedStateRoot, 'transcripts'),
  audioDir: join(managedStateRoot, 'transcripts', 'audio'),
  reportsDir: configuredReportsDir
    ? resolveFromProjectRoot(configuredReportsDir)
    : join(managedStateRoot, 'reports'),
  tmpDir: join(managedStateRoot, '.tmp'),
  portalRunsDir: join(managedStateRoot, '.tmp', 'portal-runs'),
  runtimeSettingsFile: join(managedStateRoot, 'data', 'runtime-settings.json'),
} as const;

export const runLogsDir = join(appPaths.reportsDir, 'run-logs');

export type ArtifactKind = 'reports' | 'transcripts' | 'audio';

export function ensureManagedStateDirs(): void {
  mkdirSync(appPaths.dataDir, { recursive: true });
  mkdirSync(appPaths.transcriptsDir, { recursive: true });
  mkdirSync(appPaths.audioDir, { recursive: true });
  mkdirSync(appPaths.reportsDir, { recursive: true });
  mkdirSync(appPaths.portalRunsDir, { recursive: true });
  mkdirSync(runLogsDir, { recursive: true });
}

export function resolveLoggedArtifactPath(loggedPath: string): string {
  const trimmed = loggedPath.trim();
  return isAbsolute(trimmed)
    ? resolve(trimmed)
    : resolveFromProjectRoot(trimmed);
}

function normalizePathSeparators(pathValue: string): string {
  return pathValue.replace(/\\/g, '/');
}

function sanitizeArtifactTail(rawTail: string): string | null {
  const normalized = normalizePathSeparators(rawTail).replace(/^\/+/, '');
  if (!normalized) return null;

  const segments = normalized.split('/').filter(Boolean);
  if (segments.length === 0) return null;
  if (segments.some((segment) => segment === '.' || segment === '..' || segment.includes(':'))) {
    return null;
  }
  return segments.join('/');
}

function getArtifactRoot(kind: ArtifactKind): string {
  if (kind === 'reports') return appPaths.reportsDir;
  if (kind === 'transcripts') return appPaths.transcriptsDir;
  return appPaths.audioDir;
}

export function normalizeArtifactRef(kind: ArtifactKind, rawPath: string): string | null {
  const trimmed = rawPath.trim();
  if (!trimmed) return null;

  const normalizedRaw = normalizePathSeparators(trimmed);
  const normalizedKindPrefix = `${kind}/`;
  const asRef = normalizedRaw.replace(/^\/+/, '');
  if (asRef.startsWith(normalizedKindPrefix)) {
    const tail = sanitizeArtifactTail(asRef.slice(normalizedKindPrefix.length));
    return tail ? `${kind}/${tail}` : null;
  }

  const artifactRoot = getArtifactRoot(kind);
  const resolvedPath = isAbsolute(trimmed)
    ? resolve(trimmed)
    : resolveFromProjectRoot(trimmed);
  if (isWithinPath(artifactRoot, resolvedPath)) {
    const tail = sanitizeArtifactTail(relative(artifactRoot, resolvedPath));
    return tail ? `${kind}/${tail}` : null;
  }

  return null;
}

export function sanitizeArtifactPathInLogLine(line: string): string {
  const transcriptMatch = line.match(/transcript saved\s*→\s*(.+\.json)\s*$/i);
  if (transcriptMatch?.[1]) {
    const ref = normalizeArtifactRef('transcripts', transcriptMatch[1]);
    return line.replace(transcriptMatch[1], ref ?? '[artifact-path]');
  }

  const jsonMatch = line.match(/^\s*JSON:\s*(.+\.json)\s*$/i);
  if (jsonMatch?.[1]) {
    const ref = normalizeArtifactRef('reports', jsonMatch[1]);
    return line.replace(jsonMatch[1], ref ?? '[artifact-path]');
  }

  const htmlMatch = line.match(/^\s*HTML:\s*(.+\.html)\s*$/i);
  if (htmlMatch?.[1]) {
    const ref = normalizeArtifactRef('reports', htmlMatch[1]);
    return line.replace(htmlMatch[1], ref ?? '[artifact-path]');
  }

  const audioMatch = line.match(/audio saved\s*→\s*(.+\.wav)\s*$/i);
  if (audioMatch?.[1]) {
    const ref = normalizeArtifactRef('audio', audioMatch[1]);
    return line.replace(audioMatch[1], ref ?? '[artifact-path]');
  }

  return line;
}

export function resolveArtifactRef(ref: string): string | null {
  const normalized = normalizePathSeparators(ref).replace(/^\/+/, '');
  const [kind, ...tailParts] = normalized.split('/');
  if (kind !== 'reports' && kind !== 'transcripts' && kind !== 'audio') return null;

  const tail = sanitizeArtifactTail(tailParts.join('/'));
  if (!tail) return null;
  return resolve(getArtifactRoot(kind), tail);
}

export function getStateLayoutWarnings(): string[] {
  if (!configuredStateRoot) return [];

  const warnings: string[] = [];
  const databaseFilePath = getDatabaseFilePath();

  if (!databaseFilePath) {
    warnings.push(
      'APP_STATE_DIR is set but DATABASE_URL is not a file: path. Configure DATABASE_URL separately so database state lives with the managed state root.',
    );
    return warnings;
  }

  if (!isWithinPath(managedStateRoot, databaseFilePath)) {
    warnings.push(
      `APP_STATE_DIR points to ${managedStateRoot}, but DATABASE_URL resolves to ${databaseFilePath}. Set DATABASE_URL inside the managed state root to keep runtime state coherent.`,
    );
  }

  return warnings;
}
