import { afterAll, describe, expect, it } from 'vitest';
import { LabRegistry, LabRunner } from '@mlp/lab-engine';
import { createLabServices } from '../services.js';
import { testMemoryDir } from '../test-memory.js';
import { guardClaims } from '../lab-44/claims.js';
import { lab70Definition } from './definition.js';
import { passagesOf, sampleDocuments, search } from './knowledge.js';
import { Lab70InputSchema, lab70, type Lab70Output } from './run.js';

const services = createLabServices({ serverMode: 'offline', env: {}, memoryDir: testMemoryDir('lab-70') });
const runner = new LabRunner({
  registry: new LabRegistry([lab70]),
  services,
  servicesFor: (o) => services.forTenant(o),
  liveEnabled: false,
});
afterAll(() => runner.dispose());
const base = lab70Definition.exampleInput;
let n = 0;
const thread = () => `ws-${process.pid}-${++n}`;

async function run(input: Record<string, unknown>, ownerId = 'dev:alice') {
  const r = runner.start('lab-70', { input: { ...base, ...input } }, { ownerId });
  const snap = await runner.waitFor(r.runId);
  const events = runner.events(r.runId);
  const result = events.find((e) => e.type === 'result');
  return {
    snap,
    events,
    result: result?.type === 'result' ? result : undefined,
    out: (result?.type === 'result' ? result.output : undefined) as Lab70Output,
  };
}

describe('knowledge', () => {
  it('splits documents into passages and finds the refund policy', () => {
    const passages = passagesOf(sampleDocuments());
    expect(passages.map((p) => p.id)).toContain('refund-policy#2');
    expect(search('How long do refunds take?', passages)[0]?.id).toMatch(/^refund-policy#/);
  });
  it('the guard blocks a quote that was not retrieved', () => {
    const passages = passagesOf(sampleDocuments());
    const g = guardClaims(
      JSON.stringify({
        claims: [{ text: 'Refunds are instant.', citations: [{ id: 'refund-policy#2', quote: 'Refunds are instant.' }] }],
      }),
      passages,
      { enforce: true },
    );
    expect(g.citedAnswer.claims).toEqual([]);
    expect(g.verdicts[0]?.accepted).toBe(false);
  });
});

describe('Lab 70', () => {
  it('seeds idempotently into the learner’s own library', async () => {
    const first = await run({ action: 'seed', threadId: thread() }, 'dev:seeder');
    expect(first.result?.validation?.passed).toBe(true);
    expect(first.out.workspace.seeded).toEqual({ added: 3, existing: 0 });
    const again = await run({ action: 'seed', threadId: thread() }, 'dev:seeder');
    expect(again.out.workspace.seeded).toEqual({ added: 0, existing: 3 });
    expect(again.out.workspace.documents.map((d) => d.name).sort()).toEqual([
      'refund-policy.md',
      'shipping-policy.md',
      'warranty.md',
    ]);
  });

  it('a question plans tasks, searches, ticks tasks off live and answers with verified citations', async () => {
    await run({ action: 'seed', threadId: thread() });
    const t = thread();
    const { snap, events, result, out } = await run({ threadId: t });
    expect(snap.status).toBe('succeeded');
    expect(result?.validation?.passed).toBe(true);
    expect(out.workspace.tasks.map((x) => x.status)).toEqual(['done', 'done', 'done']);
    const taskEvents = events.flatMap((e) =>
      e.type === 'workflow-step' && e.stepId.startsWith('task:') ? [`${e.stepId}:${e.status}`] : [],
    );
    expect(taskEvents.slice(0, 3)).toEqual(['task:1:running', 'task:2:waiting', 'task:3:waiting']);
    expect(taskEvents).toContain('task:3:success');
    expect(events.some((e) => e.type === 'tool-start' && e.toolName === 'searchDocs')).toBe(true);
    const claims = out.workspace.citedAnswer!.claims;
    expect(claims.length).toBeGreaterThan(0);
    for (const c of claims)
      for (const ct of c.citations) expect(out.workspace.citedAnswer!.sources[ct.sourceId]!.text).toContain(ct.quote);
    expect(out.workspace.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(out.workspace.messages[1]!.text).not.toContain('{'); // shown as claim text, not JSON
    const history = await run({ action: 'history', threadId: t });
    expect(history.out.workspace.messages).toHaveLength(2);
    // A second question on the same thread plans and searches again (earlier tool results are history).
    const second = await run({ threadId: t, message: 'How long does express shipping take?' });
    expect(second.result?.validation?.passed).toBe(true);
    expect(second.out.retrieved.some((r) => r.source === 'shipping-policy.md')).toBe(true);
    expect(second.out.workspace.messages).toHaveLength(4);
  });

  it('a question the documents do not answer gets an honest empty answer', async () => {
    await run({ action: 'seed', threadId: thread() });
    const { result, out } = await run({ threadId: thread(), message: 'Do you sell bicycles?' });
    expect(result?.validation?.passed).toBe(true);
    expect(out.workspace.citedAnswer!.claims).toEqual([]);
    expect(out.workspace.messages.at(-1)!.text).toBe('The documents do not answer that.');
  });

  it('another learner’s library is never searched', async () => {
    const { out } = await run({ threadId: thread() }, 'dev:nobody-seeded');
    expect(out.workspace.documents).toEqual([]);
    expect(out.retrieved).toEqual([]);
    expect(out.workspace.citedAnswer!.claims).toEqual([]);
  });

  it('validates inputs', () => {
    expect(Lab70InputSchema.safeParse({ ...base, message: '' }).success).toBe(false);
    expect(Lab70InputSchema.safeParse({ ...base, action: 'history', message: '' }).success).toBe(true);
  });
});
