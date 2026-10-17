import { afterAll, describe, expect, it } from 'vitest';
import { LabDefinitionSchema } from '@mlp/contracts';
import { LabRegistry, LabRunner } from '@mlp/lab-engine';
import { createLabServices } from '../services.js';
import { CAPABILITIES } from './capabilities.js';
import { Lab19InputSchema, resolveOptions } from './options.js';
import { lab19, type Lab19Output } from './run.js';

const runner = new LabRunner({
  registry: new LabRegistry([lab19]),
  services: createLabServices({ serverMode: 'offline', env: {} }),
  liveEnabled: false,
});
afterAll(() => runner.dispose());

const example = lab19.definition.exampleInput;

describe('lab-19 capabilities (from the installed Mastra registry)', () => {
  it('matches the registry values this lab was written against', () => {
    // If a Mastra upgrade changes these, this test fails loudly and the lab text must be revisited.
    expect(CAPABILITIES['openai/gpt-5-mini']).toMatchObject({ temperature: false, effort: ['minimal', 'low', 'medium', 'high'] });
    expect(CAPABILITIES['openai/gpt-4o-mini']).toMatchObject({ temperature: true, effort: [], otherReasoningControls: [] });
    expect(CAPABILITIES['anthropic/claude-haiku-4-5']).toMatchObject({
      temperature: true,
      effort: [],
      otherReasoningControls: ['budget_tokens'],
    });
    expect(CAPABILITIES['google/gemini-2.5-flash']).toMatchObject({ temperature: true, effort: [] });
  });

  it('the definition only offers supported values (visibleWhen derived from capabilities)', () => {
    const def = LabDefinitionSchema.parse(lab19.definition);
    const temperature = def.inputs.find((f) => f.name === 'temperature')!;
    expect(temperature.visibleWhen?.in).not.toContain('openai/gpt-5-mini');
    expect(temperature.visibleWhen?.in).toContain('anthropic/claude-haiku-4-5');
    const effort = def.inputs.find((f) => f.name === 'reasoningEffort')!;
    expect(effort.visibleWhen?.in).toEqual(['openai/gpt-5-mini']);
  });
});

describe('lab-19 server-side enforcement', () => {
  it('rejects temperature for a model that does not support it (UI bypassed)', () => {
    expect(() => runner.start('lab-19', { input: { ...example, temperature: '0.7' } })).toThrowError(
      expect.objectContaining({ code: 'VALIDATION_FAILED', details: [expect.objectContaining({ path: 'input.temperature' })] }),
    );
  });

  it('rejects reasoning effort for a model without an effort control', () => {
    const r = Lab19InputSchema.safeParse({ ...example, modelId: 'openai/gpt-4o-mini', reasoningEffort: 'high' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toContain('has no reasoning-effort control');
  });

  it('clamps the per-call timeout to the remaining run time and records it', () => {
    const input = Lab19InputSchema.parse({ ...example, stepTimeoutMs: 60_000 });
    const e = resolveOptions(input, 10_000);
    expect(e.modelSettings.timeout.stepMs).toBe(9_000);
    expect(e.clamped).toEqual([
      { option: 'stepTimeoutMs', requested: 60_000, applied: 9_000, reason: 'cannot exceed the remaining run time' },
    ]);
  });
});

describe('lab-19 runs (DoD: effective options recorded)', () => {
  async function run(overrides: Record<string, unknown> = {}) {
    const r = runner.start('lab-19', { input: { ...example, ...overrides } });
    await runner.waitFor(r.runId);
    const events = runner.events(r.runId);
    return {
      events,
      result: events.find((e) => e.type === 'result') as {
        output: Lab19Output;
        validation: { passed: boolean };
        effective: Record<string, unknown>;
      },
    };
  }

  it('records effective options and every call received them', async () => {
    const { result } = await run();
    expect(result.validation.passed).toBe(true);
    expect(result.output.modelSaw).toEqual(Array.from({ length: 4 }, () => ({ maxOutputTokens: 1500, reasoningEffort: 'low' })));
    // The result event's effective block carries the same record (minus the capability table).
    expect(result.effective).toMatchObject({
      maxSteps: 4,
      providerOptions: { openai: { reasoningEffort: 'low' } },
      simulated: true,
    });
  });

  it('provider-default effort sends no provider option and says so', async () => {
    const { result } = await run({ reasoningEffort: 'provider-default' });
    expect(result.output.effective.providerOptions).toBeUndefined();
    expect(result.output.effective.providerDefaults).toEqual(['reasoningEffort']);
    expect(result.output.modelSaw[0]).toEqual({ maxOutputTokens: 1500 });
  });

  it('a step limit marks the agent-loop step failed and logs a warning', async () => {
    const { events } = await run({ maxSteps: 2 });
    const steps = events.filter((e) => e.type === 'workflow-step' && e.stepId === 'agent-loop');
    expect(steps.at(-1)).toMatchObject({ status: 'failed', output: { limitsHit: ['maxSteps'] } });
    expect(events.some((e) => e.type === 'log' && e.level === 'warn' && e.message.startsWith('Limit reached: maxSteps'))).toBe(
      true,
    );
  });
});
