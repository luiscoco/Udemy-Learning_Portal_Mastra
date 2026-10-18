import { afterAll, describe, expect, it } from 'vitest';
import { LabRegistry, LabRunner } from '@mlp/lab-engine';
import { createLabServices } from '../services.js';
import { exposeTools, namespacedKeyCollisions } from './policy.js';
import { lab50, tasksFor, type Lab50Output } from './run.js';

const runner = new LabRunner({
  registry: new LabRegistry([lab50]),
  services: createLabServices({ serverMode: 'offline', env: {} }),
  liveEnabled: false,
});
afterAll(() => runner.dispose());

type Result = { output: Lab50Output; validation: { passed: boolean; checks: { id: string; passed: boolean }[] } };
async function run(input: Record<string, unknown> = {}) {
  const r = runner.start('lab-50', { input: { ...lab50.definition.exampleInput, ...input } });
  await runner.waitFor(r.runId);
  const events = runner.events(r.runId);
  const result = events.find((e) => e.type === 'result') as Result | undefined;
  if (!result) throw new Error(JSON.stringify(events.filter((e) => e.type === 'error' || e.type === 'complete')));
  return result;
}

describe('lab-50 collision policies (unit)', () => {
  const toolsets = { calc: { add: 'calc.add', info: 'calc.info' }, data: { lab_title: 'data.lab_title', info: 'data.info' } };
  it('namespace keeps both tools under server_tool keys', () => {
    const r = exposeTools(toolsets, ['calc', 'data'], 'namespace');
    expect(Object.keys(r.tools)).toEqual(['calc_add', 'calc_info', 'data_lab_title', 'data_info']);
    expect(r.routing.data_info).toEqual({ server: 'data', tool: 'info' });
    expect(r.collisions).toEqual([
      { name: 'info', servers: ['calc', 'data'], resolution: 'namespaced as calc_info and data_info' },
    ]);
  });
  it('first-wins shadows later servers; reject drops the shared name', () => {
    const fw = exposeTools(toolsets, ['calc', 'data'], 'first-wins');
    expect(fw.tools).toEqual({ add: 'calc.add', info: 'calc.info', lab_title: 'data.lab_title' });
    expect(fw.collisions[0]!.resolution).toBe('calc.info kept; data.info shadowed');
    const rj = exposeTools(toolsets, ['calc', 'data'], 'reject');
    expect(Object.keys(rj.tools)).toEqual(['add', 'lab_title']);
  });
  it('detects keys that clash after namespacing', () => {
    expect(namespacedKeyCollisions({ a_b: { c: 1 }, a: { b_c: 2 } })).toEqual([
      { name: 'a_b_c', servers: ['a_b.c', 'a.b_c'], resolution: 'ambiguous namespaced key: rename a server or a tool' },
    ]);
  });
  it('maps question parts to tools', () => {
    expect(tasksFor('What is 18% of 240, and what is the title of lab 47?').map((t) => t.base)).toEqual([
      'percent_of',
      'lab_title',
    ]);
    expect(tasksFor('What is 3 plus 4 and 5 times 6?').map((t) => t.base)).toEqual(['add', 'multiply']);
  });
});

describe('lab-50 Multi-server MCP agent (DoD)', () => {
  it('calls route to the correct server', async () => {
    const { output, validation } = await run();
    expect(validation.passed, JSON.stringify(validation.checks)).toBe(true);
    expect(output.toolCalls.map((t) => [t.toolName, t.server, t.status])).toEqual([
      ['calc_percent_of', 'calc', 'success'],
      ['data_lab_title', 'data', 'success'],
    ]);
    expect(output.serverExecutions).toEqual({ calc: { percent_of: 1 }, data: { lab_title: 1 } });
    expect(output.answer).toBe('18% of 240 is 43.2. Lab 47 is “Discover MCP tools”.');
  });

  it('one offline server does not crash the lab', async () => {
    const { output, validation } = await run({ downServer: 'calc' });
    expect(validation.passed, JSON.stringify(validation.checks)).toBe(true);
    expect(output.servers[0]).toMatchObject({ key: 'calc', status: 'failed', error: { category: 'unreachable' } });
    expect(output.exposed.every((e) => e.server === 'data')).toBe(true);
    expect(output.answer).toBe(
      'Lab 47 is “Discover MCP tools”. 18% of 240 is unavailable: no percent_of tool is offered (its server may be offline, or the name was excluded).',
    );
  });

  it('flags an answer that drops a tool result', () => {
    const out = {
      policy: 'namespace',
      servers: [
        { key: 'calc', name: 'c', status: 'connected', tools: ['percent_of'], error: null },
        { key: 'data', name: 'd', status: 'connected', tools: ['lab_title'], error: null },
      ],
      collisions: [],
      keyCollisions: [],
      exposed: [{ name: 'calc_percent_of', server: 'calc', tool: 'percent_of' }],
      toolCalls: [
        {
          toolCallId: '1',
          toolName: 'calc_percent_of',
          args: {},
          status: 'success',
          result: { result: 43.2 },
          durationMs: 1,
          server: 'calc',
          tool: 'percent_of',
        },
      ],
      serverExecutions: { calc: { percent_of: 1 }, data: {} },
      answer: 'It is about 40.',
      teardown: { clientDisconnected: true, serversClosed: true, openSockets: 0 },
    } as unknown as Lab50Output;
    const v = lab50.validate!(out, lab50.definition.exampleInput as never, {
      events: [],
      mode: 'offline',
    }) as Result['validation'];
    expect(v.checks.find((c) => c.id === 'answer-grounded')?.passed).toBe(false);
  });
});
