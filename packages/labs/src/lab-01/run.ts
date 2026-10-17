import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { summarizeChecks, type LabDefinition } from '@mlp/contracts';
import { LabError, type LabImplementation } from '@mlp/lab-engine';
import { checkModelId, DEFAULT_MODEL_BY_PROVIDER } from '@mlp/mastra-runtime';
import { dataDir, labSourceDir, labsPackageDir } from '../paths.js';
import { lab01Definition } from './definition.js';
import { agentIdentifiers, renderScaffold, type ScaffoldFile } from './scaffold.js';
import { typecheckProject, type TypecheckResult } from './typecheck.js';

export const Lab01InputSchema = z.object({
  projectName: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9-]{2,39}$/, 'Use 3–40 lowercase letters, digits or dashes, starting with a letter'),
  provider: z.enum(['openai', 'anthropic', 'google']),
  agentName: z
    .string()
    .trim()
    .regex(/^[A-Za-z][A-Za-z ]{1,39}$/, 'Use letters and spaces only (2–40 characters)'),
  moduleType: z.enum(['module', 'commonjs']).default('module'),
});
export type Lab01Input = z.infer<typeof Lab01InputSchema>;

export interface Lab01Output {
  projectName: string;
  nodeVersion: string;
  modelId: string;
  apiKeyEnvVar: string;
  agent: { variable: string; id: string; file: string };
  files: { path: string; role: string; lines: number }[];
  rootFiles: string[];
  packageJson: Record<string, unknown>;
  tsconfig: Record<string, unknown>;
  envExampleKeys: string[];
  /** True if any .env.example line assigns a value (a leaked secret). */
  envExampleHasValues: boolean;
  gitignoreExcludesEnv: boolean;
  entrySource: string;
  build: TypecheckResult;
}

const MIN_NODE = [22, 13] as const;

export function nodeSatisfies(version: string, min: readonly [number, number] = MIN_NODE): boolean {
  const [maj = 0, minor = 0] = version.replace(/^v/, '').split('.').map(Number);
  return maj > min[0] || (maj === min[0] && minor >= min[1]);
}

