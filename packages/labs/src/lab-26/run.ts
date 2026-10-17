import { z } from 'zod';
import { Agent } from '@mastra/core/agent';
import { summarizeChecks, type LabDefinition } from '@mlp/contracts';
import type { LabImplementation } from '@mlp/lab-engine';
import { DEFAULT_LIVE_MODELS, type PromptView, type ScriptedTurn } from '@mlp/mastra-runtime';
import type { LabServices } from '../services.js';
import { withLabLogger } from '../shared/agent-kit.js';
import { runTypedWorkflow, type StepTrace } from '../shared/workflow-stream.js';
import { lab26Definition } from './definition.js';
import { buildQuoteWorkflow, CATALOG, priceOrder, QuoteSchema, SKUS, type Extraction, type Quote, type Sku } from './workflow.js';

export const Lab26InputSchema = z.object({
  email: z.string().max(2_000),
  currency: z.string().max(10),
  buggyStep: z.boolean(),
  modelId: z.enum(DEFAULT_LIVE_MODELS),
});
export type Lab26Input = z.infer<typeof Lab26InputSchema>;

export interface Lab26Output {
  workflowId: string;
  status: string;
  stepExecutionPath: string[];
  steps: StepTrace[];
  outputValid: boolean;
  outputIssues: { path: string; message: string }[];
  /** The result as returned by Mastra (possibly not matching the schema when the step is buggy). */
  rawResult: unknown;
  quote: Quote | null;
  /** Mastra's own input validation, shown with a deliberately invalid second run. */
  inputProbe: { rejected: boolean; message: string };
  /** Input validation of THIS run (the learner can type invalid input too). */
  inputError: string | null;
}

const NUMBERS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

/** Offline extraction (what the scripted model "understands" from the email). */
export function extractOffline(email: string): Extraction {
  const text = email.toLowerCase();
  const items: Extraction['items'] = [];
  for (const sku of SKUS) {
    const words = [...CATALOG[sku].words].sort((a, b) => b.length - a.length).map((w) => w.replace('-', '-?'));
    const m = text.match(new RegExp(`\\b(\\d+|${Object.keys(NUMBERS).join('|')})\\s+(?:\\w+\\s+)?(?:${words.join('|')})\\b`));
    if (m) items.push({ sku: sku as Sku, quantity: Math.min(99, Number(m[1]) || NUMBERS[m[1]!] || 1) });
  }
  const code = email.match(/\bcode\s+([A-Z0-9]{4,})\b/i)?.[1]?.toUpperCase() ?? null;
  return { items, discountCode: code };
}

export function offlineScript() {
  return (v: PromptView): ScriptedTurn => ({ text: JSON.stringify(extractOffline(v.lastUser)) });
}

export const lab26: LabImplementation<Lab26Input, Lab26Output, LabServices> = {
  definition: lab26Definition as LabDefinition,
  inputSchema: Lab26InputSchema,

  async run(ctx, input) {
    const resolved = ctx.services.models.resolve({ mode: ctx.mode, modelId: input.modelId, offline: offlineScript() });
    const agent = withLabLogger(
      ctx,
      new Agent({
        id: 'order-extractor',
        name: 'Order Extractor',
        instructions: `Extract the ordered items from the customer's email. Products (sku: name): ${SKUS.map((s) => `${s}: ${CATALOG[s].name}`).join(', ')}. Return each product with its quantity, and the discount code if the email mentions one (otherwise null). Do not invent products.`,
        model: resolved.model,
      }),
    );
    const workflow = buildQuoteWorkflow(agent, { buggy: input.buggyStep, signal: ctx.signal });

    // Probe: Mastra validates workflow input before any step runs (no model call is made).
    let inputProbe = { rejected: false, message: '' };
    try {
      await (await workflow.createRun()).start({ inputData: { email: '', currency: 'JPY' } as never });
    } catch (err) {
      inputProbe = { rejected: true, message: (err as Error).message };
    }
    ctx.log('info', `input probe: ${inputProbe.rejected ? 'rejected' : 'accepted'} — ${inputProbe.message.split('\n')[0]}`);

    let res: Awaited<ReturnType<typeof runTypedWorkflow<Quote>>> | null = null;
    let inputError: string | null = null;
    try {
      res = await runTypedWorkflow(
        ctx,
        'quote-workflow',
        await workflow.createRun(),
        { email: input.email, currency: input.currency },
        QuoteSchema,
      );
    } catch (err) {
      ctx.throwIfAborted();
      inputError = (err as Error).message;
      ctx.log('warn', `Mastra rejected the input: ${inputError.split('\n').slice(0, 3).join(' ')}`);
    }

    ctx.setResultExtras({
      effective: { mode: ctx.mode, modelId: input.modelId, simulated: resolved.simulated, buggyStep: input.buggyStep },
    });
    return {
      workflowId: 'quote-workflow',
      status: res?.status ?? 'rejected',
      stepExecutionPath: res?.stepExecutionPath ?? [],
      steps: res?.steps ?? [],
      outputValid: res?.outputValid ?? false,
      outputIssues: res?.outputIssues ?? [],
      rawResult: res?.result ?? null,
      quote: res?.typed ?? null,
      inputProbe,
      inputError,
    };
  },

  validate(out, input, { events }) {
    const recomputed = out.quote
      ? priceOrder(
          { items: out.quote.lines.map((l) => ({ sku: l.sku, quantity: l.quantity })), discountCode: out.quote.discountCode },
          out.quote.currency,
        )
      : null;
    const steps = events.filter((e) => e.type === 'workflow-step').map((e) => `${e.stepId}:${e.status}`);
    const expectedTrace = [
      'quote-workflow:running',
      'extract-and-price:running',
      'extract-and-price:success',
      'quote-workflow:success',
    ];
    return summarizeChecks([
      {
        id: 'expected-typed-output',
        label: 'The workflow produced output that passes its schema and matches the catalog prices',
        passed: out.outputValid && recomputed !== null && JSON.stringify(recomputed) === JSON.stringify(out.quote),
        message: out.outputValid
          ? `total ${out.quote?.formattedTotal}`
          : out.inputError
            ? 'input rejected'
            : `output invalid: ${out.outputIssues.map((i) => `${i.path}: ${i.message}`).join('; ')}`,
      },
      {
        id: 'input-validated',
        label: 'Mastra rejected invalid workflow input before any step ran',
        passed: out.inputProbe.rejected && /email/.test(out.inputProbe.message) && /currency/.test(out.inputProbe.message),
        message: out.inputProbe.message.split('\n').slice(0, 3).join(' ') || 'not rejected',
      },
      {
        id: 'single-typed-step',
        label: 'Exactly one typed step ran',
        passed: JSON.stringify(out.stepExecutionPath) === JSON.stringify(['extract-and-price']),
        message: out.stepExecutionPath.join(' → ') || 'no step ran',
      },
      {
        id: 'trace-ordered',
        label: 'The trace shows start → step running → step result → finish, in order',
        passed: JSON.stringify(steps) === JSON.stringify(expectedTrace),
        message: steps.join(', '),
      },
      {
        id: 'nothing-invented',
        label: 'Every quoted line is a real catalog product with a positive quantity',
        passed:
          out.quote !== null && out.quote.lines.length > 0 && out.quote.lines.every((l) => l.sku in CATALOG && l.quantity > 0),
        message: out.quote ? out.quote.lines.map((l) => `${l.quantity}× ${l.sku}`).join(', ') : 'no quote',
      },
    ]);
  },
};
