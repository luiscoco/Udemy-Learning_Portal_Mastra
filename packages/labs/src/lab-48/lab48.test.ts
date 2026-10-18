import { afterAll, describe, expect, it } from 'vitest';
import { LabRegistry, LabRunner } from '@mlp/lab-engine';
import { createLabServices } from '../services.js';
import { classifyOperationError, lab48, localPrompt, type Lab48Output } from './run.js';

const runner = new LabRunner({
  registry: new LabRegistry([lab48]),
  services: createLabServices({ serverMode: 'offline', env: {} }),
  liveEnabled: false,
});
afterAll(() => runner.dispose());

type Result = { output: Lab48Output; validation: { passed: boolean; checks: { id: string; passed: boolean }[] } };
async function run(input: Record<string, unknown> = {}) {
  const r = runner.start('lab-48', { input: { ...lab48.definition.exampleInput, ...input } });
  await runner.waitFor(r.runId);
  const events = runner.events(r.runId);
  const result = events.find((e) => e.type === 'result') as Result | undefined;
  if (!result) throw new Error(JSON.stringify(events.filter((e) => e.type === 'error' || e.type === 'complete')));
  return result;
}
const row = (out: Lab48Output, feature: string) => out.mcpCapabilities.rows.find((r) => r.feature === feature)!;

describe('lab-48 helpers (unit)', () => {
  it('classifies server errors', () => {
    expect(classifyOperationError('MCP error -32602: Resource not found: course://x').code).toBe('unknown-resource');
    expect(classifyOperationError('Prompt "x" not found').code).toBe('unknown-prompt');
    expect(classifyOperationError('Missing required argument: number').code).toBe('missing-argument');
    expect(classifyOperationError('{"code":-32601,"message":"Method not found"}').code).toBe('method-not-found');
  });
  it('renders local prompt templates and rejects unknown names', () => {
    expect(localPrompt('explain-lab', { number: '23' })).toContain('Working memory');
    expect(localPrompt('explain-lab', {})).toEqual({ code: 'missing-argument', message: 'Missing required argument: number' });
    expect(localPrompt('nope', {})).toMatchObject({ code: 'unknown-prompt' });
  });
});

describe('lab-48 MCP resources and prompts (DoD)', () => {
  it('documents the capability probe and reads a resource from the full server', async () => {
    const { output, validation } = await run();
    expect(validation.passed, JSON.stringify(validation.checks)).toBe(true);
    const c = output.mcpCapabilities;
    expect(c.server.protocolVersion).toBe('2026-07-28');
    expect(Object.keys(c.advertised).sort()).toEqual(['logging', 'prompts', 'resources', 'tools']);
    expect(row(output, 'Resources')).toMatchObject({ server: 'advertised', observed: '2 resource(s) listed' });
    expect(row(output, 'Resource subscriptions').observed).toBe('subscribe and unsubscribe course://syllabus succeeded');
    expect(row(output, 'Completions')).toMatchObject({ server: 'not-advertised', mastra: 'not-exposed' });
    expect(row(output, 'Completions').observed).toContain('Method not found');
    expect(c.operation).toMatchObject({ status: 'server', via: 'resources.read' });
    expect(c.operation!.content).toContain('Module 10: ');
  });

  it('tools-only server: missing capabilities are shown, and the fallback is labelled', async () => {
    const { output, validation } = await run({ server: 'tools-only' });
    expect(validation.passed).toBe(true);
    const c = output.mcpCapabilities;
    expect(Object.keys(c.advertised).sort()).toEqual(['logging', 'tools']);
    expect(row(output, 'Resources').observed).toContain('empty list');
    expect(row(output, 'Resource subscriptions').observed).toContain('not attempted');
    expect(c.operation).toMatchObject({ status: 'fallback', via: 'tool course_info' });
    expect(c.operation!.fallbackReason).toContain('does not advertise resources');
  });

  it('template URI: the real rejection is shown before the tool fallback', async () => {
    const { output } = await run({ resourceUri: 'course://labs/47' });
    expect(output.mcpCapabilities.operation).toMatchObject({ status: 'fallback', via: 'tool lab_title' });
    expect(output.mcpCapabilities.operation!.fallbackReason).toContain('Resource not found');
    expect(output.mcpCapabilities.operation!.content).toContain('Discover MCP tools');
  });

  it('prompts from the server, with classified errors', async () => {
    const ok = await run({ operation: 'get-prompt', promptArgs: { number: '23' } });
    expect(ok.output.mcpCapabilities.operation!.content).toBe(
      'user: Explain lab 23 (Working memory) to a beginner: its goal, the key Mastra API and one common mistake.',
    );
    const unknown = await run({ operation: 'get-prompt', promptName: 'nope' });
    expect(unknown.output.mcpCapabilities.operation!.error?.code).toBe('unknown-prompt');
    const local = await run({ server: 'tools-only', operation: 'get-prompt' });
    expect(local.output.mcpCapabilities.operation).toMatchObject({
      status: 'fallback',
      fallbackReason: expect.stringContaining('local fallback, not from the server'),
    });
  });
});
