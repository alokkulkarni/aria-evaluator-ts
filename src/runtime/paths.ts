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
