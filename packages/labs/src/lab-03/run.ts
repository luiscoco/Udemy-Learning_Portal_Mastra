import { z } from 'zod';
import { Agent } from '@mastra/core/agent';
import { Mastra } from '@mastra/core/mastra';
import { summarizeChecks, type LabDefinition } from '@mlp/contracts';
import { LabError, type LabImplementation } from '@mlp/lab-engine';
import type { PromptView, ScriptedTurn } from '@mlp/mastra-runtime';
import type { LabServices } from '../services.js';
import { lab03Definition } from './definition.js';

export const Lab03InputSchema = z.object({
  agentKey: z
    .string()
    .trim()
    .regex(/^[a-z][A-Za-z0-9]{1,39}$/, 'Use camelCase: a lowercase letter followed by letters or digits'),
  agentId: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9-]{1,39}$/, 'Use kebab-case: lowercase letters, digits and dashes'),
  agentName: z.string().trim().min(2).max(40),
  instructions: z.string().trim().min(10, 'Write at least one full sentence of instructions').max(2000),
  modelId: z.string().trim().min(3).max(80),
  prompt: z.string().trim().min(1, 'Ask the agent something').max(500),
});
export type Lab03Input = z.infer<typeof Lab03InputSchema>;

export interface Lab03Output {
  registeredKeys: string[];
  lookup: {
    byKey: { id: string; name: string } | null;
    byId: { id: string; name: string } | null;
    sameInstance: boolean;
  };
  model: { id: string; simulated: boolean };
  text: string;
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
  /** Offline only: the system prompt the model actually received from Mastra. */
  systemPromptSeen?: string;
}

/** Deterministic offline reply that proves which instructions and prompt reached the model. */
export function lab03OfflineReply(agentName: string) {
  return (v: PromptView): ScriptedTurn => {
    const firstRule = v.system.split(/(?<=[.!?])\s/)[0]?.trim() ?? '';
    return {
      text: `Hi, I'm ${agentName}. You asked: "${v.lastUser}". Following my instructions ("${firstRule}"), this is a deterministic offline answer from the simulated model.`,
    };
  };
}

export const lab03: LabImplementation<Lab03Input, Lab03Output, LabServices> = {
  definition: lab03Definition as LabDefinition,
  inputSchema: Lab03InputSchema,

  async run(ctx, input) {
    const resolved = ctx.services.models.resolve({
      mode: ctx.mode,
      modelId: input.modelId,
      offline: lab03OfflineReply(input.agentName),
    });

    ctx.emit({ type: 'workflow-step', stepId: 'define-agent', status: 'running' });
    const agent = new Agent({
      id: input.agentId,
      name: input.agentName,
      instructions: input.instructions,
      model: resolved.model,
    });
    ctx.log('info', `new Agent({ id: '${agent.id}', name: '${agent.name}', model: '${input.modelId}'${resolved.simulated ? ' (offline simulation)' : ''} })`);
    ctx.emit({ type: 'workflow-step', stepId: 'define-agent', status: 'success', output: { id: agent.id, name: agent.name } });

    ctx.emit({ type: 'workflow-step', stepId: 'register', status: 'running' });
    const mastra = new Mastra({ agents: { [input.agentKey]: agent }, logger: false });
    const registeredKeys = Object.keys(mastra.listAgents());
    ctx.log('info', `new Mastra({ agents: { ${input.agentKey} } }) → registered keys: ${registeredKeys.join(', ')}`);
    ctx.emit({ type: 'workflow-step', stepId: 'register', status: 'success', output: { registeredKeys } });

    ctx.emit({ type: 'workflow-step', stepId: 'lookup', status: 'running' });
    const lookupTool = (name: string, args: unknown, fn: () => Agent) => {
      const callId = `lookup-${name}`;
      ctx.emit({ type: 'tool-start', toolCallId: callId, toolName: name, args });
      try {
        const found = fn();
        ctx.emit({ type: 'tool-finish', toolCallId: callId, toolName: name, status: 'success', result: { id: found.id, name: found.name }, durationMs: 0 });
        return found;
      } catch (err) {
        ctx.emit({ type: 'tool-finish', toolCallId: callId, toolName: name, status: 'error', error: err instanceof Error ? err.message : String(err), durationMs: 0 });
        return null;
      }
    };
    const byKey = lookupTool('mastra.getAgent', { key: input.agentKey }, () => mastra.getAgent(input.agentKey));
    const byId = lookupTool('mastra.getAgentById', { id: input.agentId }, () => mastra.getAgentById(input.agentId));
    ctx.emit({ type: 'workflow-step', stepId: 'lookup', status: byKey && byId ? 'success' : 'failed' });
    if (!byKey || !byId) throw new LabError('INTERNAL', 'Registered agent could not be looked up');

    ctx.emit({ type: 'workflow-step', stepId: 'generate', status: 'running' });
    const started = Date.now();
    const res = await byId.generate(input.prompt, { abortSignal: ctx.signal });
    ctx.log('info', `agent.generate() finished in ${Date.now() - started} ms`);
    ctx.emit({ type: 'workflow-step', stepId: 'generate', status: 'success', durationMs: Date.now() - started });

    const usage = res.usage
      ? { inputTokens: res.usage.inputTokens ?? undefined, outputTokens: res.usage.outputTokens ?? undefined, totalTokens: res.usage.totalTokens ?? undefined }
      : undefined;
    ctx.setResultExtras({
      effective: { mode: ctx.mode, modelId: input.modelId, simulated: resolved.simulated, agentKey: input.agentKey, agentId: input.agentId },
      ...(usage ? { usage } : {}),
    });
    return {
      registeredKeys,
      lookup: {
        byKey: { id: byKey.id, name: byKey.name },
        byId: { id: byId.id, name: byId.name },
        sameInstance: byKey === byId && byId === agent,
      },
      model: { id: input.modelId, simulated: resolved.simulated },
      text: res.text,
      usage,
      systemPromptSeen: resolved.scripted?.calls[0]?.system,
    };
  },

  validate(out, input) {
    const instructionsVerifiable = out.systemPromptSeen !== undefined;
    return summarizeChecks([
      {
        id: 'registered',
        label: 'Agent registered on the Mastra instance under your key',
        passed: out.registeredKeys.includes(input.agentKey),
        message: `keys: ${out.registeredKeys.join(', ')}`,
      },
      {
        id: 'lookup-by-id',
        label: 'mastra.getAgentById() finds the agent',
        passed: out.lookup.byId?.id === input.agentId,
      },
      {
        id: 'same-instance',
        label: 'Lookup by key and by id return the same Agent instance',
        passed: out.lookup.sameInstance,
      },
      {
        id: 'text-returned',
        label: 'agent.generate() returned non-empty text',
        passed: out.text.trim().length > 0,
        message: `${out.text.length} characters`,
      },
      {
        id: 'instructions-delivered',
        label: 'Your instructions reached the model as the system prompt',
        passed: instructionsVerifiable ? out.systemPromptSeen!.includes(input.instructions.trim()) : true,
        message: instructionsVerifiable ? undefined : 'Not observable in live mode (provider prompt is not exposed); assumed.',
      },
    ]);
  },
};
