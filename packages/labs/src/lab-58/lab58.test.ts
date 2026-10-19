import { afterAll, describe, expect, it } from 'vitest';
import { EvalReportSchema } from '@mlp/contracts';
import { LabRegistry, LabRunner } from '@mlp/lab-engine';
import { createLabServices } from '../services.js';
import { testMemoryDir } from '../test-memory.js';
import { lab58Definition } from './definition.js';
import { lab58, type Lab58Output } from './run.js';
import { answerText, evaluateAssertions, providersOf } from './scorers.js';

// One store for the whole file: the dataset is created by the first run and reused by the others.
const runner = new LabRunner({
  registry: new LabRegistry([lab58]),
  services: createLabServices({ serverMode: 'offline', env: {}, memoryDir: testMemoryDir('lab58') }),
  liveEnabled: false,
});
afterAll(() => runner.dispose());

type Result = { output: Lab58Output; validation: { passed: boolean; checks: { id: string; passed: boolean }[] } };
async function run(input: Record<string, unknown> = {}) {
  const r = runner.start('lab-58', { input: { ...lab58Definition.exampleInput, ...input } });
  await runner.waitFor(r.runId);
  const events = runner.events(r.runId);
  const result = events.find((e) => e.type === 'result') as Result | undefined;
  if (!result) throw new Error(JSON.stringify(events.filter((e) => e.type === 'error' || e.type === 'complete')));
  return result;
}

describe('lab-58 scorers (unit)', () => {
  const messages = [
    { role: 'user', content: { content: 'q' } },
    { role: 'assistant', content: { content: 'A step can call suspend.', metadata: { provider: 'offline-sim' } } },
  ];
  it('reads answers and providers from agent messages, task outputs and strings', () => {
    expect(answerText(messages)).toBe('A step can call suspend.');
    expect(answerText({ text: 'from a summary' })).toBe('from a summary');
    expect(answerText('plain')).toBe('plain');
    expect(providersOf(messages)).toEqual(['offline-sim']);
    expect(providersOf({ text: 'x' })).toEqual([]);
  });
  it('evaluates and explains every expected assertion', async () => {
    const r = await evaluateAssertions('A step can call suspend to pause the run.', {
      rubricId: 'suspend-resume',
      minScore: 0.7,
      mustMention: ['suspend', 'resume'],
      mustNotMention: ['polling loop'],
    });
    expect(r.map((x) => [x.label, x.passed, x.detail])).toEqual([
      ['Rubric suspend-resume score ≥ 0.7', false, '0.55 < 0.7'],
      ['Mentions “suspend”', true, 'found'],
      ['Mentions “resume”', false, 'not found'],
      ['Does not mention “polling loop”', true, 'absent'],
    ]);
  });
});

describe('lab-58 Evaluation dataset (DoD)', () => {
  it('stores the versioned dataset and runs it on the mock provider', async () => {
    const { output, validation } = await run();
    expect(validation.passed, JSON.stringify(validation.checks)).toBe(true);
    expect(output).toMatchObject(lab58Definition.expectedOutput.example);
    expect(EvalReportSchema.safeParse(output.evalReport).success).toBe(true);
    expect(output.seed.applied.map((a) => `${a.revision}:${a.op}:${a.externalId}→v${a.version}`)).toEqual([
      '1:add:workflow-steps→v1',
      '1:add:suspend-resume→v2',
      '1:add:tool-validation→v3',
      '2:add:out-of-scope→v4',
      '2:update:tool-validation→v5',
    ]);
    const failed = output.evalReport.items.filter((i) => !i.passed);
    expect(failed.map((i) => [i.externalId, i.assertions.filter((a) => !a.passed).map((a) => a.label)])).toEqual([
      ['suspend-resume', ['Mentions “resume”']],
    ]);
  });

  it('reseeding is a no-op and an old revision still runs with its original assertions', async () => {
    const { output, validation } = await run({ revision: '1' });
    expect(validation.passed, JSON.stringify(validation.checks)).toBe(true);
    expect(output.seed).toMatchObject({ created: false, applied: [], reseedApplied: 0 });
    expect(output.requestedVersion).toBe(3);
    expect(output.evalReport.items.map((i) => i.externalId)).toEqual(['suspend-resume', 'tool-validation', 'workflow-steps']);
    const tv = output.evalReport.items.find((i) => i.externalId === 'tool-validation')!;
    expect(tv.assertions.map((a) => a.label)).toEqual(['Rubric tool-validation score ≥ 0.5', 'Mentions “schema”']);
  });

  it('flags a report whose answers did not come from the mock provider offline', async () => {
    const { output } = await run();
    const tampered = {
      ...output,
      evalReport: { ...output.evalReport, experiment: { ...output.evalReport.experiment, provider: 'openai' } },
    };
    const v = lab58.validate!(tampered, lab58Definition.exampleInput as never, {
      events: [],
      mode: 'offline',
    }) as Result['validation'];
    expect(v.checks.find((c) => c.id === 'runs-on-mock-provider')?.passed).toBe(false);
  });
});
