import { afterAll, describe, expect, it } from 'vitest';
import { LabRegistry, LabRunner } from '@mlp/lab-engine';
import { createLabServices } from '../services.js';
import { testMemoryDir } from '../test-memory.js';
import { keywordsOf, rememberedUserLines } from './recall.js';
import { lab24, type Lab24Output } from './run.js';

const runner = new LabRunner({
  registry: new LabRegistry([lab24]),
  services: createLabServices({ serverMode: 'offline', env: {}, memoryDir: testMemoryDir('lab24') }),
  liveEnabled: false,
});
afterAll(() => runner.dispose());

async function run(overrides: Record<string, unknown> = {}) {
  const r = runner.start('lab-24', { input: { ...lab24.definition.exampleInput, ...overrides } });
  await runner.waitFor(r.runId);
  const events = runner.events(r.runId);
  return { events, result: events.find((e) => e.type === 'result') as { output: Lab24Output; validation: { passed: boolean } } };
}

describe('lab-24 helpers', () => {
  it('parses Mastra’s remembered block and extracts fact keywords', () => {
    const system =
      'x <remembered_from_other_conversation>\nMessage from previous conversation at 2:19 PM: User: I’m allergic to peanuts.\nMessage from previous conversation at 2:19 PM: Assistant: ok\n<end_remembered_from_other_conversation> y';
    expect(rememberedUserLines(system)).toEqual(['I’m allergic to peanuts.']);
    expect(keywordsOf("I'm allergic to peanuts.")).toEqual(['allergic', 'peanut']);
  });
});

describe('lab-24 semantic recall (DoD)', () => {
  it('recalls the relevant older fact from another conversation, for this user only', async () => {
    const { result } = await run();
    expect(result.validation.passed).toBe(true);
    const q = result.output.questionQuery!;
    expect(q.filter).toEqual({ resource_id: 'learner' });
    expect(q.hits[0]).toMatchObject({ content: "I'm allergic to peanuts.", owner: 'you', thread: 'earlier-chat' });
    expect(q.hits.some((h) => h.content.includes('shellfish'))).toBe(false);
    // Mastra injected the recalled message into the prompt as "remembered from a different conversation".
    expect(result.output.promptRemembered).toContain("I'm allergic to peanuts.");
  });

  it('works unchanged with a stubbed vector service (the in-memory stub)', async () => {
    const { result } = await run({ vectorBackend: 'in-memory' });
    expect(result.validation.passed).toBe(true);
    expect(result.output.questionQuery?.hits[0]?.content).toBe("I'm allergic to peanuts.");
    expect(result.output.vectorsStored).toBeGreaterThan(0);
  });

  it('recall off or thread scope does not find the fact', async () => {
    const off = await run({ semanticRecall: false });
    expect(off.result.output).toMatchObject({ questionQuery: null, recalledFact: false });
    const thread = await run({ scope: 'thread' });
    expect(thread.result.output.recalledFact).toBe(false);
  });
});

describe('lab-24 fact matching', () => {
  it('counts the user’s own assistant echoes, never another user’s messages', async () => {
    const { carriesFact } = await import('./run.js');
    const hit = (content: string, owner: 'you' | 'other user') => ({
      role: 'assistant',
      content,
      score: 0.5,
      owner,
      thread: 'earlier-chat',
    });
    expect(carriesFact(hit('Thanks — noted: allergic to peanuts.', 'you'), "I'm allergic to peanuts.")).toBe(true);
    expect(carriesFact(hit("I'm allergic to peanuts.", 'other user'), "I'm allergic to peanuts.")).toBe(false);
    expect(carriesFact(hit('Noted your dog Rex.', 'you'), "I'm allergic to peanuts.")).toBe(false);
  });
});
