import { afterAll, describe, expect, it } from 'vitest';
import { mcpParameters } from '@mlp/contracts';
import { LabRegistry, LabRunner } from '@mlp/lab-engine';
import { createLabServices } from '../services.js';
import { decide, fieldErrorsOf, resolveName, suggest } from './policy.js';
import { lab47, type Lab47Output } from './run.js';

const runner = new LabRunner({
  registry: new LabRegistry([lab47]),
  services: createLabServices({ serverMode: 'offline', env: {} }),
  liveEnabled: false,
});
afterAll(() => runner.dispose());

type Result = { output: Lab47Output; validation: { passed: boolean; checks: { id: string; passed: boolean }[] } };
async function run(input: Record<string, unknown> = {}) {
  const r = runner.start('lab-47', { input: { ...lab47.definition.exampleInput, ...input } });
  await runner.waitFor(r.runId);
  const events = runner.events(r.runId);
  const result = events.find((e) => e.type === 'result') as Result | undefined;
  if (!result) throw new Error(JSON.stringify(events.filter((e) => e.type === 'error' || e.type === 'complete')));
  return { ...result, events };
}

describe('lab-47 policy (unit)', () => {
  const catalog = [
    { name: 'search_labs', annotations: { readOnlyHint: true } },
    { name: 'reset_progress', annotations: { readOnlyHint: false, destructiveHint: true } },
    { name: 'no_hints', annotations: null },
  ];
  it('checks discovered, then allowlisted, then read-only', () => {
    expect(decide('nope', catalog, ['nope']).reason).toBe('unknown-tool');
    expect(decide('search_labs', catalog, []).reason).toBe('not-allowlisted');
    expect(decide('reset_progress', catalog, ['reset_progress'])).toMatchObject({
      reason: 'not-read-only',
      message: expect.stringContaining('destructive'),
    });
    expect(decide('no_hints', catalog, ['no_hints']).reason).toBe('not-read-only');
    expect(decide('search_labs', catalog, ['search_labs'])).toMatchObject({ allowed: true, reason: null });
  });
  it('resolves namespaced keys and suggests close names', () => {
    const names = ['course_info', 'lab_title', 'search_labs'];
    expect(resolveName('course_search_labs', 'course', names)).toBe('search_labs');
    expect(resolveName('course_info', 'course', names)).toBe('course_info');
    expect(suggest('serch_labs', names)).toEqual(['search_labs']);
    expect(suggest('delete_everything', names)).toEqual([]);
  });
  it('flattens validation errors and derives parameter rows', () => {
    expect(
      fieldErrorsOf({ errors: ['must have required property'], fields: { q: { errors: ['too short'], fields: {} } } }),
    ).toEqual([
      { field: '(arguments)', message: 'must have required property' },
      { field: 'q', message: 'too short' },
    ]);
    expect(
      mcpParameters({
        type: 'object',
        properties: { q: { type: 'string', minLength: 2, description: 'd' }, n: { enum: ['a', 'b'] } },
        required: ['q'],
      }),
    ).toEqual([
      { name: 'q', type: 'string', required: true, constraints: ['minLength 2'], description: 'd' },
      { name: 'n', type: 'enum: "a" | "b"', required: false, constraints: [], description: '' },
    ]);
  });
});

describe('lab-47 Discover MCP tools (DoD)', () => {
  it('shows the discovered schemas and the result of a permitted read-only call', async () => {
    const { output, validation, events } = await run();
    expect(validation.passed, JSON.stringify(validation.checks)).toBe(true);
    const cat = output.mcpCatalog;
    expect(cat.tools.map((t) => t.name)).toEqual(['course_info', 'lab_title', 'reset_progress', 'search_labs']);
    const search = cat.tools.find((t) => t.name === 'search_labs')!;
    expect(mcpParameters(search.inputSchema).map((p) => [p.name, p.required])).toEqual([
      ['query', true],
      ['limit', false],
    ]);
    expect(cat.tools.find((t) => t.name === 'reset_progress')!.permission.allowed).toBe(false);
    expect(cat.call).toMatchObject({ status: 'success', result: { matches: [{ number: 46 }, { number: 47 }, { number: 48 }] } });
    expect(output.serverCalls).toEqual({ search_labs: 1 });
    expect(events.filter((e) => e.type === 'tool-finish').map((e) => e.type === 'tool-finish' && e.status)).toEqual(['success']);
  });

  it('rejects an unknown tool before anything reaches the server', async () => {
    const { output, validation, events } = await run({ toolName: 'serch_labs', args: {} });
    expect(validation.passed).toBe(true);
    expect(output.mcpCatalog.call).toMatchObject({ status: 'rejected', reason: 'unknown-tool', suggestions: ['search_labs'] });
    expect(output.serverCalls).toEqual({});
    expect(events.find((e) => e.type === 'tool-finish')).toMatchObject({ status: 'denied' });
  });

  it('rejects invalid arguments with field errors and no server call', async () => {
    const { output } = await run({ args: { limit: 2 } });
    expect(output.mcpCatalog.call).toMatchObject({ reason: 'invalid-arguments' });
    expect(output.mcpCatalog.call!.fieldErrors.length).toBeGreaterThan(0);
    expect(output.serverCalls).toEqual({});
  });

  it('rejects malformed tool names at the input boundary', () => {
    expect(lab47.inputSchema.safeParse({ ...lab47.definition.exampleInput, toolName: 'rm -rf /' }).success).toBe(false);
  });
});
