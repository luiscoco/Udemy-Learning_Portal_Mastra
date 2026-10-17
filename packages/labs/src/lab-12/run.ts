import { z } from 'zod';
import { Agent } from '@mastra/core/agent';
import { createTool } from '@mastra/core/tools';
import { summarizeChecks, type LabDefinition } from '@mlp/contracts';
import type { LabImplementation } from '@mlp/lab-engine';
import { DEFAULT_LIVE_MODELS, type PromptView, type ScriptedTurn } from '@mlp/mastra-runtime';
import type { LabServices } from '../services.js';
import { withLabLogger } from '../shared/agent-kit.js';
import { streamAgent, type ToolTrace } from '../shared/tool-stream.js';
import { lab12Definition } from './definition.js';
import {
  fieldErrors,
  performSupportAction,
  SupportActionInputSchema,
  SupportActionOutputSchema,
  type FieldError,
  type SupportActionOutput,
} from './schema.js';

export const Lab12InputSchema = z.object({
  /** The arguments the (simulated) model sends to the tool — deliberately NOT validated here. */
  toolArgs: z.record(z.string(), z.unknown()),
  request: z.string().trim().min(1).max(500),
  modelId: z.enum(DEFAULT_LIVE_MODELS),
});
export type Lab12Input = z.infer<typeof Lab12InputSchema>;

export interface Lab12Output {
  argsValid: boolean;
  fieldErrors: FieldError[];
  mastraValidationMessage: string | null;
  executeCalls: number;
  toolOutput: SupportActionOutput | null;
  toolCalls: ToolTrace[];
  answer: string;
}

export const lab12: LabImplementation<Lab12Input, Lab12Output, LabServices> = {
  definition: lab12Definition as LabDefinition,
  inputSchema: Lab12InputSchema,

  async run(ctx, input) {
    // A fresh tool per run so the execute counter proves exactly what ran in this run.
    let executeCalls = 0;
    const supportActionTool = createTool({
      id: 'support-action',
      description:
        'Starts a refund or an exchange for an order. Set "action" to "refund" or "exchange" and provide that action’s fields.',
      inputSchema: SupportActionInputSchema,
      outputSchema: SupportActionOutputSchema,
      execute: async (validated) => {
        executeCalls++;
        ctx.log('info', `Business logic executed for a ${validated.action}`);
        return performSupportAction(validated);
      },
    });

    const offline = (v: PromptView): ScriptedTurn => {
      const r = v.toolResults.find((t) => t.toolName === 'supportAction');
      if (!r) return { toolCalls: [{ toolName: 'supportAction', input: input.toolArgs }] };
      const out = r.output as { error?: boolean; message?: string; summary?: string };
      return {
        text: out?.error
          ? 'I could not start that request because some details were invalid. Please check the highlighted fields.'
          : `Done: ${out.summary}.`,
      };
    };
    const resolved = ctx.services.models.resolve({ mode: ctx.mode, modelId: input.modelId, offline });
    const agent = withLabLogger(
      ctx,
      new Agent({
        id: 'support-agent',
        name: 'Support Agent',
        instructions:
          'You start refunds and exchanges with the supportAction tool. Use exactly the arguments given in the request JSON.',
        model: resolved.model,
        tools: { supportAction: supportActionTool },
      }),
    );

    // Our own parse gives structured, field-level errors for the learner (same schema the tool uses).
    const errors = fieldErrors(input.toolArgs);
    for (const e of errors) ctx.log('warn', `Invalid field ${e.path}: ${e.message}`);

    ctx.emit({ type: 'workflow-step', stepId: 'tool-call', status: 'running', input: { argsValid: errors.length === 0 } });
    const prompt = `${input.request}\n\nTool arguments (JSON):\n${JSON.stringify(input.toolArgs)}`;
    const res = await streamAgent(ctx, agent, prompt, { maxSteps: 2 });
    const call = res.tools.find((t) => t.toolName === 'supportAction');
    ctx.emit({ type: 'workflow-step', stepId: 'tool-call', status: call?.status === 'success' ? 'success' : 'failed' });

    const toolOutput = call?.status === 'success' ? (call.result as SupportActionOutput) : null;
    ctx.setResultExtras({ effective: { mode: ctx.mode, modelId: input.modelId, simulated: resolved.simulated } });
    return {
      argsValid: errors.length === 0,
      fieldErrors: errors,
      mastraValidationMessage: call?.status === 'invalid' ? (call.error ?? null) : null,
      executeCalls,
      toolOutput,
      toolCalls: res.tools,
      answer: res.text,
    };
  },

  validate(out, _input, { mode }) {
    const offline = mode === 'offline';
    return summarizeChecks([
      {
        id: 'invalid-not-executed',
        label: 'Invalid arguments never reached the business logic',
        // Invariant: execute() ran exactly once per call that passed Mastra's input validation, never for rejected calls.
        passed: out.executeCalls === out.toolCalls.filter((t) => t.status === 'success').length,
        message: `execute() ran ${out.executeCalls} time(s) · ${out.toolCalls.filter((t) => t.status === 'invalid').length} call(s) rejected by validation`,
      },
      {
        id: 'field-errors',
        label: out.argsValid ? 'Valid arguments produced no field errors' : 'Each invalid field is reported with a message',
        passed: out.argsValid
          ? out.fieldErrors.length === 0
          : out.fieldErrors.length > 0 && out.fieldErrors.every((e) => e.path && e.message),
        message: out.fieldErrors.map((e) => `${e.path}: ${e.message}`).join('; ') || undefined,
      },
      {
        id: 'mastra-agrees',
        label: 'Mastra’s own tool validation agreed with the schema',
        // Offline the model sends exactly the learner's args; live models may rewrite them, so only consistency is checked.
        passed: offline
          ? out.argsValid
            ? out.mastraValidationMessage === null && out.executeCalls === 1
            : out.mastraValidationMessage !== null
          : true,
        message: out.mastraValidationMessage ?? undefined,
      },
      {
        id: 'typed-output',
        label: 'Accepted calls returned output that matches the output schema',
        passed: out.toolOutput === null || SupportActionOutputSchema.safeParse(out.toolOutput).success,
      },
    ]);
  },
};
