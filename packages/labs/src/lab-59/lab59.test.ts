import { afterAll, describe, expect, it } from 'vitest';
import { ExperimentComparisonSchema } from '@mlp/contracts';
import { LabRegistry, LabRunner } from '@mlp/lab-engine';
import { createLabServices } from '../services.js';
import { testMemoryDir } from '../test-memory.js';
import { lab59Definition } from './definition.js';
import { metricsOf, parseCsvLine, percentile, providerCostOf, toCsv, type ItemMeasure } from './metrics.js';
import { lab59, type Lab59Output } from './run.js';

const runner = new LabRunner({
  registry: new LabRegistry([lab59]),
  services: createLabServices({ serverMode: 'offline', env: {}, memoryDir: testMemoryDir('lab59') }),
  liveEnabled: false,
});
afterAll(() => runner.dispose());

type Result = { output: Lab59Output; validation: { passed: boolean; checks: { id: string; passed: boolean }[] } };
async function run(input: Record<string, unknown> = {}) {
  const r = runner.start('lab-59', { input: { ...lab59Definition.exampleInput, ...input } });
  await runner.waitFor(r.runId);
  const events = runner.events(r.runId);
  const result = events.find((e) => e.type === 'result') as Result | undefined;
  if (!result) throw new Error(JSON.stringify(events.filter((e) => e.type === 'error' || e.type === 'complete')));
  return result;
}
const item = (passed: boolean, usage: ItemMeasure['usage'], durationMs: number): ItemMeasure => ({
  itemId: String(Math.random()),
  externalId: 'x',
  title: 'x',
  passed,
  rubricScore: passed ? 1 : 0.5,
  usage,
  durationMs,
});

describe('lab-59 metrics (unit)', () => {
  it('computes nearest-rank percentiles', () => {
    expect([percentile([5, 1, 3, 2, 4], 0.5), percentile([5, 1, 3, 2, 4], 0.95), percentile([], 0.5)]).toEqual([3, 5, null]);
  });
  it('never invents a cost: only a cost the provider reported in usage counts', () => {
    expect(providerCostOf({ totalTokens: 10 })).toBeNull();
    expect(providerCostOf({ totalTokens: 10, cost: 0.002 })).toBe(0.002);
    expect(providerCostOf({ raw: { cost: 0.001 } })).toBe(0.001);
    const none = metricsOf([item(true, { totalTokens: 10 }, 5), item(false, { totalTokens: 20, cost: 1 }, 7)], false);
    expect(none.cost).toMatchObject({ value: null, source: null });
    expect(none.tokens).toMatchObject({ total: 30, source: 'provider' });
    const all = metricsOf([item(true, { totalTokens: 10, cost: 0.25 }, 5), item(true, { totalTokens: 1, cost: 0.5 }, 5)], false);
    expect(all.cost).toMatchObject({ value: 0.75, unit: 'USD', source: 'provider' });
  });
  it('quotes CSV fields and parses them back', () => {
    const csv = toCsv([
      {
        id: 'a',
        label: 'Grounded (search, "two" sources)',
        experimentId: 'e',
        modelId: 'm',
        provider: 'p',
        simulated: true,
        tools: [],
        metrics: metricsOf([item(true, { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, 3)], true),
        deltas: null,
      },
    ]);
    const row = parseCsvLine(csv.split('\r\n')[1]!);
    expect(row.slice(0, 2)).toEqual(['a', 'Grounded (search, "two" sources)']);
    expect(row).toHaveLength(13);
  });
});

describe('lab-59 Compare experiments (DoD)', () => {
  it('refuses a comparison of a single configuration (compareExperiments needs two)', () => {
    const r = lab59.inputSchema.safeParse({ ...lab59Definition.exampleInput, includeConcise: false, includeNoTools: false });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe('Select at least one configuration besides the baseline.');
  });

  it('compares configurations on one version, without fabricated costs, reproducibly and exportably', async () => {
    const { output, validation } = await run();
    expect(validation.passed, JSON.stringify(validation.checks)).toBe(true);
    expect(output).toMatchObject(lab59Definition.expectedOutput.example);
    const c = output.comparison;
    expect(ExperimentComparisonSchema.safeParse(c).success).toBe(true);
    expect(c.configs.map((x) => [x.id, x.metrics.passRate, x.deltas?.regressions ?? null])).toEqual([
      ['grounded', 0.75, null],
      ['concise', 0.5, 1],
      ['no-tools', 0.25, 2],
    ]);
    expect(c.configs.every((x) => x.metrics.cost.value === null && x.metrics.tokens.source === 'simulated')).toBe(true);
    expect(c.configs[0]!.modelId).toBe('scripted stand-in for openai/gpt-5-mini');
    expect(JSON.parse(c.export.json).metricDefinitions.cost).toMatch(/Never a price-table estimate/);
  });

  it('flags a comparison that shows a cost the provider did not report', async () => {
    const { output } = await run({ includeNoTools: false });
    const c = output.comparison;
    const tampered = {
      ...output,
      comparison: {
        ...c,
        configs: c.configs.map((x) => ({
          ...x,
          metrics: { ...x.metrics, cost: { value: 0.01, unit: 'USD', source: 'provider' as const, note: 'estimated' } },
        })),
      },
    };
    const v = lab59.validate!(tampered, lab59Definition.exampleInput as never, {
      events: [],
      mode: 'offline',
    }) as Result['validation'];
    expect(v.checks.find((x) => x.id === 'no-fabricated-cost')?.passed).toBe(false);
  });
});
