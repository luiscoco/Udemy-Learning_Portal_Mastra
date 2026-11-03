import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { z } from 'zod';
import { summarizeChecks, type LabDefinition, type ReadinessResponse } from '@mlp/contracts';
import { LabError, type LabImplementation } from '@mlp/lab-engine';
import {
  ConfigError,
  ConfigSchema,
  deploymentProblems,
  describeConfig,
  parseConfig,
  ReadinessProbe,
  resolveSecretFiles,
  SECRET_KEYS,
  type ConfigFinding,
  type SecretSource,
  type SimulatedFailure,
} from '@mlp/deploy';
import type { LabServices, ProviderProbe } from '../services.js';
import { lab72Definition } from './definition.js';

/** Values that look like real provider keys. The lab refuses them: real keys belong in server-side secrets. */
const REAL_KEY = /(sk-(proj-|ant-)?[A-Za-z0-9_-]{16,}|AIza[0-9A-Za-z_-]{20,}|xai-[A-Za-z0-9]{16,})/;
const KNOWN_KEYS = new Set([...Object.keys(ConfigSchema.shape), ...SECRET_KEYS.map((k) => `${k}_FILE`)]);
const MOUNTS = {
  mountUsers: '/run/secrets/auth_users',
  mountSessionSecret: '/run/secrets/auth_session_secret',
  mountAuditKey: '/run/secrets/audit_hmac_key',
} as const;

export const Lab72InputSchema = z.object({
  profile: z.enum(['development', 'production']),
  envText: z
    .string()
    .max(8_000)
    .refine(
      (v) => !REAL_KEY.test(v),
      'This looks like a real provider key. Never paste real keys: mount them as secret files on the server.',
    ),
  mountUsers: z.boolean().default(true),
  mountSessionSecret: z.boolean().default(true),
  mountAuditKey: z.boolean().default(true),
  simulate: z.enum(['none', 'storage-down', 'data-dir-read-only', 'runner-draining']).default('none'),
  probeProvider: z.enum(['openai', 'anthropic']).default('openai'),
});
export type Lab72Input = z.infer<typeof Lab72InputSchema>;

export interface Lab72Output {
  profile: Lab72Input['profile'];
  accepted: boolean;
  problems: ConfigFinding[];
  warnings: ConfigFinding[];
  lineErrors: { line: number; message: string }[];
  unknownKeys: string[];
  secretSources: Record<string, SecretSource>;
  effective: Record<string, string | number | boolean> | null;
  readiness: ReadinessResponse | null;
  providerProbe: ProviderProbe | { skipped: string };
  dockerRun: string;
}

