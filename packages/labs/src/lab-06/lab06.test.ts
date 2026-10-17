import { afterAll, describe, expect, it } from 'vitest';
import { LabRegistry, LabRunner } from '@mlp/lab-engine';
import { createLabServices } from '../services.js';
import { lab06 } from './run.js';

const example = lab06.definition.exampleInput;
const runner = new LabRunner({
  registry: new LabRegistry([lab06]),
  services: createLabServices({ serverMode: 'offline', env: {} }),
  liveEnabled: false,
});
afterAll(() => runner.dispose());

async function result(input: Record<string, unknown>) {
  const r = runner.start('lab-06', { input }, { requestId: 'req-lab06', correlationId: 'corr-lab06' });
  await runner.waitFor(r.runId);
  return runner.events(r.runId);
}

describe('lab-06 basic text generation', () => {
  it('displays the agent response with stable mock output and metadata', async () => {
    const a = (await result(example)).find((e) => e.type === 'result');
    const b = (await result(example)).find((e) => e.type === 'result');
    expect(a).toMatchObject({
      validation: { passed: true },
      output: {
        usedFallback: false,
        metadata: { requestId: 'req-lab06', correlationId: 'corr-lab06', finishReason: 'stop', simulated: true },
      },
    });
    expect((a as { output: { text: string } }).output.text).toBe((b as { output: { text: string } }).output.text);
  });

  it.each(['', '   ', '\n\t'])('rejects empty prompt %j before calling the model', (prompt) => {
    expect(() => runner.start('lab-06', { input: { ...example, prompt } })).toThrowError(
      expect.objectContaining({ code: 'VALIDATION_FAILED', details: [expect.objectContaining({ path: 'input.prompt' })] }),
    );
  });

  it('never exposes the raw provider error in output or events', async () => {
    const events = await result({ ...example, failureMode: 'provider-error' });
    const text = JSON.stringify(events);
    expect(text).not.toContain('Simulated upstream 503 Service Unavailable');
    expect(text).toContain('The model call failed (HTTP 503)');
  });

  it('cancellation is reported as cancelled, not as a fallback', async () => {
    const r = runner.start('lab-06', { input: example });
    runner.cancel(r.runId);
    expect((await runner.waitFor(r.runId)).status).toBe('cancelled');
  });
});
