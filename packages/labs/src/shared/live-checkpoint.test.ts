import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { summarizeChecks, type ExecutionEvent } from '@mlp/contracts';
import { LabRegistry, LabRunner, type LabImplementation, type RunContext } from '@mlp/lab-engine';
import { ScriptedLanguageModel, type PromptView, type ScriptedTurn } from '@mlp/mastra-runtime';
import { allLabs, createLabServices, type LabServices } from '../index.js';
import { lab00Definition } from '../lab-00/definition.js';
import { LIVE_CHECKPOINT_QUESTIONS } from './live-checkpoint-definition.js';
import { checkpointEvidence, withLiveCheckpoint } from './live-checkpoint.js';

const runners: LabRunner<LabServices>[] = [];
afterEach(async () => {
  await Promise.all(runners.splice(0).map((runner) => runner.dispose()));
  vi.unstubAllEnvs();
});

function fixture(
  script: (view: PromptView) => ScriptedTurn = () => ({ text: 'The result demonstrates a safe lesson boundary.' }),
  keys = true,
) {
  const provider = new ScriptedLanguageModel({ script });
  const services = createLabServices({
    serverMode: 'live',
    env: keys ? { ANTHROPIC_API_KEY: 'fixture-only-key', OPENAI_API_KEY: 'fixture-only-key' } : {},
  });
  const actualResolve = services.models.resolve;
  const resolve = vi.spyOn(services.models, 'resolve').mockImplementation((options) => {
    const checked = actualResolve(options);
    return { ...checked, model: provider, simulated: false };
  });
  const practical = vi.fn(async (_ctx: RunContext<LabServices>, input: { value: string; provider?: string }) => ({
    value: input.value,
  }));
  const base: LabImplementation<{ value: string; provider?: string }, { value: string }, LabServices> = {
    definition: {
      ...lab00Definition,
      inputs: [{ name: 'value', label: 'Value', kind: 'text', required: true, maxLength: 20000 }],
      exampleInput: { value: 'example' },
    },
    inputSchema: z.object({ value: z.string(), provider: z.string().optional() }),
    outputSchema: z.object({ value: z.string() }),
    run: practical,
    validate: () => summarizeChecks([{ id: 'practical', label: 'Practical result', passed: true }]),
  };
  const runner = new LabRunner({ registry: new LabRegistry([withLiveCheckpoint(base)]), services, liveEnabled: true });
  runners.push(runner);
  const start = (mode: 'offline' | 'live', input: Record<string, unknown> = { value: 'example' }) =>
    runner.start('lab-00', { mode, input });
  const finish = async (id: string) => {
    const snapshot = await runner.waitFor(id);
    const events = runner.events(id);
    return { snapshot, events, result: events.find((event) => event.type === 'result') };
  };
  return { runner, provider, practical, resolve, start, finish };
}

