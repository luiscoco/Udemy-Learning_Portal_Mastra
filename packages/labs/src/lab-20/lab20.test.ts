import { afterAll, describe, expect, it } from 'vitest';
import { LabRegistry, LabRunner } from '@mlp/lab-engine';
import { createLabServices } from '../services.js';
import { normalizeTriage, TriageSchema } from './normalize.js';
import { maskSecrets } from './processors.js';
import { lab20, type Lab20Output } from './run.js';

const runner = new LabRunner({
  registry: new LabRegistry([lab20]),
  services: createLabServices({ serverMode: 'offline', env: {} }),
  liveEnabled: false,
});
afterAll(() => runner.dispose());

async function run(overrides: Record<string, unknown> = {}) {
  const r = runner.start('lab-20', { input: { ...lab20.definition.exampleInput, ...overrides } });
  await runner.waitFor(r.runId);
  const events = runner.events(r.runId);
  return { events, result: events.find((e) => e.type === 'result') as { output: Lab20Output; validation: { passed: boolean } } };
}

describe('lab-20 normalization (unit)', () => {
  it('maps messy model output to the strict schema and lists every change', () => {
    const { value, applied } = normalizeTriage({
      category: ' Tech Support ',
      priority: 'URGENT',
      summary: `  ${'word '.repeat(60)}  `,
      tags: ['Android', 'android', 'Crash Report!', ''],
      needsHuman: 'Yes',
    });
    expect(value).toMatchObject({ category: 'technical', priority: 'high', tags: ['android', 'crash-report'], needsHuman: true });
    expect(value.summary.length).toBeLessThanOrEqual(200);
    expect(TriageSchema.safeParse(value).success).toBe(true);
    expect(applied.map((a) => a.split(':')[0])).toEqual(['category', 'priority', 'summary', 'tags', 'needsHuman']);
    expect(normalizeTriage({ category: 'weather', priority: '?', summary: 'x', tags: [], needsHuman: 'no' }).value).toMatchObject(
      {
        category: 'other',
        priority: 'medium',
      },
    );
  });

  it('masks secrets with the same rules as the filter', () => {
    expect(maskSecrets('a sk-ant-abcdefghijklmnopqrstuvwxyz b')).toBe('a [ANTHROPIC-KEY] b');
    expect(maskSecrets('k=sk-proj-AbCdEf0123456789abcdef0123')).toBe('k=[OPENAI-KEY]');
  });
});

describe('lab-20 pipeline (DoD)', () => {
  it('rejects bad requests with a reason and normalizes good ones into the schema', async () => {
    const { result, events } = await run();
    expect(result.validation.passed).toBe(true);
    const [good, injection, secret, topic, tech] = result.output.outcomes;
    for (const bad of [injection, secret, topic]) {
      expect(bad!.accepted).toBe(false);
      expect(bad!.modelCalls).toBe(0);
    }
    expect(injection).toMatchObject({ rejection: { reason: 'The request tries to override the assistant’s instructions.' } });
    expect(good).toMatchObject({ accepted: true, normalized: { category: 'billing', needsHuman: true } });
    expect(tech).toMatchObject({ accepted: true, normalized: { category: 'technical', priority: 'medium' } });
    expect(result.output.modelCallsTotal).toBe(2);
    // The leaked key never appears in any event (logs, steps or result).
    expect(JSON.stringify(events)).not.toContain('sk-proj-AbCdEf');
  });

  it('turning off PII redaction is caught by the checks', async () => {
    const { result } = await run({ redactPii: false });
    expect(result.validation.passed).toBe(false);
    const good = result.output.outcomes[0]!;
    expect(good.accepted && good.normalized?.summary).toContain('jane.doe@example.com');
  });
});

describe('lab-20 logs', () => {
  it('reports processor rejections as warnings without stack traces or server paths', async () => {
    const { events } = await run();
    const logs = events.filter((e) => e.type === 'log') as { level: string; message: string }[];
    expect(logs.filter((l) => l.level === 'error')).toEqual([]);
    expect(logs.map((l) => l.message)).toContain(
      '[mastra] processor support-policy rejected the request: The request tries to override the assistant’s instructions.',
    );
    expect(JSON.stringify(events)).not.toMatch(/node_modules|\n\s+at\s/);
  });
});