/** KEY=VALUE lines; `#` comments and blank lines are ignored; quotes around a value are removed. */
export function parseEnvText(text: string): { env: Record<string, string>; errors: { line: number; message: string }[] } {
  const env: Record<string, string> = {};
  const errors: { line: number; message: string }[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const m = /^([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) return void errors.push({ line: i + 1, message: 'expected KEY=VALUE' });
    const key = m[1]!;
    if (key in env) errors.push({ line: i + 1, message: `${key} is set twice (the last value wins)` });
    env[key] = m[2]!.replace(/^(["'])(.*)\1$/, '$2');
  });
  return { env, errors };
}

/** Secret contents for the "mounted" files: random per run, so nothing real is ever involved. */
function mountedFiles(input: Lab72Input): Map<string, string> {
  const files = new Map<string, string>();
  const rnd = () => randomBytes(32).toString('base64url');
  // A syntactically valid scrypt entry with random salt/hash: it validates, but no password opens it.
  if (input.mountUsers)
    files.set(
      MOUNTS.mountUsers,
      `learner:scrypt$16384$8$1$${randomBytes(16).toString('base64url')}$${randomBytes(32).toString('base64url')}`,
    );
  if (input.mountSessionSecret) files.set(MOUNTS.mountSessionSecret, rnd());
  if (input.mountAuditKey) files.set(MOUNTS.mountAuditKey, rnd());
  return files;
}

function dockerRunOf(env: Record<string, string>): string {
  const parts = ['docker run -d -p 127.0.0.1:8787:8787', '-v mlp-data:/data', '-v "$PWD/secrets:/run/secrets:ro"'];
  for (const [k, v] of Object.entries(env)) {
    const secret = (SECRET_KEYS as readonly string[]).includes(k);
    parts.push(`-e ${k}=${secret ? '<set as a secret file instead>' : v.replace(/[^\w./:@-]/g, '')}`);
  }
  return [...parts, 'mastra-learning-platform'].join(' \\\n  ');
}

export const lab72: LabImplementation<Lab72Input, Lab72Output, LabServices> = {
  definition: lab72Definition as LabDefinition,
  inputSchema: Lab72InputSchema,

  async run(ctx, input) {
    const step = (stepId: string, status: 'running' | 'success' | 'failed', output?: unknown) =>
      ctx.emit({ type: 'workflow-step', stepId, status, ...(output === undefined ? {} : { output }) });

    step('parse', 'running');
    const { env, errors: lineErrors } = parseEnvText(input.envText);
    const unknownKeys = Object.keys(env).filter((k) => !KNOWN_KEYS.has(k));
    for (const k of unknownKeys) ctx.log('warn', `Unknown key ${k} is ignored (a typo?)`);
    env.NODE_ENV = input.profile;
    step('parse', lineErrors.length ? 'failed' : 'success', { keys: Object.keys(env).length, unknownKeys });

    step('secrets', 'running');
    const files = mountedFiles(input);
    const generated = [...files.values()];
    let problems: ConfigFinding[] = [];
    let warnings: ConfigFinding[] = [];
    let secretSources: Record<string, SecretSource> = {};
    let effective: Lab72Output['effective'] = null;
    let readiness: ReadinessResponse | null = null;
    let resolvedEnv: Record<string, string | undefined> | undefined;
    try {
      const r = resolveSecretFiles(env, (path) => {
        const content = files.get(path);
        if (content === undefined) throw new Error('not mounted');
        return content;
      });
      resolvedEnv = r.env;
      secretSources = r.sources;
      step('secrets', 'success', secretSources);
    } catch (e) {
      if (!(e instanceof ConfigError)) throw e;
      problems = e.message
        .replace(/^Invalid secrets \((.*)\)$/, '$1')
        .split('; ')
        .map((message, i) => ({ key: e.keys[i] ?? 'secrets', message }));
      step('secrets', 'failed', { problems: problems.length });
    }

    step('validate', 'running');
    if (resolvedEnv) {
      try {
        const config = parseConfig(resolvedEnv);
        const found = deploymentProblems(config);
        problems = found.problems;
        warnings = found.warnings;
        effective = describeConfig(config);
        // Readiness against a real scratch data directory in this learner's partition (never MLP_DATA_DIR from
        // the input: a learner must not point the server at arbitrary paths).
        step('readiness', 'running');
        const probe = new ReadinessProbe({
          config: { ...config, WEB_DIST_DIR: undefined },
          dataDir: join(ctx.services.files('lab-72'), 'data'),
          simulate: new Set(input.simulate === 'none' ? [] : [input.simulate as SimulatedFailure]),
          cacheMs: 0,
        });
        try {
          readiness = await probe.check();
        } finally {
          await probe.close();
        }
        step('readiness', readiness.status === 'ready' ? 'success' : 'failed', { status: readiness.status });
      } catch (e) {
        if (!(e instanceof ConfigError)) throw e;
        problems = e.message
          .replace(/^Invalid configuration \((.*)\)$/, '$1')
          .split('; ')
          .map((m) => ({ key: m.split(':')[0] ?? 'config', message: m }));
      }
    }
    if (inlineSecrets(env, input.profile).length)
      for (const k of inlineSecrets(env, input.profile))
        warnings.push({ key: k, message: `${k} is inline in the environment: in production, mount it as ${k}_FILE` });
    step('validate', problems.length ? 'failed' : 'success', { problems: problems.length, warnings: warnings.length });

    let providerProbe: Lab72Output['providerProbe'] = { skipped: 'offline mode: no provider is called' };
    if (ctx.mode === 'live') {
      step('provider-probe', 'running');
      try {
        providerProbe = await ctx.services.models.probeAuth(input.probeProvider, ctx.signal);
      } catch (e) {
        if (ctx.signal.aborted) throw e;
        throw new LabError('PROVIDER_ERROR', `The ${input.probeProvider} model list did not answer.`, {
          retryable: true,
          cause: e,
        });
      }
      step('provider-probe', 'ok' in providerProbe && providerProbe.ok ? 'success' : 'failed', providerProbe);
    }

    ctx.setResultExtras({ effective: { mode: ctx.mode, simulated: ctx.mode !== 'live', profile: input.profile } });
    const out: Lab72Output = {
      profile: input.profile,
      accepted: problems.length === 0 && lineErrors.length === 0,
      problems,
      warnings,
      lineErrors,
      unknownKeys,
      secretSources,
      effective,
      readiness,
      providerProbe,
      dockerRun: dockerRunOf(Object.fromEntries(Object.entries(env).filter(([k]) => k !== 'NODE_ENV'))),
    };
    // Defence in depth: the generated secret contents must never appear in the output.
    const text = JSON.stringify(out);
    if (generated.some((g) => text.includes(g)))
      throw new LabError('INTERNAL', 'A secret value reached the output; refusing to return it.');
    return out;
  },

  validate(out, input, { events }) {
    const prod = input.profile === 'production';
    const inline = inlineSecrets(parseEnvText(input.envText).env, input.profile);
    const failing = out.readiness?.checks.filter((c) => c.status === 'fail').map((c) => c.name) ?? [];
    const expectedFail = {
      none: [],
      'storage-down': ['storage'],
      'data-dir-read-only': ['data-dir'],
      'runner-draining': ['runner'],
    }[input.simulate];
    const probe = out.providerProbe;
    return summarizeChecks([
      {
        id: 'config-accepted',
        label: 'The configuration passes the deployment rules for its profile',
        passed: out.accepted,
        message: out.accepted
          ? `accepted for ${input.profile}`
          : out.problems
              .map((p) => p.message)
              .concat(out.lineErrors.map((l) => `line ${l.line}: ${l.message}`))
              .join('; '),
      },
      {
        id: 'secrets-from-files',
        label: 'In production, every secret comes from a mounted file',
        passed: !prod || (inline.length === 0 && Object.values(out.secretSources).every((s) => s !== 'env')),
        message: prod
          ? inline.length
            ? `inline: ${inline.join(', ')}`
            : 'all secrets from files'
          : 'development profile: files recommended, not required',
      },
      {
        id: 'no-secret-echo',
        label: 'No secret value appears in the output or events',
        passed:
          !JSON.stringify({ out, events }).match(REAL_KEY) &&
          !/scrypt\$\d+\$\d+\$\d+\$[A-Za-z0-9_-]{16,}/.test(JSON.stringify(out)),
        message: 'secrets are shown masked or by source only',
      },
      {
        id: 'readiness-reflects',
        label: 'Readiness reports exactly the dependency that is down',
        passed: out.readiness !== null && JSON.stringify(failing) === JSON.stringify(expectedFail),
        message: out.readiness
          ? `${out.readiness.status}; failing: ${failing.join(', ') || 'none'}`
          : 'not evaluated (fix the configuration first)',
      },
      {
        id: 'provider-probe',
        label: 'Live mode: the provider accepts the server’s key',
        passed: 'skipped' in probe || probe.ok,
        message:
          'skipped' in probe
            ? probe.skipped
            : `${probe.provider}: HTTP ${probe.status}, ${probe.models} models in ${probe.ms} ms`,
      },
    ]);
  },
};

function inlineSecrets(env: Record<string, string>, profile: string): string[] {
  return profile === 'production' ? SECRET_KEYS.filter((k) => env[k]) : [];
}
