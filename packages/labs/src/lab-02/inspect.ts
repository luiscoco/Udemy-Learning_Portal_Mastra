import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

export const LAYER_DIRS = [
  'apps/web',
  'apps/api',
  'packages/mastra-runtime',
  'packages/contracts',
  'packages/lab-catalog',
] as const;
export const ENTRY_FILES = [
  'packages/labs/src/lab-01/template/src/mastra/index.ts',
  'apps/api/src/server.ts',
  'apps/web/src/main.tsx',
  'packages/mastra-runtime/src/index.ts',
] as const;

export type Layer = 'ui' | 'api' | 'runtime' | 'mastraEntry';

export const LAYER_LABELS: Record<Layer, string> = {
  ui: 'UI layer (browser)',
  api: 'API layer (HTTP server)',
  runtime: 'Mastra runtime (server-only)',
  mastraEntry: 'Mastra entry point',
};

export interface Inspection {
  path: string;
  exists: boolean;
  bytes: number;
  text: string;
}

/** Reads a repository file (resolved and confined under the repo root). Missing files are reported, not thrown. */
export async function inspectFile(repoRoot: string, rel: string): Promise<Inspection> {
  const abs = resolve(repoRoot, rel);
  if (!abs.startsWith(resolve(repoRoot) + sep)) throw new Error(`Refusing to read outside the repository: ${rel}`);
  if (!existsSync(abs)) return { path: rel, exists: false, bytes: 0, text: '' };
  const text = await readFile(abs, 'utf8');
  return { path: rel, exists: true, bytes: Buffer.byteLength(text), text };
}

export interface Evidence {
  description: string;
  file: string;
  test: (text: string) => boolean;
}

const deps = (text: string): Record<string, string> => {
  try {
    const pkg = JSON.parse(text) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    return { ...pkg.dependencies, ...pkg.devDependencies };
  } catch {
    return {};
  }
};

/** Evidence a path must show to be the given layer. File paths are relative to the candidate. */
export function evidenceFor(layer: Layer, candidate: string): Evidence[] {
  switch (layer) {
    case 'ui':
      return [
        { description: 'package.json depends on react', file: `${candidate}/package.json`, test: (t) => 'react' in deps(t) },
        { description: 'has an index.html page', file: `${candidate}/index.html`, test: (t) => t.includes('<html') },
        { description: 'has a Vite config', file: `${candidate}/vite.config.ts`, test: (t) => t.includes('defineConfig') },
      ];
    case 'api':
      return [
        { description: 'package.json depends on express', file: `${candidate}/package.json`, test: (t) => 'express' in deps(t) },
        {
          description: 'src/server.ts starts an HTTP listener',
          file: `${candidate}/src/server.ts`,
          test: (t) => t.includes('.listen('),
        },
      ];
    case 'runtime':
      return [
        {
          description: 'package.json depends on @mastra/core',
          file: `${candidate}/package.json`,
          test: (t) => '@mastra/core' in deps(t),
        },
        {
          description: 'is described as server-only',
          file: `${candidate}/package.json`,
          test: (t) => /server-only/i.test((JSON.parse(t) as { description?: string }).description ?? ''),
        },
      ];
    case 'mastraEntry':
      return [
        { description: 'creates a Mastra instance (new Mastra)', file: candidate, test: (t) => t.includes('new Mastra(') },
        { description: 'registers agents', file: candidate, test: (t) => /agents:\s*\{/.test(t) },
      ];
  }
}

export interface LayerResult {
  layer: Layer;
  label: string;
  path: string;
  passed: boolean;
  found: string[];
  missing: string[];
}
