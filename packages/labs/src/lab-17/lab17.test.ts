import { afterAll, describe, expect, it } from 'vitest';
import { LabRegistry, LabRunner } from '@mlp/lab-engine';
import { createLabServices } from '../services.js';
import { ALLOWED_KEYS, buildRequestContext } from './context.js';
import { lab17, type Lab17Output } from './run.js';

const runner = new LabRunner({
  registry: new LabRegistry([lab17]),
  services: createLabServices({ serverMode: 'offline', env: {} }),
  liveEnabled: false,
});
afterAll(() => runner.dispose());

const claims = { tenantId: 'acme', userId: 'u-1001', plan: 'pro' };

describe('lab-17 context builder (unit)', () => {
  it('keeps verified claims and only allowlisted headers', () => {
    const built = buildRequestContext(claims, { 'X-Locale': 'de-DE', 'x-tenant-id': 'globex', cookie: 'session=1' });
    expect(built.context).toEqual({ ...claims, locale: 'de-DE', requestId: 'req-0000' });
    expect([...built.requestContext.keys()].sort()).toEqual([...ALLOWED_KEYS].sort());
    expect(built.rejected).toEqual([
      { source: 'headers', key: 'x-tenant-id', reason: 'cannot override a verified claim' },
      { source: 'headers', key: 'cookie', reason: 'not on the allowlist' },
    ]);
  });

  it('rejects reserved Mastra keys from either source', () => {
    const built = buildRequestContext({ ...claims, mastra__threadId: 't' }, { mastra__authToken: 'x' });
    expect(built.rejected.map((r) => r.reason)).toEqual(['reserved Mastra key', 'reserved Mastra key']);
  });

  it('fails closed on invalid claims', () => {
    expect(() => buildRequestContext({ ...claims, userId: 'admin' }, {})).toThrowError(
      expect.objectContaining({ code: 'VALIDATION_FAILED' }),
    );
  });
});

describe('lab-17 injection attempt (DoD)', () => {
  it('agent and tool receive only allowlisted context; the injected tenant is ignored', async () => {
    const r = runner.start('lab-17', { input: lab17.definition.exampleInput });
    await runner.waitFor(r.runId);
    const result = runner.events(r.runId).find((e) => e.type === 'result') as {
      output: Lab17Output;
      validation: { passed: boolean };
    };
    const out = result.output;
    expect(result.validation.passed).toBe(true);
    expect(out.agentSawKeys.sort()).toEqual([...ALLOWED_KEYS].sort());
    expect(out.tool[0]!.contextKeys.sort()).toEqual([...ALLOWED_KEYS].sort());
    // The gullible model really tried; Mastra stripped the argument and the tool used the context tenant.
    expect(out.modelToolArgs).toEqual([{ status: 'open', tenantId: 'globex' }]);
    expect(out.tool[0]!.input).toEqual({ status: 'open' });
    expect(out.tool[0]!.tenantUsed).toBe('acme');
    expect(out.answer).toContain('INV-A-001');
    expect(out.answer).not.toMatch(/INV-G-/);
    const warnings = runner.events(r.runId).filter((e) => e.type === 'log' && e.level === 'warn');
    expect(warnings.map((e) => (e as { message: string }).message)).toContain(
      'Model tried tenantId=globex; the tool ignored it.',
    );
  });

  it('invalid claims are refused before any model call', async () => {
    const r = runner.start('lab-17', {
      input: { ...lab17.definition.exampleInput, authClaims: { ...claims, tenantId: 'Acme Corp!' } },
    });
    await runner.waitFor(r.runId);
    const events = runner.events(r.runId);
    expect(events.find((e) => e.type === 'error')).toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(events.some((e) => e.type === 'tool-start' || e.type === 'token')).toBe(false);
  });
});
