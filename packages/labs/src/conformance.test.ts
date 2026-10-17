import { existsSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { ExecutionEventSchema, LabDefinitionSchema, type ExecutionEvent, type InputField } from '@mlp/contracts';
import { getLab } from '@mlp/lab-catalog';
import { LabRunner } from '@mlp/lab-engine';
import { allLabs, createLabRegistry, createLabServices, resolveLabSourcePath } from './index.js';
import { testMemoryDir } from './test-memory.js';

/** Counts sentences in plain prose (terminal punctuation followed by space or end). */
export function countSentences(text: string): number {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0).length;
}

/**
 * Mirrors apps/web form-model buildInput: hidden fields (visibleWhen not met) are never submitted,
 * and empty text values are omitted.
 */
function asFormSubmits(fields: InputField[], values: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    if (f.visibleWhen && !f.visibleWhen.in.includes(String(values[f.visibleWhen.field]))) continue;
    const v = values[f.name];
    if (v === undefined || ((f.kind === 'text' || f.kind === 'textarea') && String(v).trim() === '')) continue;
    out[f.name] = v;
  }
  return out;
}

const registry = createLabRegistry();
const runner = new LabRunner({
  registry,
  // Test databases never touch the learner's .data/memory.
  services: createLabServices({ serverMode: 'offline', memoryDir: testMemoryDir('conformance') }),
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
    const files = [...def.sourceFiles.map((f) => f.path), def.exercise.starterFile, def.exercise.solutionFile].filter(
      (f): f is string => Boolean(f),
    );
    for (const f of files) expect(existsSync(resolveLabSourcePath(labId, f)), `${labId}/${f}`).toBe(true);
  });

  it('declares at least one automated check and one fixture', () => {
    expect(def.checks.length).toBeGreaterThan(0);
    expect(lab.fixtures.length).toBeGreaterThan(0);
  });

  it('accepts the example and fixture inputs exactly as the web form submits them', () => {
    for (const [name, input] of [['example', def.exampleInput], ...lab.fixtures.map((f) => [f.name, f.input] as const)] as const) {
      const submitted = asFormSubmits(def.inputs, input as Record<string, unknown>);
      const parsed = lab.implementation.inputSchema.safeParse(submitted);
      expect(parsed.success, `${name}: ${parsed.success ? '' : parsed.error.message}`).toBe(true);
    }
  });

  it(
    'example input runs offline and passes its own checks',
    async () => {
      const run = runner.start(labId, { input: def.exampleInput, mode: 'offline', timeoutMs: def.execution.maxTimeoutMs });
      const snap = await runner.waitFor(run.runId);
      const events = runner.events(run.runId);
      const result = events.find((e) => e.type === 'result');
      expect(snap.status, JSON.stringify(events.filter((e) => e.type === 'error'))).toBe('succeeded');
      expectNoServerInternals(events);
      expect(result?.type === 'result' && result.validation?.passed).toBe(true);
      // Every declared check id is reported.
      const reported = result?.type === 'result' ? (result.validation?.checks.map((c) => c.id) ?? []) : [];
      expect(reported.sort()).toEqual(def.checks.map((c) => c.id).sort());
      // The documented expected output must match what the example input really produces (offline).
      if (def.expectedOutput.example && typeof def.expectedOutput.example === 'object') {
        expect(result?.type === 'result' ? result.output : undefined).toMatchObject(def.expectedOutput.example as object);
      }
    },
    def.execution.maxTimeoutMs + 5_000,
  );

  it.each(lab.fixtures.map((f) => [f.name, f] as const))(
    'fixture: %s',
    async (_name, fixture) => {
      const run = runner.start(labId, { input: fixture.input, mode: fixture.mode ?? 'offline' });
      const snap = await runner.waitFor(run.runId);
      const events: readonly ExecutionEvent[] = runner.events(run.runId);
      for (const e of events) ExecutionEventSchema.parse(e);
      expectNoServerInternals(events);
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
    },
    def.execution.maxTimeoutMs + 5_000,
  );
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

/** Events reach the browser: they must never carry stack traces or server file paths. */
function expectNoServerInternals(events: readonly ExecutionEvent[]) {
  const text = JSON.stringify(events);
  expect(text, 'stack frame in events').not.toMatch(/\n\s+at\s/);
  // Paths, not words: "node_modules/…" (or JSON-escaped "node_modules\\…"), file URLs, Windows drive paths.
  expect(text, 'server path in events').not.toMatch(/node_modules(?:\/|\\\\)|file:\/\/\/|[A-Za-z]:(?:\/|\\\\)(?:Users|00\.)/);
}