describe('course-wide live checkpoints', () => {
  it('offers both modes in all 75 lessons and orientation, with a complete checkpoint adapter for each missing path', () => {
    expect(allLabs).toHaveLength(76);
    expect(Object.keys(LIVE_CHECKPOINT_QUESTIONS)).toHaveLength(13);
    for (const { implementation } of allLabs) {
      const definition = implementation.definition;
      expect(definition.execution.modes, definition.id).toEqual(['offline', 'live']);
      if (LIVE_CHECKPOINT_QUESTIONS[definition.id]) {
        expect(definition.sourceFiles.some((file) => file.path === 'shared/live-checkpoint.ts')).toBe(true);
        expect(definition.execution.costNotice).toContain('provider charges apply');
        expect(definition.inputs.find((field) => field.name === 'liveModelId')).toBeDefined();
      }
    }
  });

  it('keeps offline output/schema/checks intact without resolving a provider', async () => {
    const test = fixture();
    const run = test.start('offline', { value: 'example', liveModelId: '' });
    const { snapshot, result } = await test.finish(run.runId);
    expect(snapshot.status).toBe('succeeded');
    expect(result?.type === 'result' && result.output).toEqual({ value: 'example' });
    expect(result?.type === 'result' && result.validation?.checks).toHaveLength(2);
    expect(test.resolve).not.toHaveBeenCalled();
  });

  it('executes the actual Mastra agent with a deterministic test provider and preserves the checkpoint through an output schema', async () => {
    let received: PromptView | undefined;
    const test = fixture((view) => {
      received = view;
      return { text: 'A model explains the completed practical result.' };
    });
    const run = test.start('live');
    const { snapshot, events, result } = await test.finish(run.runId);
    expect(snapshot.status).toBe('succeeded');
    expect(test.resolve).toHaveBeenCalledWith(expect.objectContaining({ mode: 'live', modelId: 'anthropic/claude-haiku-4-5' }));
    expect(received?.options.maxOutputTokens).toBe(2048);
    expect(received?.toolNames).toEqual([]);
    expect(result?.type === 'result' && result.output).toMatchObject({
      value: 'example',
      liveCheckpoint: { simulated: false, answer: 'A model explains the completed practical result.' },
    });
    expect(result?.type === 'result' && result.validation?.passed).toBe(true);
    expect(
      events.some((event) => event.type === 'workflow-step' && event.stepId === 'live-checkpoint' && event.status === 'success'),
    ).toBe(true);
  });

  it('honors a selected provider and explicit enabled model; refuses an unknown model before practical work', async () => {
    for (const input of [
      { value: 'example', provider: 'openai' },
      { value: 'example', liveModelId: 'openai/gpt-5-mini' },
    ]) {
      const test = fixture();
      const run = test.start('live', input);
      expect((await test.finish(run.runId)).snapshot.status).toBe('succeeded');
      expect(test.resolve).toHaveBeenCalledWith(expect.objectContaining({ modelId: 'openai/gpt-5-mini' }));
    }
    const test = fixture();
    const run = test.start('live', { value: 'example', liveModelId: 'unknown/unavailable' });
    expect((await test.finish(run.runId)).snapshot.status).toBe('failed');
    expect(test.practical).not.toHaveBeenCalled();
  });

  it('bounds and redacts provider context before generation', async () => {
    const secret = 'server-only-private-fixture-value';
    vi.stubEnv('OPENAI_API_KEY', secret);
    let prompt = '';
    const test = fixture((view) => {
      prompt = view.lastUser;
      return { text: 'Bounded and redacted.' };
    });
    const run = test.start('live', { value: secret + 'x'.repeat(20_000) });
    expect((await test.finish(run.runId)).snapshot.status).toBe('succeeded');
    expect(prompt).not.toContain(secret);
    expect(prompt.length).toBeLessThan(7_000);
    expect(checkpointEvidence({ value: secret }, [secret])).not.toContain(secret);
  });

  it('refuses missing keys before practical work and never replaces provider errors or empty output with success', async () => {
    const missing = fixture(undefined, false);
    const run = missing.start('live');
    expect((await missing.finish(run.runId)).snapshot.status).toBe('failed');
    expect(missing.practical).not.toHaveBeenCalled();
    for (const turn of [{ error: new Error('private-provider-error') }, { text: '' }]) {
      const test = fixture(() => turn);
      const run = test.start('live');
      const { snapshot, result, events } = await test.finish(run.runId);
      expect(snapshot.status).toBe('failed');
      expect(result).toBeUndefined();
      expect(events.some((event) => event.type === 'error')).toBe(true);
    }
  });

  it('cancels a provider call without a fabricated result', async () => {
    const test = fixture(() => ({ text: 'too late', delayMs: 5_000 }));
    const run = test.start('live');
    await vi.waitFor(() =>
      expect(
        test.runner
          .events(run.runId)
          .some((event: ExecutionEvent) => event.type === 'workflow-step' && event.stepId === 'live-checkpoint'),
      ).toBe(true),
    );
    test.runner.cancel(run.runId);
    const { snapshot, result } = await test.finish(run.runId);
    expect(snapshot.status).toBe('cancelled');
    expect(result).toBeUndefined();
  });
});
