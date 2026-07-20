// src/conversation/scenario-loader.ts
// Loads YAML scenario files, handles multi-document files (--- separator),
// and performs template substitution of {customer_name} etc.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import yaml from 'js-yaml';
import type { Scenario, TemplateVars } from '../types/index.js';

/** Load all scenarios from a directory tree recursively */
export function loadScenariosFromDir(dir: string, rootDir?: string): Scenario[] {
  const root = rootDir ?? dir;   // always relative to the top-level scenarios dir
  const results: Scenario[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...loadScenariosFromDir(full, root));
    } else if (entry.endsWith('.yaml') || entry.endsWith('.yml')) {
      results.push(...loadScenariosFromFile(full, root));
    }
  }
  return results;
}

/**
 * Normalize a raw YAML `tags` value: keep string entries, trim + lowercase
 * them, drop empties/non-strings, dedupe (first occurrence wins).
 * Returns undefined when the value is not an array or nothing valid remains —
 * a scenario without usable tags carries no `tags` field at all.
 */
function normalizeTags(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const seen = new Set<string>();
  for (const entry of raw) {
    if (typeof entry !== 'string') continue;
    const tag = entry.trim().toLowerCase();
    if (tag) seen.add(tag);
  }
  return seen.size > 0 ? [...seen] : undefined;
}

/** Load one or more scenarios from a YAML file (multi-doc supported via ---) */
export function loadScenariosFromFile(filePath: string, baseDir?: string): Scenario[] {
  const content = readFileSync(filePath, 'utf-8');
  const docs = yaml.loadAll(content) as Array<Partial<Scenario>>;
  return docs
    .filter((d) => d && d.name)
    .map((doc, idx) => {
      const scenario = {
        ...doc,
        filePath: baseDir
          ? `${relative(baseDir, filePath)}#${idx}`
          : `${filePath}#${idx}`,
      } as Scenario;
      const tags = normalizeTags(doc.tags);
      if (tags) scenario.tags = tags;
      else delete scenario.tags;
      return scenario;
    });
}

/** Filter scenarios by an optional filter string (matched against filePath prefix) */
export function filterScenarios(
  scenarios: Scenario[],
  filter?: string,
): Scenario[] {
  let result = scenarios;
  if (filter) {
    const norm = filter.replace(/\\/g, '/').replace(/\.ya?ml$/i, '');
    result = result.filter((s) => s.filePath?.startsWith(norm));
  }
  return result;
}

/**
 * Parse a comma-separated tags argument (e.g. from CLI `--tags`) into a
 * normalized list: entries trimmed + lowercased, empties dropped, deduped.
 * Undefined/empty input yields [].
 */
export function parseTagsCsv(tagsCsv: string | undefined): string[] {
  if (!tagsCsv) return [];
  const seen = new Set<string>();
  for (const entry of tagsCsv.split(',')) {
    const tag = entry.trim().toLowerCase();
    if (tag) seen.add(tag);
  }
  return [...seen];
}

/**
 * Filter scenarios by cross-cutting suite tags. OR semantics: a scenario
 * matches when it carries AT LEAST ONE of the requested tags. Matching is
 * case-insensitive on both sides. When `tagsCsv` is undefined/empty (or
 * parses to no tags, e.g. " , ,"), the input is returned unchanged.
 */
export function filterScenariosByTags(
  scenarios: Scenario[],
  tagsCsv: string | undefined,
): Scenario[] {
  const requested = parseTagsCsv(tagsCsv);
  if (requested.length === 0) return scenarios;
  const wanted = new Set(requested);
  return scenarios.filter((s) =>
    (s.tags ?? []).some((tag) => wanted.has(tag.trim().toLowerCase())),
  );
}

/** Substitute {customer_name} etc. in all string fields of a scenario */
export function applyTemplateVars(scenario: Scenario, vars: TemplateVars): Scenario {
  // Safe replace: passes undefined/null through unchanged (script-mode scenarios omit some fields)
  const replace = (str: string | undefined): string | undefined => {
    if (str == null) return str;
    return str.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? `{${key}}`);
  };

  return {
    ...scenario,
    name: replace(scenario.name) ?? scenario.name,
    description: scenario.description ? replace(scenario.description) : undefined,
    goal: replace(scenario.goal),
    customer_persona: replace(scenario.customer_persona),
    opening_message: replace(scenario.opening_message),
  } as Scenario;
}
