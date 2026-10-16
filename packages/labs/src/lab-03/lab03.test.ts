import { afterAll, describe, expect, it } from 'vitest';
import { LabRegistry, LabRunner } from '@mlp/lab-engine';
import { createLabServices } from '../services.js';
import { lab03 } from './run.js';

const example = lab03.definition.exampleInput;

function makeRunner(env: Record<string, string> = {}, liveEnabled = false) {
  return new LabRunner({
    registry: new LabRegistry([lab03]),
    services: createLabServices({ serverMode: liveEnabled ? 'live' : 'offline', env }),
    liveEnabled,
  });
}
const runner = makeRunner();
afterAll(() => runner.dispose());

describe('lab-03 first agent', () => {
  it('invocation returns text with the stubbed model and lookup by id succeeds', async () => {
    const r = runner.start('lab-03', { input: example });
    expect((await runner.waitFor(r.runId)).status).toBe('succeeded');
    const result = runner.events(r.runId).find((e) => e.type === 'result');
    expect(result).toMatchObject({
      validation: { passed: true },
      output: { lookup: { byId: { id: 'support-agent' }, sameInstance: true }, model: { simulated: true } },
      effective: { modelId: 'openai/gpt-5-mini', simulated: true },
    });
    const out = (result as { output: { text: string; systemPromptSeen: string } }).output;
    expect(out.text).toContain('Do you ship to Canada?');
    expect(out.systemPromptSeen).toContain('online bookstore');
  });

  it('emits lookup tool calls for getAgent and getAgentById', async () => {
    const r = runner.start('lab-03', { input: example });
    await runner.waitFor(r.runId);
    const tools = runner.events(r.runId).filter((e) => e.type === 'tool-finish');
    expect(tools.map((t) => (t.type === 'tool-finish' ? t.toolName : ''))).toEqual(['mastra.getAgent', 'mastra.getAgentById']);
  });

  it('live mode without a provider key fails with NOT_CONFIGURED naming the variable', async () => {
    const live = makeRunner({}, true);
    try {
      const r = live.start('lab-03', { input: example, mode: 'live' });
      await live.waitFor(r.runId);
      const err = live.events(r.runId).find((e) => e.type === 'error');
      expect(err).toMatchObject({ code: 'NOT_CONFIGURED' });
      expect(err?.type === 'error' && err.message).toContain('OPENAI_API_KEY');
    } finally {
      await live.dispose();
    }
  });

  it('rejects invalid key/id formats before running', () => {
    expect(() => runner.start('lab-03', { input: { ...example, agentKey: 'Bad Key' } })).toThrowError(
      expect.objectContaining({ code: 'VALIDATION_FAILED' }),
    );
  });
});