export const lab01: LabImplementation<Lab01Input, Lab01Output> = {
  definition: lab01Definition as LabDefinition,
  inputSchema: Lab01InputSchema,

  async run(ctx, input) {
    // 1. Environment
    ctx.emit({ type: 'workflow-step', stepId: 'check-environment', status: 'running' });
    const nodeVersion = process.versions.node;
    if (!nodeSatisfies(nodeVersion)) {
      throw new LabError('NOT_CONFIGURED', `Node ${nodeVersion} is too old; @mastra/core needs >= 22.13.`);
    }
    ctx.log('info', `Node.js ${nodeVersion} satisfies >= 22.13 (required by @mastra/core)`);
    ctx.emit({ type: 'workflow-step', stepId: 'check-environment', status: 'success', output: { nodeVersion } });

    // 2. Configuration
    ctx.emit({ type: 'workflow-step', stepId: 'resolve-config', status: 'running' });
    const modelId = DEFAULT_MODEL_BY_PROVIDER[input.provider];
    const model = checkModelId(modelId);
    if (!model.ok) throw new LabError('NOT_CONFIGURED', model.reason);
    const ids = agentIdentifiers(input.agentName);
    ctx.log('info', `Model ${modelId} found in the Mastra provider registry; key variable ${model.apiKeyEnvVar}`);
    ctx.emit({
      type: 'workflow-step',
      stepId: 'resolve-config',
      status: 'success',
      output: { modelId, apiKeyEnvVar: model.apiKeyEnvVar, agentId: ids.kebab, moduleType: input.moduleType },
    });

    // 3. Render into a per-run folder inside the server data directory.
    const root = join(dataDir(), 'scaffolds', ctx.runId);
    const projectDir = join(root, input.projectName);
    try {
      ctx.emit({ type: 'workflow-step', stepId: 'render-files', status: 'running' });
      const files: ScaffoldFile[] = await renderScaffold(join(labSourceDir('lab-01'), 'template'), {
        projectName: input.projectName,
        agentName: input.agentName,
        modelId,
        apiKeyEnvVar: model.apiKeyEnvVar,
        moduleType: input.moduleType,
      });
      for (const f of files) {
        ctx.throwIfAborted();
        const abs = join(projectDir, f.path);
        await mkdir(dirname(abs), { recursive: true });
        await writeFile(abs, f.content, 'utf8');
        ctx.log('info', `create ${f.path} (${f.content.split('\n').length} lines)`);
      }
      ctx.emit({ type: 'workflow-step', stepId: 'render-files', status: 'success', output: { files: files.length } });

      // 4. Build = real TypeScript typecheck against the installed @mastra/core.
      ctx.emit({ type: 'workflow-step', stepId: 'build', status: 'running' });
      ctx.log('info', 'Running the TypeScript compiler (≈5 s)…');
      const build = await typecheckProject(projectDir, join(labsPackageDir(), 'package.json'), ctx.signal);
      for (const d of build.diagnostics) ctx.log('error', `${d.file}:${d.line} ${d.message}`);
      ctx.log(build.ok ? 'info' : 'warn', `tsc finished in ${build.durationMs} ms with ${build.diagnostics.length} diagnostics`);
      ctx.emit({
        type: 'workflow-step',
        stepId: 'build',
        status: build.ok ? 'success' : 'failed',
        durationMs: build.durationMs,
        output: { diagnostics: build.diagnostics.length },
      });

      const get = (p: string) => files.find((f) => f.path === p)?.content ?? '';
      const envExample = get('.env.example');
      ctx.setResultExtras({ effective: { mode: ctx.mode, modelId, typescript: 'compiler API (child process)' } });
      return {
        projectName: input.projectName,
        nodeVersion,
        modelId,
        apiKeyEnvVar: model.apiKeyEnvVar,
        agent: { variable: ids.camel, id: ids.kebab, file: `src/mastra/agents/${ids.kebab}.ts` },
        files: files.map((f) => ({ path: f.path, role: f.role, lines: f.content.split('\n').length })),
        rootFiles: files.filter((f) => !f.path.includes('/') || f.path === 'src/mastra/index.ts').map((f) => f.path),
        packageJson: JSON.parse(get('package.json')) as Record<string, unknown>,
        tsconfig: JSON.parse(get('tsconfig.json')) as Record<string, unknown>,
        envExampleKeys: envExample
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l && !l.startsWith('#'))
          .map((l) => l.split('=')[0]!),
        envExampleHasValues: envExample.split('\n').some((l) => /^[A-Z0-9_]+=\s*\S/.test(l.trim())),
        gitignoreExcludesEnv: get('.gitignore')
          .split('\n')
          .some((l) => l.trim() === '.env'),
        entrySource: get('src/mastra/index.ts'),
        build,
      };
    } finally {
      // 5. Cleanup, including after cancellation or failure.
      await rm(root, { recursive: true, force: true });
      if (!ctx.signal.aborted) {
        ctx.emit({ type: 'workflow-step', stepId: 'cleanup', status: 'success' });
        ctx.log('info', 'Removed the temporary project folder from the server');
      }
    }
  },

  validate(out) {
    const pkg = out.packageJson as { type?: string; engines?: { node?: string } };
    const engine = pkg.engines?.node ?? '';
    const engineMin = /^>=\s*(\d+)\.(\d+)/.exec(engine);
    return summarizeChecks([
      {
        id: 'build-passes',
        label: 'The generated project typechecks with 0 errors',
        passed: out.build.ok,
        message: out.build.ok ? `tsc: 0 diagnostics in ${out.build.durationMs} ms` : out.build.diagnostics[0]?.message,
      },
      {
        id: 'esm',
        label: 'package.json declares "type": "module"',
        passed: pkg.type === 'module',
        message:
          pkg.type === 'module'
            ? undefined
            : `Found "type": "${pkg.type}". Mastra packages are ESM; a CommonJS project forces .cjs interop and breaks mastra CLI tooling.`,
      },
      {
        id: 'node-engine',
        label: 'package.json requires Node.js >= 22.13',
        passed: Boolean(engineMin && nodeSatisfies(`${engineMin[1]}.${engineMin[2]}`)),
        message: `engines.node = "${engine}"`,
      },
      {
        id: 'entry-registers-agent',
        label: 'src/mastra/index.ts registers the agent on a Mastra instance',
        passed: out.entrySource.includes('new Mastra(') && out.entrySource.includes(out.agent.variable),
      },
      {
        id: 'secrets-excluded',
        label: '.env.example has no values and .gitignore excludes .env',
        passed: !out.envExampleHasValues && out.gitignoreExcludesEnv && out.envExampleKeys.includes(out.apiKeyEnvVar),
        message: `.env.example keys: ${out.envExampleKeys.join(', ')}`,
      },
    ]);
  },
};
