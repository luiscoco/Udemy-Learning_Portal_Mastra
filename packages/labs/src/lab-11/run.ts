import { z } from 'zod';
import { Agent } from '@mastra/core/agent';
import { Mastra } from '@mastra/core/mastra';
import { summarizeChecks, type LabDefinition } from '@mlp/contracts';
import type { LabImplementation } from '@mlp/lab-engine';
import { DEFAULT_LIVE_MODELS, type PromptView, type ScriptedTurn } from '@mlp/mastra-runtime';
import type { LabServices } from '../services.js';
import { withLabLogger } from '../shared/agent-kit.js';
import { streamAgent, type ToolTrace } from '../shared/tool-stream.js';
import { lab11Definition } from './definition.js';
import { calculateOrderTotal, formatUsd, OrderInputSchema, orderTotalTool, type OrderTotal } from './tool.js';

export const INSTRUCTIONS =
  'You are a checkout assistant. Always call the calculateOrderTotal tool for any price math; never calculate totals yourself. Report the final total in US dollars.';

export const Lab11InputSchema = z.object({
  cart: OrderInputSchema,
  question: z.string().trim().min(1).max(500),
  modelId: z.enum(DEFAULT_LIVE_MODELS),
});
export type Lab11Input = z.infer<typeof Lab11InputSchema>;

export interface Lab11Output {
  answer: string;
  toolCalls: ToolTrace[];
  expected: OrderTotal;
  registered: { agentTools: string[]; mastraTools: string[]; lookupById: string | null };
}

/** Offline model: first call the tool with the cart, then answer from the tool result. */
export function offlineScript(cart: Lab11Input['cart']) {
  return (v: PromptView): ScriptedTurn => {
    const result = v.toolResults.find((r) => r.toolName === 'calculateOrderTotal');
    if (!result) return { toolCalls: [{ toolName: 'calculateOrderTotal', input: cart }] };
    const t = result.output as OrderTotal;
    return {
      text: `The total is ${formatUsd(t.totalCents)} (subtotal ${formatUsd(t.subtotalCents)}, discount ${formatUsd(t.discountCents)}, tax ${formatUsd(t.taxCents)}).`,
    };
  };
}

export const lab11: LabImplementation<Lab11Input, Lab11Output, LabServices> = {
  definition: lab11Definition as LabDefinition,
  inputSchema: Lab11InputSchema,

  async run(ctx, input) {
    const resolved = ctx.services.models.resolve({ mode: ctx.mode, modelId: input.modelId, offline: offlineScript(input.cart) });
    const agent = withLabLogger(
      ctx,
      new Agent({
        id: 'checkout-agent',
        name: 'Checkout Agent',
        instructions: INSTRUCTIONS,
        model: resolved.model,
        tools: { calculateOrderTotal: orderTotalTool },
      }),
    );
    // Register the tool and the agent on the Mastra instance so the app (and Studio) can find them.
    const mastra = new Mastra({
      agents: { checkoutAgent: agent },
      tools: { calculateOrderTotal: orderTotalTool },
      logger: false,
    });
    const registered = {
      agentTools: Object.keys(await agent.listTools()),
      mastraTools: Object.keys(mastra.listTools() ?? {}),
      lookupById: mastra.getToolById('calculate-order-total')?.id ?? null,
    };
    ctx.log('info', `Tools on the agent: ${registered.agentTools.join(', ')} · on Mastra: ${registered.mastraTools.join(', ')}`);

    ctx.emit({ type: 'workflow-step', stepId: 'agent-with-tool', status: 'running' });
    const prompt = `${input.question}\n\nCart (JSON):\n${JSON.stringify(input.cart)}`;
    const res = await streamAgent(ctx, agent, prompt, { maxSteps: 3 });
    ctx.emit({ type: 'workflow-step', stepId: 'agent-with-tool', status: 'success', output: { toolCalls: res.tools.length } });

    ctx.setResultExtras({
      effective: { mode: ctx.mode, modelId: input.modelId, simulated: resolved.simulated, maxSteps: 3 },
      ...(res.usage ? { usage: res.usage } : {}),
    });
    return { answer: res.text, toolCalls: res.tools, expected: calculateOrderTotal(input.cart), registered };
  },

  validate(out) {
    const calls = out.toolCalls.filter((t) => t.toolName === 'calculateOrderTotal');
    const ok = calls.find((t) => t.status === 'success');
    const result = ok?.result as OrderTotal | undefined;
    return summarizeChecks([
      {
        id: 'tool-registered',
        label: 'The tool is registered on the agent and on the Mastra instance',
        passed:
          out.registered.agentTools.includes('calculateOrderTotal') && out.registered.lookupById === 'calculate-order-total',
      },
      {
        id: 'tool-called',
        label: 'The agent called calculateOrderTotal',
        passed: Boolean(ok),
        message: `${calls.length} call(s)`,
      },
      {
        id: 'totals-correct',
        label: 'The tool returned the correct totals',
        passed:
          Boolean(result) &&
          result!.totalCents === out.expected.totalCents &&
          result!.subtotalCents === out.expected.subtotalCents,
        message: result ? `tool ${formatUsd(result.totalCents)} · expected ${formatUsd(out.expected.totalCents)}` : undefined,
      },
      {
        id: 'answer-uses-total',
        label: 'The final answer states the tool’s total',
        passed:
          out.answer.includes(formatUsd(out.expected.totalCents)) ||
          out.answer.includes((out.expected.totalCents / 100).toFixed(2)),
      },
    ]);
  },
};
