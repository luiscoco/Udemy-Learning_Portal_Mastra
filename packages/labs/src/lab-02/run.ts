import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { summarizeChecks, type LabDefinition } from '@mlp/contracts';
import type { LabImplementation, RunContext } from '@mlp/lab-engine';
import { labsPackageDir } from '../paths.js';
import { lab02Definition } from './definition.js';
import {
  ENTRY_FILES,
  evidenceFor,
  inspectFile,
  LAYER_DIRS,
  LAYER_LABELS,
  type Inspection,
  type Layer,
  type LayerResult,
} from './inspect.js';

export const Lab02InputSchema = z.object({
  ui: z.enum(LAYER_DIRS),
  api: z.enum(LAYER_DIRS),
  runtime: z.enum(LAYER_DIRS),
  mastraEntry: z.enum(ENTRY_FILES),
});
export type Lab02Input = z.infer<typeof Lab02InputSchema>;

export interface Lab02Output {
  workspaces: string[];
  rootScripts: Record<string, string>;
  layers: LayerResult[];
  agentRegistration: string[];
  env: {
    dotenvPresent: boolean;
    dotenvGitignored: boolean;
    exampleKeys: string[];
    clientEnvPrefix: string | null;
  };
}

export function repoRoot(): string {
  return join(labsPackageDir(), '..', '..');
}

export const lab02: LabImplementation<Lab02Input, Lab02Output> = {
  definition: lab02Definition as LabDefinition,
  inputSchema: Lab02InputSchema,

  async run(ctx, input) {
    const root = repoRoot();
    const cache = new Map<string, Inspection>();
    let calls = 0;

    // Every file read is shown as a tool call so learners can follow the inspection.
    const read = async (rel: string, c: RunContext) => {
      const hit = cache.get(rel);
      if (hit) return hit;
      c.throwIfAborted();
      const id = `inspect-${++calls}`;
      const started = Date.now();
      c.emit({ type: 'tool-start', toolCallId: id, toolName: 'inspectFile', args: { path: rel } });
      const result = await inspectFile(root, rel);
      c.emit({
        type: 'tool-finish',
        toolCallId: id,
        toolName: 'inspectFile',
        status: 'success',
        result: { exists: result.exists, bytes: result.bytes },
        durationMs: Date.now() - started,
      });
      cache.set(rel, result);
      return result;
    };

    ctx.emit({ type: 'workflow-step', stepId: 'read-workspace', status: 'running' });
    const rootPkg = JSON.parse((await read('package.json', ctx)).text) as {
      workspaces?: string[];
      scripts?: Record<string, string>;
    };
    ctx.log('info', `Workspaces: ${(rootPkg.workspaces ?? []).join(', ')}`);
    ctx.emit({ type: 'workflow-step', stepId: 'read-workspace', status: 'success' });

    ctx.emit({ type: 'workflow-step', stepId: 'assert-layers', status: 'running' });
    const layers: LayerResult[] = [];
    for (const layer of ['ui', 'api', 'runtime', 'mastraEntry'] as Layer[]) {
      const path = input[layer];
      const found: string[] = [];
      const missing: string[] = [];
      for (const ev of evidenceFor(layer, path)) {
        const file = await read(ev.file, ctx);
        let ok: boolean;
        try {
          ok = file.exists && ev.test(file.text);
        } catch {
          ok = false;
        }
        (ok ? found : missing).push(ev.description);
      }
      const passed = missing.length === 0;
      ctx.log(
        passed ? 'info' : 'warn',
        `${LAYER_LABELS[layer]} → ${path}: ${passed ? 'confirmed' : `missing ${missing.join('; ')}`}`,
      );
      layers.push({ layer, label: LAYER_LABELS[layer], path, passed, found, missing });
    }
    ctx.emit({ type: 'workflow-step', stepId: 'assert-layers', status: 'success' });

    ctx.emit({ type: 'workflow-step', stepId: 'env-hygiene', status: 'running' });
    const gitignore = (await read('.gitignore', ctx)).text.split(/\r?\n/).map((l) => l.trim());
    const example = (await read('.env.example', ctx)).text;
    const vite = (await read('apps/web/vite.config.ts', ctx)).text;
    const entry = await read(input.mastraEntry, ctx);
    const env = {
      // Existence only: the .env file is never opened.
      dotenvPresent: existsSync(join(root, '.env')),
      dotenvGitignored: gitignore.includes('.env'),
      exampleKeys: example
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => /^[A-Z0-9_]+=/.test(l))
        .map((l) => l.split('=')[0]!),
      clientEnvPrefix: /envPrefix:\s*'([^']+)'/.exec(vite)?.[1] ?? null,
    };
    ctx.emit({ type: 'workflow-step', stepId: 'env-hygiene', status: 'success' });

    ctx.setResultExtras({ annotations: { filesInspected: cache.size } });
    return {
      workspaces: rootPkg.workspaces ?? [],
      rootScripts: rootPkg.scripts ?? {},
      layers,
      agentRegistration: entry.text
        .split(/\r?\n/)
        .filter((l) => /new Mastra\(|agents:|import .*[Aa]gent/.test(l))
        .map((l) => l.trim()),
      env,
    };
  },

  validate(out) {
    const layerCheck = (layer: Layer) => {
      const r = out.layers.find((l) => l.layer === layer)!;
      return {
        id: `layer-${layer}`,
        label: `${LAYER_LABELS[layer]} mapped correctly`,
        passed: r.passed,
        message: r.passed ? `${r.path}: ${r.found.join('; ')}` : `${r.path} is missing: ${r.missing.join('; ')}`,
      };
    };
    return summarizeChecks([
      layerCheck('ui'),
      layerCheck('api'),
      layerCheck('runtime'),
      layerCheck('mastraEntry'),
      {
        id: 'env-hygiene',
        label: '.env is gitignored and the browser only sees VITE_PUBLIC_ variables',
        passed: out.env.dotenvGitignored && out.env.clientEnvPrefix === 'VITE_PUBLIC_',
        message: `.env gitignored: ${out.env.dotenvGitignored}; client prefix: ${out.env.clientEnvPrefix}`,
      },
    ]);
  },
};
