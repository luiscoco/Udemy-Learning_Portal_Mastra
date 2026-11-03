import { afterAll, describe, expect, it } from 'vitest';
import { LabRegistry, LabRunner } from '@mlp/lab-engine';
import { createLabServices } from '../services.js';
import { testMemoryDir } from '../test-memory.js';
import { EXAMPLE_ENV, lab72Definition } from './definition.js';
import { Lab72InputSchema, lab72, parseEnvText, type Lab72Output } from './run.js';

const services = createLabServices({ serverMode: 'offline', env: {}, memoryDir: testMemoryDir('lab-72') });
const runner = new LabRunner({
  registry: new LabRegistry([lab72]),
  services,
  servicesFor: (o) => services.forTenant(o),
  liveEnabled: false,
});
afterAll(() => runner.dispose());
const base = lab72Definition.exampleInput;

async function run(input: Record<string, unknown>) {
  const r = runner.start('lab-72', { input: { ...base, ...input } }, { ownerId: 'dev:l72' });
  const snap = await runner.waitFor(r.runId);
  const events = runner.events(r.runId);
  const result = events.find((e) => e.type === 'result');
  const res = result?.type === 'result' ? result : undefined;
  const check = (id: string) => res?.validation?.checks.find((c) => c.id === id);
  return { snap, events, res, check, out: res?.output as Lab72Output };
}

describe('parseEnvText', () => {
  it('reads KEY=VALUE lines, skips comments, strips quotes and reports bad or repeated lines', () => {
    const r = parseEnvText('# c\nA=1\nB="two words"\nnot a line\nA=3\n');
    expect(r.env).toEqual({ A: '3', B: 'two words' });
    expect(r.errors).toEqual([
      { line: 4, message: 'expected KEY=VALUE' },
      { line: 5, message: 'A is set twice (the last value wins)' },
    ]);
  });
});

describe('Lab 72', () => {
  it('accepts the production example with every secret from a file and a ready probe', async () => {
    const { snap, res, out, events } = await run({});
    expect(snap.status).toBe('succeeded');
    expect(res?.validation?.passed, JSON.stringify(res?.validation)).toBe(true);
    expect(out.secretSources).toMatchObject({
      AUTH_USERS: 'file',
      AUTH_SESSION_SECRET: 'file',
      AUDIT_HMAC_KEY: 'file',
      OPENAI_API_KEY: 'unset',
    });
    expect(out.effective?.AUTH_USERS).toBe('1 user(s)');
    expect(out.readiness?.status).toBe('ready');
    expect(out.dockerRun).toContain('-e AUTH_SESSION_SECRET_FILE=/run/secrets/auth_session_secret');
    expect(JSON.stringify(out)).not.toMatch(/scrypt\$/);
    const steps = events.flatMap((e) =>
      e.type === 'workflow-step' && e.status !== 'running' ? [`${e.stepId}:${e.status}`] : [],
    );
    expect(steps).toEqual(['parse:success', 'secrets:success', 'readiness:success', 'validate:success']);
  });

  it('a missing mounted secret is refused and named, both forms at once too', async () => {
    const missing = await run({ mountSessionSecret: false });
    expect(missing.out.accepted).toBe(false);
    expect(missing.out.problems).toEqual([
      { key: 'AUTH_SESSION_SECRET_FILE', message: 'AUTH_SESSION_SECRET_FILE points to a file that cannot be read' },
    ]);
    expect(missing.check('config-accepted')?.passed).toBe(false);

    const removed = await run({ envText: EXAMPLE_ENV.replace(/^AUTH_SESSION_SECRET_FILE=.*$/m, '') });
    expect(removed.out.problems.map((p) => p.key)).toEqual(['AUTH_SESSION_SECRET']);
    expect(removed.out.problems[0]?.message).toContain('set AUTH_SESSION_SECRET or AUTH_SESSION_SECRET_FILE');

    const both = await run({ envText: `${EXAMPLE_ENV}\nAUTH_SESSION_SECRET=placeholder-value-that-is-long-enough-123` });
    expect(both.out.problems[0]?.message).toBe('set either AUTH_SESSION_SECRET or AUTH_SESSION_SECRET_FILE, not both');
    expect(JSON.stringify(both.out)).not.toContain('placeholder-value-that-is-long-enough-123');
  });

  it('refuses the development login in production and inline secrets fail the files check', async () => {
    const dev = await run({ envText: EXAMPLE_ENV.replace('AUTH_PROVIDER=password', 'AUTH_PROVIDER=dev') });
    expect(dev.out.problems.map((p) => p.key)).toEqual(['AUTH_PROVIDER']);
    const inline = await run({
      envText: EXAMPLE_ENV.replace(/^AUDIT_HMAC_KEY_FILE=.*$/m, 'AUDIT_HMAC_KEY=inline-placeholder-key-0123456789abcdef'),
    });
    expect(inline.out.accepted).toBe(true);
    expect(inline.check('secrets-from-files')).toMatchObject({ passed: false, message: 'inline: AUDIT_HMAC_KEY' });
    expect(inline.out.effective?.AUDIT_HMAC_KEY).not.toContain('inline-placeholder');
  });

  it('development starts with warnings; unknown keys are reported', async () => {
    const r = await run({
      profile: 'development',
      envText: 'LOG_LEVL=debug',
      mountUsers: false,
      mountSessionSecret: false,
      mountAuditKey: false,
    });
    expect(r.out.accepted).toBe(true);
    expect(r.out.unknownKeys).toEqual(['LOG_LEVL']);
    expect(r.out.warnings.map((w) => w.key)).toEqual(['AUTH_SESSION_SECRET', 'AUDIT_HMAC_KEY']);
    expect(r.res?.validation?.passed).toBe(true);
  });

  it.each([
    ['storage-down', 'storage'],
    ['data-dir-read-only', 'data-dir'],
    ['runner-draining', 'runner'],
  ])('simulated %s fails only the %s check', async (simulate, check) => {
    const r = await run({ simulate });
    expect(r.out.readiness?.status).toBe('not-ready');
    expect(r.out.readiness?.checks.filter((c) => c.status === 'fail').map((c) => c.name)).toEqual([check]);
    expect(r.check('readiness-reflects')?.passed).toBe(true);
  });

  it('refuses values that look like real provider keys', () => {
    for (const v of [
      'OPENAI_API_KEY=sk-proj-abcdefghijklmnop1234',
      'ANTHROPIC_API_KEY=sk-ant-api03-abcdefghijklmnop',
      'GOOGLE_API_KEY=AIzaSyA1234567890abcdefghij',
    ])
      expect(Lab72InputSchema.safeParse({ ...base, envText: v }).success).toBe(false);
    expect(Lab72InputSchema.safeParse(base).success).toBe(true);
  });
});
