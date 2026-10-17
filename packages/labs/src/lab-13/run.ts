import { z } from 'zod';
import { Agent } from '@mastra/core/agent';
import { summarizeChecks, type LabDefinition } from '@mlp/contracts';
import type { LabImplementation } from '@mlp/lab-engine';
import { DEFAULT_LIVE_MODELS, type PromptView, type ScriptedTurn } from '@mlp/mastra-runtime';
import type { LabServices } from '../services.js';
import { withLabLogger } from '../shared/agent-kit.js';
import { streamAgent, type ToolTrace } from '../shared/tool-stream.js';
import { lab13Definition } from './definition.js';
import {
  convertAndFormat,
  formatCurrencyTool,
  inventoryLookupTool,
  lookupSku,
  RATES_FROM_USD,
  type Currency,
  type LookupResult,
} from './tools.js';

export const INSTRUCTIONS =
  'You are a shop assistant. Use inventoryLookup for every SKU the customer mentions, then formatCurrency to show each found price in the requested currency. Never invent stock or prices.';

const CURRENCIES = Object.keys(RATES_FROM_USD) as [Currency, ...Currency[]];

export const Lab13InputSchema = z.object({
  question: z.string().trim().min(1).max(500),
  currency: z.enum(CURRENCIES),
  modelId: z.enum(DEFAULT_LIVE_MODELS),
});
export type Lab13Input = z.infer<typeof Lab13InputSchema>;

export interface Lab13Output {
  skus: string[];
  answer: string;
  toolCalls: ToolTrace[];
  expected: { sku: string; lookup: LookupResult; formatted: string | null }[];
}

export const skusIn = (text: string) => [...new Set(text.toUpperCase().match(/\b[A-Z]{3}-\d{4}\b/g) ?? [])];

/** Offline model: look up every SKU (parallel calls), then format each found price, then answer. */
export function offlineScript(question: string, currency: Currency) {
  const skus = skusIn(question);
  return (v: PromptView): ScriptedTurn => {
    const lookups = v.toolResults.filter((r) => r.toolName === 'inventoryLookup');
    const formats = v.toolResults.filter((r) => r.toolName === 'formatCurrency');
    if (lookups.length === 0 && skus.length > 0) {
      return { toolCalls: skus.map((sku) => ({ toolName: 'inventoryLookup', input: { sku } })) };
    }
    const found = lookups
      .map((r) => r.output as LookupResult)
      .filter((l): l is Extract<LookupResult, { found: true }> => l.found);
    if (formats.length === 0 && found.length > 0) {
      return {
        toolCalls: found.map((l) => ({ toolName: 'formatCurrency', input: { amountCents: l.unitPriceCents, currency } })),
      };
    }
    const lines = lookups.map((r) => {
      const l = r.output as LookupResult;
      if (!l.found) return `${l.sku}: not found.`;
      const price =
        (formats[found.findIndex((f) => f.sku === l.sku)]?.output as { formatted?: string } | undefined)?.formatted ?? '?';
      return `${l.sku} (${l.name}): ${l.inStock ? `${l.quantity} in stock` : 'out of stock'}, ${price}.`;
    });
    return { text: lines.length ? lines.join(' ') : 'Please tell me which SKU you are interested in (format ABC-1234).' };
  };
}

export const lab13: LabImplementation<Lab13Input, Lab13Output, LabServices> = {
  definition: lab13Definition as LabDefinition,
  inputSchema: Lab13InputSchema,

  async run(ctx, input) {
    const resolved = ctx.services.models.resolve({
      mode: ctx.mode,
      modelId: input.modelId,
      offline: offlineScript(input.question, input.currency),
    });
    const agent = withLabLogger(
      ctx,
      new Agent({
        id: 'shop-agent',
        name: 'Shop Agent',
        instructions: INSTRUCTIONS,
        model: resolved.model,
        tools: { inventoryLookup: inventoryLookupTool, formatCurrency: formatCurrencyTool },
      }),
    );
    const prompt = `${input.question}\n\nShow prices in ${input.currency}.`;
    ctx.emit({ type: 'workflow-step', stepId: 'agent-loop', status: 'running' });
    const res = await streamAgent(ctx, agent, prompt, { maxSteps: 5 });
    ctx.emit({ type: 'workflow-step', stepId: 'agent-loop', status: 'success', output: { toolCalls: res.tools.length } });
    for (const t of res.tools) ctx.log('info', `tool ${t.toolName} (${t.toolCallId}) → ${t.status} in ${t.durationMs} ms`);

    const skus = skusIn(input.question);
    const expected = skus.map((sku) => {
      const lookup = lookupSku(sku);
      return { sku, lookup, formatted: lookup.found ? convertAndFormat(lookup.unitPriceCents, input.currency).formatted : null };
    });
    ctx.setResultExtras({ effective: { mode: ctx.mode, modelId: input.modelId, simulated: resolved.simulated, maxSteps: 5 } });
    return { skus, answer: res.text, toolCalls: res.tools, expected };
  },

  validate(out, input) {
    const lookups = out.toolCalls.filter((t) => t.toolName === 'inventoryLookup' && t.status === 'success');
    const formats = out.toolCalls.filter((t) => t.toolName === 'formatCurrency' && t.status === 'success');
    const lookedUp = new Set(lookups.map((t) => (t.args as { sku?: string }).sku));
    const foundPrices = out.expected
      .filter((e) => e.lookup.found)
      .map((e) => (e.lookup as { unitPriceCents: number }).unitPriceCents);
    const chained = foundPrices.every((cents) =>
      formats.some(
        (f) =>
          (f.args as { amountCents?: number; currency?: string }).amountCents === cents &&
          (f.args as { currency?: string }).currency === input.currency,
      ),
    );
    const ids = out.toolCalls.map((t) => t.toolCallId);
    return summarizeChecks([
      {
        id: 'lookup-each-sku',
        label: 'inventoryLookup was called for every SKU',
        passed: out.skus.length > 0 && out.skus.every((s) => lookedUp.has(s)),
        message: `SKUs: ${out.skus.join(', ') || 'none'}`,
      },
      {
        id: 'chained',
        label: 'formatCurrency used the prices returned by inventoryLookup',
        passed: chained,
        message: `${formats.length} format call(s)`,
      },
      {
        id: 'separate-calls',
        label: 'Each tool call was logged separately with its own id',
        passed: new Set(ids).size === ids.length && ids.length >= 2,
        message: `${ids.length} calls`,
      },
      {
        id: 'answer-grounded',
        label: 'The answer shows each found price as formatted by the tool',
        passed: out.expected.filter((e) => e.formatted).every((e) => out.answer.includes(e.formatted!)),
      },
    ]);
  },
};
