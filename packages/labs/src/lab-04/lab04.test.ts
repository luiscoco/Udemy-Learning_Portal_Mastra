import { afterAll, describe, expect, it } from 'vitest';
import { LabError, LabRegistry, LabRunner } from '@mlp/lab-engine';
import { createLabServices } from '../services.js';
import { simulatedAnswer } from '../shared/simulated.js';
import { lab04 } from './run.js';

const example = lab04.definition.exampleInput;
const SECRET = 'sk-test-lab04-SHOULD-NOT-APPEAR-123';

const runner = new LabRunner({
  registry: new LabRegistry([lab04]),
  services: createLabServices({ serverMode: 'offline', env: { OPENAI_API_KEY: SECRET } }),
  liveEnabled: false,
  secrets: [SECRET],
});
afterAll(() => runner.dispose());

describe('lab-04 model and instructions', () => {
  it('rejects an unsupported model with a field-level message listing tested ids', () => {
    try {
      runner.start('lab-04', { input: { ...example, modelId: 'openai/gpt-99-ultra' } });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(LabError);
      const detail = (err as LabError).details?.find((d) => d.path === 'input.modelId');
      expect(detail?.message).toMatch(/not a known/);
      expect(detail?.message).toContain('openai/gpt-5-mini');
    }
  });

  it('records the selected models and instructions hash without secrets', async () => {
    const r = runner.start('lab-04', { input: example });
    await runner.waitFor(r.runId);
    const result = runner.events(r.runId).find((e) => e.type === 'result');
    expect(result).toMatchObject({
      validation: { passed: true },
      effective: { models: ['openai/gpt-5-mini', 'anthropic/claude-haiku-4-5'], mode: 'offline' },
    });
    expect(JSON.stringify(runner.events(r.runId))).not.toContain(SECRET);
  });

  it('live mode with a registry-valid but non-allowlisted model explains how to enable it', async () => {
    const live = new LabRunner({
      registry: new LabRegistry([lab04]),
      services: createLabServices({ serverMode: 'live', env: { OPENAI_API_KEY: SECRET, LIVE_MODELS: 'openai/gpt-5-mini' } }),
      liveEnabled: true,
    });
    try {
      const r = live.start('lab-04', { input: { ...example, modelId: 'openai/gpt-4.1' }, mode: 'live' });
      await live.waitFor(r.runId);
      const err = live.events(r.runId).find((e) => e.type === 'error');
      expect(err).toMatchObject({ code: 'NOT_CONFIGURED' });
      expect(err?.type === 'error' && err.message).toContain('LIVE_MODELS');
    } finally {
      await live.dispose();
    }
  });

  it('simulator reacts to instruction cues and model provider', () => {
    expect(simulatedAnswer({ modelId: 'openai/gpt-5-mini', system: 'Pirate. Be brief.', user: 'Hi?' })).toBe(
      '[simulated openai/gpt-5-mini] Arr, matey! About "Hi": here is a simulated answer.',
    );
    expect(simulatedAnswer({ modelId: 'google/gemini-2.5-flash', system: 'x', user: 'Q', label: false })).toMatch(
      /^1\. About "Q"/,
    );
  });
});
