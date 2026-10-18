import { afterAll, describe, expect, it } from 'vitest';
import { LabRegistry, LabRunner } from '@mlp/lab-engine';
import { createLabServices } from '../services.js';
import { fieldErrorsFromText, tryWithoutToken } from './external.js';
import { planExposure, startFacade } from './facade.js';
import { createRegistry } from './registry.js';
import { lab49, type Lab49Output } from './run.js';

const runner = new LabRunner({
  registry: new LabRegistry([lab49]),
  services: createLabServices({ serverMode: 'offline', env: {} }),
  liveEnabled: false,
});
afterAll(() => runner.dispose());

type Result = { output: Lab49Output; validation: { passed: boolean; checks: { id: string; passed: boolean }[] } };
async function run(input: Record<string, unknown> = {}) {
  const r = runner.start('lab-49', { input: { ...lab49.definition.exampleInput, ...input } });
  await runner.waitFor(r.runId);
  const events = runner.events(r.runId);
  const result = events.find((e) => e.type === 'result') as Result | undefined;
  if (!result) throw new Error(JSON.stringify(events.filter((e) => e.type === 'error' || e.type === 'complete')));
  return { ...result, events };
}

describe('lab-49 façade (unit)', () => {
  it('publishes only allowlisted read-only tools', () => {
    const { candidates } = createRegistry();
    const plan = planExposure(candidates, ['format_currency', 'issue_refund', 'lookup_order', 'nope']);
    expect(plan.exposed.map((c) => c.id)).toEqual(['format_currency']);
    expect(plan.refused.map((r) => [r.id, r.reason])).toEqual([
      ['calculate_order_total', 'not-allowlisted'],
      ['inventory_lookup', 'not-allowlisted'],
      ['lookup_order', 'personal-data'],
      ['issue_refund', 'side-effect'],
    ]);
    expect(plan.unknownIds).toEqual(['nope']);
  });

  it('rejects wrong tokens and oversized bodies before MCP handles them', async () => {
    const facade = await startFacade([]);
    try {
      const noToken = await tryWithoutToken(facade.url);
      expect(noToken).toMatchObject({ rejected: true, httpStatus: 401 });
      const wrong = await fetch(facade.url, { method: 'POST', headers: { authorization: 'Bearer wrong' }, body: '{}' });
      expect(wrong.status).toBe(401);
      const big = await fetch(facade.url, {
        method: 'POST',
        headers: { authorization: `Bearer ${facade.token}`, 'content-type': 'application/json' },
        body: 'x'.repeat(70_000),
      });
      expect(big.status).toBe(413);
      expect(facade.requests).toEqual({ total: 3, unauthorized: 2, tooLarge: 1 });
    } finally {
      await facade.close();
    }
    expect(facade.openSockets()).toBe(0);
  });

  it('parses server-side validation messages', () => {
    expect(
      fieldErrorsFromText('Tool input validation failed for x.\n- amountCents: Too small\n- currency: Invalid option'),
    ).toEqual([
      { field: 'amountCents', message: 'Too small' },
      { field: 'currency', message: 'Invalid option' },
    ]);
  });
});

describe('lab-49 Expose Mastra over MCP (DoD)', () => {
  it('an external MCP client discovers and calls an allowlisted tool', async () => {
    const { output, validation, events } = await run();
    expect(validation.passed, JSON.stringify(validation.checks)).toBe(true);
    expect(output.external.discovered.sort()).toEqual(['calculate_order_total', 'format_currency', 'inventory_lookup']);
    expect(output.mcpCatalog.tools.every((t) => t.annotations?.readOnlyHint === true)).toBe(true);
    expect(output.mcpCatalog.call).toMatchObject({ status: 'success', result: { formatted: '€18.39' } });
    expect(output.audit).toEqual([{ seq: 1, tool: 'format_currency', status: 'ok', ms: expect.any(Number), argBytes: 37 }]);
    expect(output.external.unauthenticated).toMatchObject({ rejected: true, httpStatus: 401 });
    // The per-run token never leaves the façade.
    expect(JSON.stringify({ output, events })).not.toMatch(/Bearer [A-Za-z0-9_-]{20,}/);
  });

  it('an unpublished side-effect tool is refused by the server and never runs', async () => {
    const { output, validation } = await run({
      expose: ['format_currency', 'issue_refund'],
      toolName: 'issue_refund',
      args: { orderId: 'ORD-1001', amountCents: 100, reason: 'test' },
    });
    expect(validation.passed).toBe(true);
    expect(output.facade.refused.find((r) => r.id === 'issue_refund')).toMatchObject({ reason: 'side-effect' });
    expect(output.mcpCatalog.call).toMatchObject({ status: 'rejected', reason: 'unknown-tool' });
    expect(output.audit).toEqual([]);
    expect(output.refundExecutions).toBe(0);
  });
});
