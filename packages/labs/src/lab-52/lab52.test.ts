import { afterAll, describe, expect, it } from 'vitest';
import { AgentConversationSchema } from '@mlp/contracts';
import { LabRegistry, LabRunner } from '@mlp/lab-engine';
import { createLabServices } from '../services.js';
import { lab52Definition } from './definition.js';
import { ACCOUNT, TECHNICAL } from './fixtures.js';
import { decideHandoff, expectedTarget, extractCase, packetFor, redact, secretsIn } from './routing.js';
import { lab52, type Lab52Output } from './run.js';

const runner = new LabRunner({
  registry: new LabRegistry([lab52]),
  services: createLabServices({ serverMode: 'offline', env: {} }),
  liveEnabled: false,
});
afterAll(() => runner.dispose());

type Result = { output: Lab52Output; validation: { passed: boolean; checks: { id: string; passed: boolean }[] } };
async function run(input: Record<string, unknown> = {}) {
  const r = runner.start('lab-52', { input: { ...lab52Definition.exampleInput, ...input } });
  await runner.waitFor(r.runId);
  const events = runner.events(r.runId);
  const result = events.find((e) => e.type === 'result') as Result | undefined;
  if (!result) throw new Error(JSON.stringify(events.filter((e) => e.type === 'error' || e.type === 'complete')));
  return result;
}
const example = lab52Definition.exampleInput.message;

describe('lab-52 routing (unit)', () => {
  it('extracts the case and the target deterministically', () => {
    expect(extractCase(example)).toMatchObject({ customerId: 'C-1042', orderId: 'ORD-7781', product: null, accountIssue: null });
    expect([example, TECHNICAL, ACCOUNT].map(expectedTarget)).toEqual(['billing', 'technical', 'account']);
    expect(extractCase(TECHNICAL)).toMatchObject({ product: 'Reports', errorCode: 'E503' });
    expect(extractCase(ACCOUNT)).toMatchObject({ accountIssue: 'locked' });
  });
  it('redacts card numbers and passwords', () => {
    expect(redact('card 4111-1111-1111-1111, password is hunter2.')).toBe('card [card], password is [redacted]');
    expect(secretsIn(ACCOUNT)).toEqual(['hunter2']);
  });
  it('projects a packet onto the target fields only', () => {
    const c = extractCase(example);
    expect(Object.keys(packetFor('billing', c))).toEqual(['customerId', 'orderId', 'summary']);
    expect(packetFor('technical', c)).toEqual({ customerId: 'C-1042', product: null, errorCode: null, summary: c.summary });
  });
  it('guards the graph, the hop limit, cycles and required fields in that order', () => {
    const c = extractCase(example);
    const base = { from: 'technical' as const, to: 'billing', visited: ['billing' as const], hops: 1, maxHops: 3, case: c };
    expect(decideHandoff({ ...base, to: 'triage' })).toMatchObject({ accepted: false, reason: 'not-allowed' });
    expect(decideHandoff({ ...base, hops: 3 })).toMatchObject({ accepted: false, reason: 'hop-limit' });
    expect(decideHandoff(base)).toMatchObject({ accepted: false, reason: 'cycle' });
    expect(decideHandoff({ ...base, visited: [], case: { ...c, customerId: null } })).toMatchObject({
      reason: 'missing-context',
    });
    expect(decideHandoff({ ...base, visited: [] })).toMatchObject({ accepted: true, hop: 2 });
  });
});

describe('lab-52 Agent handoffs (DoD)', () => {
  it('selects the correct target with the minimum context', async () => {
    const { output, validation } = await run();
    expect(validation.passed, JSON.stringify(validation.checks)).toBe(true);
    expect(output.packets.map((p) => ({ to: p.to, packet: p.packet }))).toEqual(lab52Definition.expectedOutput.example.packets);
    expect(output.outcome).toEqual(lab52Definition.expectedOutput.example.outcome);
    expect(output.packets[0]!.prompt).not.toContain('4111');
    expect(AgentConversationSchema.safeParse(output.agentConversation).success).toBe(true);
    expect(output.agentConversation.messages.map((m) => `${m.from}>${m.to}:${m.kind}`)).toEqual([
      'customer>triage:task',
      'triage>orchestrator:handoff',
      'orchestrator>billing:handoff',
      'billing>customer:final',
    ]);
  });

  it('a misroute is recovered and the order id survives the extra hop', async () => {
    const { output, validation } = await run({ routingFault: 'misroute' });
    expect(validation.passed, JSON.stringify(validation.checks)).toBe(true);
    expect(output.decisions.map((d) => [d.from, d.to, d.accepted, d.injected])).toEqual([
      ['triage', 'technical', true, true],
      ['technical', 'billing', true, false],
    ]);
    expect(output.packets[1]!.packet.orderId).toBe('ORD-7781');
    expect(output.agentConversation.messages.find((m) => m.injected)?.to).toBe('technical');
  });

  it('no unlimited recursive routing: ping-pong stops at the cycle', async () => {
    const { output, validation } = await run({ routingFault: 'ping-pong' });
    expect(validation.passed, JSON.stringify(validation.checks)).toBe(true);
    expect(output.decisions.at(-1)).toMatchObject({ from: 'technical', to: 'billing', accepted: false, reason: 'cycle' });
    expect(output.agentConversation.messages.at(-1)).toMatchObject({ to: 'human', kind: 'escalation' });
  });

  it('flags a packet that leaks a secret or extra fields', async () => {
    const { output } = await run({ message: ACCOUNT });
    const p = output.packets[0]!;
    const leaky = { ...output, packets: [{ ...p, packet: { ...p.packet, orderId: null }, prompt: `${p.prompt} hunter2` }] };
    const v = lab52.validate!(leaky, { ...lab52Definition.exampleInput, message: ACCOUNT } as never, {
      events: [],
      mode: 'offline',
    }) as Result['validation'];
    expect(v.checks.find((c) => c.id === 'minimal-context')?.passed).toBe(false);
  });
});

describe('lab-52 transfer retry', () => {
  it('an invalid transfer queues nothing, so triage can retry within maxSteps', async () => {
    const { Agent } = await import('@mastra/core/agent');
    const { ScriptedLanguageModel } = await import('@mlp/mastra-runtime');
    const { HandoffDesk, stopWhenQueued, triageTools } = await import('./agents.js');
    const { streamAgent } = await import('../shared/tool-stream.js');
    const desk = new HandoffDesk();
    const good = { ...extractCase(example), reason: 'Duplicate charge.' };
    const model = new ScriptedLanguageModel({
      script: (v) =>
        v.callIndex === 0
          ? { text: '', toolCalls: [{ toolName: 'transfer_to_billing', input: { ...good, customerId: 'customer 1042' } }] }
          : { text: '', toolCalls: [{ toolName: 'transfer_to_billing', input: good }] },
    });
    const triage = new Agent({ id: 't', name: 't', instructions: 'x', model, tools: triageTools(desk) });
    const ctx = { emit: () => {}, log: () => {}, throwIfAborted: () => {}, signal: new AbortController().signal } as never;
    const res = await streamAgent(ctx, triage, example, {
      maxSteps: 3,
      stopWhen: stopWhenQueued(desk, 'triage'),
      emitTokens: false,
    });
    expect(res.tools.map((t) => t.status)).toEqual(['invalid', 'success']);
    expect(desk.requests).toHaveLength(1);
    expect(res.steps).toBe(2);
  });
});
