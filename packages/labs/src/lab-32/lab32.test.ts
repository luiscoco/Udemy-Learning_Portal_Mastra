import { afterAll, describe, expect, it } from 'vitest';
import { LabRegistry, LabRunner } from '@mlp/lab-engine';
import { createLabServices } from '../services.js';
import { testMemoryDir } from '../test-memory.js';
import { classifyResumeError, missingDocuments } from './onboarding.js';
import { lab32, type Lab32Output } from './run.js';

const runner = new LabRunner({
  registry: new LabRegistry([lab32]),
  services: createLabServices({ serverMode: 'offline', env: {}, memoryDir: testMemoryDir('lab32') }),
  liveEnabled: false,
});
afterAll(() => runner.dispose());

const example = lab32.definition.exampleInput as Record<string, unknown>;

async function run(overrides: Record<string, unknown> = {}) {
  const r = runner.start('lab-32', { input: { ...example, ...overrides } });
  await runner.waitFor(r.runId);
  const events = runner.events(r.runId);
  const result = events.find((e) => e.type === 'result') as
    | { output: Lab32Output; validation: { passed: boolean; checks: { id: string; passed: boolean; message?: string }[] } }
    | undefined;
  if (!result) throw new Error(JSON.stringify(events.filter((e) => e.type === 'complete' || e.type === 'log').slice(-2)));
  return result;
}
const check = (v: { checks: { id: string; passed: boolean }[] }, id: string) => v.checks.find((c) => c.id === id)?.passed;
const phase = (o: Lab32Output, name: string) => o.phases.find((p) => p.name === name)!;

describe('lab-32 helpers (unit)', () => {
  it('missing documents and error classification', () => {
    expect(missingDocuments('business', [{ type: 'id-document', fileName: 'a' }])).toEqual(['proof-of-address', 'company-registration']);
    expect(classifyResumeError('This suspended workflow run was already resumed by another caller.')).toBe('ALREADY_RESUMED');
    expect(classifyResumeError('Invalid resume data: \n- documents')).toBe('INVALID_RESUME_DATA');
    expect(classifyResumeError('This workflow step "activate" was not suspended. Available suspended steps: [x]')).toBe('WRONG_STEP');
    expect(classifyResumeError('This workflow run was not suspended')).toBe('NOT_SUSPENDED');
  });
  it('resume and inspect require a run id', () => {
    expect(lab32.inputSchema.safeParse({ ...example, action: 'resume', workflowRunId: '' }).success).toBe(false);
  });
});

describe('lab-32 suspend and resume (DoD)', () => {
  it('demo: suspends, survives the restart, resumes from the checkpoint, side effects once', async () => {
    const { output, validation } = await run();
    expect(validation.passed).toBe(true);
    expect(phase(output, 'start')).toMatchObject({ status: 'suspended', steps: ['createAccount', 'chargeFee', 'draftRequest', 'awaitDocuments'] });
    expect(phase(output, 'inspect').status).toBe('suspended');
    expect(phase(output, 'resume')).toMatchObject({ status: 'success', steps: ['awaitDocuments', 'activate'], activation: { status: 'active' } });
    expect(phase(output, 'duplicate-resume').error?.code).toBe('NOT_SUSPENDED');
    expect(output.sideEffectCounts).toEqual({ 'account-created': 1, 'fee-charged': 1, 'request-drafted': 1, 'account-activated': 1 });
  });

  it('rerun anti-pattern duplicates every side effect before the checkpoint', async () => {
    const { output, validation } = await run({ checkpointStyle: 'rerun' });
    expect(output.sideEffectCounts).toMatchObject({ 'account-created': 2, 'fee-charged': 2, 'request-drafted': 2, 'account-activated': 1 });
    expect(check(validation, 'resumed-from-checkpoint')).toBe(false);
    expect(check(validation, 'no-duplicate-side-effects')).toBe(false);
  });

  it('start, then resume by id in separate lab runs; partial documents suspend again', async () => {
    const started = await run({ action: 'start' });
    expect(started.validation.passed).toBe(true);
    const id = started.output.workflowRunId;
    const partial = await run({ action: 'resume', workflowRunId: id, documents: [{ type: 'id-document', fileName: 'passport.pdf' }] });
    expect(phase(partial.output, 'resume')).toMatchObject({ status: 'suspended', suspendPayload: { required: ['proof-of-address'] } });
    const rest = await run({ action: 'resume', workflowRunId: id, documents: [{ type: 'proof-of-address', fileName: 'bill.pdf' }] });
    expect(phase(rest.output, 'resume')).toMatchObject({ status: 'success', activation: { documents: ['id-document', 'proof-of-address'] } });
    expect(rest.validation.passed).toBe(true);
    expect(rest.output.sideEffectCounts).toEqual({ 'account-created': 1, 'fee-charged': 1, 'request-drafted': 1, 'account-activated': 1 });
    const inspected = await run({ action: 'inspect', workflowRunId: id });
    expect(phase(inspected.output, 'inspect').status).toBe('success');
  });

  it('unknown run id is reported, not thrown', async () => {
    const { output } = await run({ action: 'resume', workflowRunId: '00000000-0000-4000-8000-000000000000' });
    expect(phase(output, 'resume').error?.code).toBe('UNKNOWN_RUN');
  });
});
