import { z } from 'zod';
import { Agent } from '@mastra/core/agent';
import { summarizeChecks, type LabDefinition } from '@mlp/contracts';
import type { LabImplementation } from '@mlp/lab-engine';
import { DEFAULT_LIVE_MODELS } from '@mlp/mastra-runtime';
import type { LabServices } from '../services.js';
import { withLabLogger } from '../shared/agent-kit.js';
import { lab09Definition } from './definition.js';
import { extractTicketOffline, TicketSchema, type Ticket } from './schema.js';

export const INSTRUCTIONS =
  'You turn customer support messages into tickets. Fill every field of the requested JSON schema; use null for a missing email.';

export const FALLBACK_TICKET: Ticket = {
  title: 'Unclassified request',
  priority: 'medium',
  category: 'general',
  tags: [],
  customerEmail: null,
};

export const Lab09InputSchema = z.object({
  message: z.string().trim().min(5, 'Paste a support message (at least 5 characters)').max(3000),
  modelId: z.enum(DEFAULT_LIVE_MODELS),
  errorStrategy: z.enum(['strict', 'warn', 'fallback']),
  offlineResponse: z.enum(['valid', 'fenced', 'wrong-shape', 'broken-json']).default('valid'),
});
export type Lab09Input = z.infer<typeof Lab09InputSchema>;

export interface Lab09Output {
  object: Ticket | null;
  schemaValid: boolean;
  strategy: Lab09Input['errorStrategy'];
  usedFallback: boolean;
  error: { code: string; issues: { path: string; message: string }[] } | null;
  modelResponseKind: Lab09Input['offlineResponse'] | 'live';
  jsonSchema: unknown;
}

/** What the simulated model returns for each offline response kind. */
export function offlineModelText(kind: Lab09Input['offlineResponse'], message: string): string {
  const good = extractTicketOffline(message);
  switch (kind) {
    case 'valid':
      return JSON.stringify(good);
    case 'fenced':
      return '```json\n' + JSON.stringify(good, null, 2) + '\n```';
    case 'wrong-shape':
      return JSON.stringify({ ...good, priority: 'urgent', tags: 'login' });
    case 'broken-json':
      return JSON.stringify(good).slice(0, 25);
  }
}

/** Pulls Zod issue lines out of Mastra's structured-output error message. */
function issuesFrom(err: unknown): { path: string; message: string }[] {
  const msg = err instanceof Error ? err.message : String(err);
  return msg
    .split('\n')
    .map((l) => /^\s*-\s*([\w.[\]]+):\s*(.+)$/.exec(l))
    .filter((m): m is RegExpExecArray => Boolean(m))
    .map((m) => ({ path: m[1]!, message: m[2]! }));
}

export const lab09: LabImplementation<Lab09Input, Lab09Output, LabServices> = {
  definition: lab09Definition as LabDefinition,
  inputSchema: Lab09InputSchema,

  async run(ctx, input) {
    const kind = ctx.mode === 'offline' ? input.offlineResponse : 'live';
    const resolved = ctx.services.models.resolve({
      mode: ctx.mode,
      modelId: input.modelId,
      offline: () => ({ text: offlineModelText(input.offlineResponse, input.message) }),
    });
    const agent = withLabLogger(
      ctx,
      new Agent({ id: 'ticket-agent', name: 'Ticket Agent', instructions: INSTRUCTIONS, model: resolved.model }),
    );
    const jsonSchema = z.toJSONSchema(TicketSchema);

    ctx.emit({
      type: 'workflow-step',
      stepId: 'generate-structured',
      status: 'running',
      input: { errorStrategy: input.errorStrategy, modelResponse: kind },
    });
    let object: Ticket | null = null;
    let usedFallback = false;
    let error: Lab09Output['error'] = null;
    try {
      const structuredOutput =
        input.errorStrategy === 'fallback'
          ? { schema: TicketSchema, errorStrategy: 'fallback' as const, fallbackValue: FALLBACK_TICKET }
          : { schema: TicketSchema, errorStrategy: input.errorStrategy };
      const res = await agent.generate(input.message, { abortSignal: ctx.signal, structuredOutput });
      object = (res.object as Ticket | undefined) ?? null;
      usedFallback = Boolean((res as { usedFallbackValue?: boolean }).usedFallbackValue);
      if (input.errorStrategy === 'warn' && object === null) {
        ctx.log('warn', 'The model response did not match the schema; errorStrategy "warn" returned no object.');
      }
      if (usedFallback) ctx.log('warn', 'The model response did not match the schema; using the fallback ticket.');
    } catch (err) {
      ctx.throwIfAborted();
      // strict: Mastra throws a structured-output validation error. Report it; never crash the run.
      const code = (err as { id?: string }).id ?? 'STRUCTURED_OUTPUT_ERROR';
      error = { code, issues: issuesFrom(err) };
      ctx.log(
        'warn',
        `Structured output rejected (${code}): ${error.issues.map((i) => `${i.path}: ${i.message}`).join('; ') || 'invalid JSON'}`,
      );
    }
    // Defence in depth: validate again with our own schema before trusting the object.
    const schemaValid = object !== null && TicketSchema.safeParse(object).success;
    ctx.emit({
      type: 'workflow-step',
      stepId: 'generate-structured',
      status: error ? 'failed' : 'success',
      output: { schemaValid, usedFallback },
    });

    ctx.setResultExtras({
      effective: { mode: ctx.mode, modelId: input.modelId, simulated: resolved.simulated, errorStrategy: input.errorStrategy },
    });
    return { object, schemaValid, strategy: input.errorStrategy, usedFallback, error, modelResponseKind: kind, jsonSchema };
  },

  validate(out) {
    const malformed = out.modelResponseKind === 'wrong-shape' || out.modelResponseKind === 'broken-json';
    const strategyOk = !malformed
      ? out.error === null && !out.usedFallback && out.object !== null
      : out.strategy === 'strict'
        ? out.error !== null && out.object === null
        : out.strategy === 'warn'
          ? out.error === null && out.object === null
          : out.usedFallback && out.object !== null;
    return summarizeChecks([
      { id: 'no-crash', label: 'The run completed even if the model returned bad JSON', passed: true },
      {
        id: 'object-valid',
        label: 'Any returned object passes the Zod schema',
        passed: out.object === null || out.schemaValid,
        message: out.object ? `priority=${out.object.priority} · category=${out.object.category}` : 'no object returned',
      },
      {
        id: 'strategy-respected',
        label: `errorStrategy "${out.strategy}" behaved as documented`,
        passed: strategyOk,
        message: malformed
          ? out.strategy === 'strict'
            ? `rejected: ${out.error?.code ?? '—'}`
            : out.strategy === 'warn'
              ? 'no object, warning logged'
              : 'fallback ticket used'
          : 'valid response accepted',
      },
      {
        id: 'typed-result',
        label: 'Downstream code gets a valid ticket or an explicit null, never bad data',
        passed: malformed && out.strategy !== 'fallback' ? out.object === null : out.schemaValid,
      },
    ]);
  },
};
