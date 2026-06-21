// src/shared/domains.ts
// Curated business-domain taxonomy for scenarios. Scenarios live on disk under
// `<domain>/<type>/<file>.yaml` and the scenario `sourceRef` (e.g.
// `banking/adversarial/agentic_attacks.yaml#0`) encodes domain + type, which the
// pickers group by. The list is curated for consistent grouping but extensible —
// the builder also accepts a custom domain id.

export interface DomainDef {
  id: string; // lowercase slug used as the folder name and sourceRef prefix
  label: string;
}

/** Scenario type = the second path segment under a domain folder. */
export type ScenarioType = 'adversarial' | 'functional';
export const SCENARIO_TYPES: ScenarioType[] = ['adversarial', 'functional'];

/** Curated domains offered in the builder dropdown (plus "add custom"). */
export const DOMAINS: DomainDef[] = [
  { id: 'banking', label: 'Banking' },
  { id: 'finance', label: 'Finance & Payments' },
  { id: 'legal', label: 'Legal' },
  { id: 'compliance', label: 'Compliance' },
  { id: 'healthcare', label: 'Healthcare' },
  { id: 'insurance', label: 'Insurance' },
];

const LABEL_BY_ID = new Map(DOMAINS.map((d) => [d.id, d.label]));

/** Title-case an unknown/custom domain slug for display. */
export function domainLabel(id: string): string {
  return (
    LABEL_BY_ID.get(id) ??
    id
      .split(/[-_]/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ')
  );
}

/** Validate/normalize a domain slug from user input (folder-safe). */
export function normalizeDomainId(raw: string): string | null {
  const id = raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return id.length > 0 && id.length <= 40 ? id : null;
}

/**
 * Parse a scenario sourceRef/filePath ("domain/type/file.yaml#idx") into its
 * domain + type. Returns null for refs that don't match the domain layout
 * (e.g. pre-reorg paths), so the pickers can ignore them.
 */
export function parseScenarioRef(ref: string): { domain: string; type: ScenarioType; file: string } | null {
  const pathPart = ref.split('#')[0] ?? '';
  const parts = pathPart.split('/').filter(Boolean);
  if (parts.length < 3) return null;
  const [domain, type, ...rest] = parts;
  if (!domain || (type !== 'adversarial' && type !== 'functional')) return null;
  return { domain, type, file: rest.join('/') };
}
