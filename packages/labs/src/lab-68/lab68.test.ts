import { afterAll, describe, expect, it } from 'vitest';
import { LabRegistry, LabRunner } from '@mlp/lab-engine';
import { createLabServices } from '../services.js';
import { lab68Definition } from './definition.js';
import { Lab68InputSchema, lab68, type Lab68Output } from './run.js';

const runner = new LabRunner({
  registry: new LabRegistry([lab68]),
  services: createLabServices({ serverMode: 'offline', env: {} }),
  liveEnabled: false,
});
afterAll(() => runner.dispose());
const base = { ...lab68Definition.exampleInput, stepDelayMs: 0 };

async function run(input: Record<string, unknown>) {
  const r = runner.start('lab-68', { input: { ...base, ...input } });
  const snap = await runner.waitFor(r.runId);
  const events = runner.events(r.runId);
  const result = events.find((e) => e.type === 'result');
  return {
    snap,
    events,
    result: result?.type === 'result' ? result : undefined,
    out: (result?.type === 'result' ? result.output : undefined) as Lab68Output,
  };
}

describe('Lab 68', () => {
  it('emits the graph first, then live statuses that match Mastra, with the untaken branch skipped', async () => {
    const { snap, events, result, out } = await run({});
    expect(snap.status).toBe('succeeded');
    expect(result?.validation?.passed).toBe(true);
    const graphAt = events.findIndex((e) => e.type === 'workflow-graph');
    const firstStep = events.findIndex((e) => e.type === 'workflow-step');
    expect(graphAt).toBeGreaterThanOrEqual(0);
    expect(graphAt).toBeLessThan(firstStep);
    expect(out.graph!.nodes.map((n) => n.id)).toEqual([
      'validateOrder',
      'checkStock',
      'checkFraud',
      'decide',
      'managerReview',
      'autoApprove',
      'listItems',
      'packItem',
      'shipping',
      'shipping.bookCourier',
      'shipping.notifyCustomer',
    ]);
    expect(out.statuses).toMatchObject({
      autoApprove: 'success',
      managerReview: 'skipped',
      packItem: 'success',
      'shipping.notifyCustomer': 'success',
    });
    expect(Object.values(out.statuses).filter((s) => s === 'success')).toHaveLength(10);
    // Every graph node id is a step id the stream actually used (or a skipped alternative).
    const streamed = new Set(events.flatMap((e) => (e.type === 'workflow-step' ? [e.stepId.replace(/\[\d+\]$/, '')] : [])));
    for (const n of out.graph!.nodes) expect(streamed.has(n.id) || out.statuses[n.id] === 'skipped').toBe(true);
  });

  it('the other branch, a failing step and a failing nested step are reflected', async () => {
    const big = await run({ orderValue: 900 });
    expect(big.result?.validation?.passed).toBe(true);
    expect(big.out.statuses).toMatchObject({ managerReview: 'success', autoApprove: 'skipped' });
    const fraud = await run({ failStep: 'checkFraud' });
    expect(fraud.result?.validation?.passed).toBe(true);
    expect(fraud.out.statuses).toMatchObject({
      checkFraud: 'failed',
      decide: 'not-reached',
      managerReview: 'not-reached',
      'shipping.bookCourier': 'not-reached',
    });
    expect(fraud.out.workflowStatus).toBe('failed');
    const nested = await run({ failStep: 'bookCourier' });
    expect(nested.result?.validation?.passed).toBe(true);
    expect(nested.out.statuses).toMatchObject({
      packItem: 'success',
      'shipping.bookCourier': 'failed',
      'shipping.notifyCustomer': 'not-reached',
    });
  });

  it('a hidden workflow is indistinguishable from one that does not exist', async () => {
    const hidden = await run({ workflowId: 'refund-override' });
    const unknown = await run({ workflowId: 'no-such-workflow' });
    const strip = (o: Lab68Output) => ({ ...o, requested: '' });
    expect(strip(hidden.out)).toEqual(strip(unknown.out));
    expect(hidden.out.visible).toEqual([{ id: 'order-fulfilment', title: 'Order fulfilment' }]);
    expect(hidden.events.some((e) => e.type === 'workflow-graph')).toBe(false);
    const logs = (r: typeof hidden) =>
      r.events.filter((e) => e.type === 'log').map((e) => (e.type === 'log' ? e.message.replace(/".*"/, '"x"') : ''));
    expect(logs(hidden)).toEqual(logs(unknown));
    expect(JSON.stringify(hidden.events)).not.toMatch(/Refund override|overrideDecision|loadCase/);
    const supervisor = await run({ role: 'supervisor', workflowId: 'refund-override' });
    expect(supervisor.out.found).toBe(true);
    expect(supervisor.out.visible.map((w) => w.id)).toEqual(['order-fulfilment', 'refund-override']);
    expect((await run({ role: 'supervisor', workflowId: 'payroll-export' })).out.found).toBe(false);
  });

  it('validates inputs', () => {
    expect(Lab68InputSchema.safeParse({ ...base, items: 9 }).success).toBe(false);
    expect(Lab68InputSchema.safeParse({ ...base, role: 'admin' }).success).toBe(false);
  });
});
