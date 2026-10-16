import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ExecutionEventSchema, LabDefinitionSchema, type ExecutionEvent } from '@mlp/contracts';
import { getLab } from '@mlp/lab-catalog';
import { LabRunner } from '@mlp/lab-engine';
import { allLabs, createLabRegistry, createLabServices, labSourceDir } from './index.js';

/** Counts sentences in plain prose (terminal punctuation followed by space or end). */
export function countSentences(text: string): number {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0).length;
}

const registry = createLabRegistry();
const runner = new LabRunner({
  registry,
  services: createLabServices({ serverMode: 'offline' }),
  liveEnabled: false,
  maxConcurrentRuns: 50,
});
afterAll(() => runner.dispose());

describe.each(allLabs.map((l) => [l.implementation.definition.id, l] as const))('%s conformance', (labId, lab) => {
  const def = registry.require(labId).definition;

  it('has a schema-valid definition', () => {
    expect(LabDefinitionSchema.safeParse(lab.implementation.definition).success).toBe(true);
  });

  it('explains the concept in 5–10 sentences', () => {
    const n = countSentences(def.concept);
    expect(n, `concept has ${n} sentences`).toBeGreaterThanOrEqual(5);
    expect(n).toBeLessThanOrEqual(10);
  });

  it('is registered in the catalog with the same title and module, marked available', () => {
    const entry = getLab(labId);
    expect(entry).toBeDefined();
    expect(entry).toMatchObject({ title: def.title, moduleId: def.moduleId, status: 'available' });
    expect(entry?.prerequisites).toEqual(def.prerequisites);
  });

  it('ships every declared source, starter and solution file', () => {
    const dir = labSourceDir(labId);
    const files = [...def.sourceFiles.map((f) => f.path), def.exercise.starterFile, def.exercise.solutionFile].filter(
      (f): f is string => Boolean(f),
    );
    for (const f of files) expect(existsSync(join(dir, f)), `${labId}/${f}`).toBe(true);
  });

  it('declares at least one automated check and one fixture', () => {
    expect(def.checks.length).toBeGreaterThan(0);
    expect(lab.fixtures.length).toBeGreaterThan(0);
  });

  it('example input runs offline and passes its own checks', async () => {
    const run = runner.start(labId, { input: def.exampleInput, mode: 'offline', timeoutMs: def.execution.maxTimeoutMs });
    const snap = await runner.waitFor(run.runId);
    const events = runner.events(run.runId);
    const result = events.find((e) => e.type === 'result');
    expect(snap.status, JSON.stringify(events.filter((e) => e.type === 'error'))).toBe('succeeded');
    expect(result?.type === 'result' && result.validation?.passed).toBe(true);
    // Every declared check id is reported.
    const reported = result?.type === 'result' ? (result.validation?.checks.map((c) => c.id) ?? []) : [];
    expect(reported.sort()).toEqual(def.checks.map((c) => c.id).sort());
  });

  it.each(lab.fixtures.map((f) => [f.name, f] as const))('fixture: %s', async (_name, fixture) => {
    const run = runner.start(labId, { input: fixture.input, mode: fixture.mode ?? 'offline' });
    const snap = await runner.waitFor(run.runId);
    const events: readonly ExecutionEvent[] = runner.events(run.runId);
    for (const e of events) ExecutionEventSchema.parse(e);
    expect(snap.status).toBe(fixture.expect.status);
    expect(events.filter((e) => e.type === 'complete')).toHaveLength(1);
    const result = events.find((e) => e.type === 'result');
    if (fixture.expect.validationPassed !== undefined) {
      expect(result?.type === 'result' && result.validation?.passed).toBe(fixture.expect.validationPassed);
    }
    if (fixture.expect.output !== undefined) {
      expect(result?.type === 'result' ? result.output : undefined).toMatchObject(fixture.expect.output as object);
    }
    if (fixture.expect.errorCode) {
      expect(events.find((e) => e.type === 'error')).toMatchObject({ code: fixture.expect.errorCode });
    }
    if (fixture.expect.eventTypes) {
      expect(events.map((e) => e.type)).toEqual(fixture.expect.eventTypes);
    }
  });
});

describe('lab-00 determinism', () => {
  it('produces identical results for identical input', async () => {
    const outputs: unknown[] = [];
    for (let i = 0; i < 2; i++) {
      const run = runner.start('lab-00', { input: { message: 'same input', delayMs: 0 } });
      await runner.waitFor(run.runId);
      outputs.push(runner.events(run.runId).find((e) => e.type === 'result'));
    }
    const strip = (e: unknown) => {
      const { output, validation } = e as { output: unknown; validation: unknown };
      return { output, validation };
    };
    expect(strip(outputs[0])).toEqual(strip(outputs[1]));
  });

  it('honours cancellation mid-stream', async () => {
    const run = runner.start('lab-00', { input: { message: 'one two three four five six', delayMs: 500 } });
    setTimeout(() => runner.cancel(run.runId), 50);
    expect((await runner.waitFor(run.runId)).status).toBe('cancelled');
  });
});

describe('countSentences', () => {
  it('counts sentences', () => {
    expect(countSentences('One. Two! Three? Four.')).toBe(4);
  });
});
