import type { McpRejectionReason, McpTool } from '@mlp/contracts';

export interface Decision {
  allowed: boolean;
  reason: Exclude<McpRejectionReason, 'invalid-arguments' | 'tool-error'> | null;
  message: string;
}

type CatalogEntry = Pick<McpTool, 'name' | 'annotations'>;

/**
 * Client-side permission policy, checked before anything is sent: the tool must have been discovered,
 * be in the allowlist and be annotated read-only. Annotations are hints; they are trusted here only
 * because the fixture is our own server.
 */
export function decide(name: string, catalog: CatalogEntry[], allowlist: readonly string[]): Decision {
  const tool = catalog.find((t) => t.name === name);
  if (!tool) return { allowed: false, reason: 'unknown-tool', message: `The server does not advertise a tool named "${name}".` };
  if (!allowlist.includes(name))
    return { allowed: false, reason: 'not-allowlisted', message: `"${name}" exists but is not in the allowlist.` };
  if (tool.annotations?.readOnlyHint !== true)
    return {
      allowed: false,
      reason: 'not-read-only',
      message: `"${name}" is not annotated read-only${tool.annotations?.destructiveHint ? ' (it is marked destructive)' : ''}; this lab only calls read-only tools.`,
    };
  return { allowed: true, reason: null, message: `"${name}" is discovered, allowlisted and read-only.` };
}

/** Accepts a namespaced key (`course_search_labs`) as well as the server's own tool name. */
export function resolveName(input: string, serverKey: string, names: readonly string[]): string {
  if (names.includes(input)) return input;
  const prefix = `${serverKey}_`;
  if (input.startsWith(prefix) && names.includes(input.slice(prefix.length))) return input.slice(prefix.length);
  return input;
}

export function levenshtein(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length]!;
}

/** Up to three discovered names close to an unknown one (edit distance ≤ 3, or one contains the other). */
export function suggest(name: string, names: readonly string[]): string[] {
  const n = name.toLowerCase();
  return names
    .map((c) => ({ c, d: levenshtein(n, c.toLowerCase()) }))
    .filter(({ c, d }) => d <= 3 || (n.length >= 3 && (c.includes(n) || n.includes(c))))
    .sort((x, y) => x.d - y.d || x.c.localeCompare(y.c))
    .slice(0, 3)
    .map(({ c }) => c);
}

/** Flattens Mastra's validationErrors ({ errors, fields: { name: { errors, fields } } }) into rows. */
export function fieldErrorsOf(v: unknown, path = ''): { field: string; message: string }[] {
  if (!v || typeof v !== 'object') return [];
  const node = v as { errors?: unknown; fields?: unknown };
  const rows = (Array.isArray(node.errors) ? node.errors : []).map((m) => ({
    field: path || '(arguments)',
    message: String(m).slice(0, 300),
  }));
  if (node.fields && typeof node.fields === 'object')
    for (const [k, child] of Object.entries(node.fields)) rows.push(...fieldErrorsOf(child, path ? `${path}.${k}` : k));
  return rows.slice(0, 20);
}
