import { z } from 'zod';
import { Agent } from '@mastra/core/agent';
import { summarizeChecks, type LabDefinition } from '@mlp/contracts';
import type { LabImplementation } from '@mlp/lab-engine';
import { DEFAULT_LIVE_MODELS } from '@mlp/mastra-runtime';
import type { LabServices } from '../services.js';
import { usageOf, withLabLogger } from '../shared/agent-kit.js';
import { simulatedAnswer } from '../shared/simulated.js';
import { lab08Definition } from './definition.js';

export const INSTRUCTIONS = 'You are a helpful assistant that explains things step by step.';

export const Lab08InputSchema = z.object({
  prompt: z.string().trim().min(1, 'The prompt must not be empty').max(2000),
  modelId: z.enum(DEFAULT_LIVE_MODELS),
  tokenDelayMs: z.number().int().min(0).max(500).default(120),
  stopAfterTokens: z.number().int().min(0).max(500).default(0),
});
export type Lab08Input = z.infer<typeof Lab08InputSchema>;

export interface Lab08Output {
  text: string;
  tokenEvents: number;
  firstTokenMs: number | null;
  totalMs: number;
  finishReason: string | null;
  stoppedEarly: boolean;
  chunkTypes: Record<string, number>;
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
}

export const lab08: LabImplementation<Lab08Input, Lab08Output, LabServices> = {
  definition: lab08Definition as LabDefinition,
  inputSchema: Lab08InputSchema,

  async run(ctx, input) {
    const resolved = ctx.services.models.resolve({
      mode: ctx.mode,
      modelId: input.modelId,
      tokenDelayMs: input.tokenDelayMs,
      offline: (view) => ({ text: simulatedAnswer({ modelId: input.modelId, system: view.system, user: view.lastUser }) }),
    });
    const agent = withLabLogger(
      ctx,
      new Agent({ id: 'stream-agent', name: 'Stream Agent', instructions: INSTRUCTIONS, model: resolved.model }),
    );

    // Our own controller lets the lab stop the stream early (token budget) as well as
    // follow the run's signal (Cancel button, deadline, client disconnect).
    const local = new AbortController();
    const signal = AbortSignal.any([ctx.signal, local.signal]);

    ctx.emit({ type: 'workflow-step', stepId: 'stream', status: 'running', input: { modelId: input.modelId } });
    const started = Date.now();
    const stream = await agent.stream(input.prompt, { abortSignal: signal });
    let text = '';
    let tokenEvents = 0;
    let firstTokenMs: number | null = null;
    let stoppedEarly = false;
    const chunkTypes: Record<string, number> = {};

    for await (const chunk of stream.fullStream) {
      chunkTypes[chunk.type] = (chunkTypes[chunk.type] ?? 0) + 1;
      if (chunk.type !== 'text-delta') continue;
      const delta = (chunk as { payload?: { text?: string } }).payload?.text ?? '';
      if (!delta) continue;
      if (firstTokenMs === null) {
        firstTokenMs = Date.now() - started;
        ctx.log('info', `First token after ${firstTokenMs} ms`);
      }
      text += delta;
      tokenEvents++;
      ctx.emit({ type: 'token', text: delta });
      if (input.stopAfterTokens > 0 && tokenEvents >= input.stopAfterTokens) {
        stoppedEarly = true;
        ctx.log('warn', `Token budget of ${input.stopAfterTokens} reached; stopping the stream.`);
        local.abort();
        break;
      }
    }
    // An aborted stream ends quietly: report cancellation/timeout instead of a partial success.
    ctx.throwIfAborted();

    const totalMs = Date.now() - started;
    const finishReason = stoppedEarly ? 'budget' : ((await stream.finishReason) ?? null);
    const usage = stoppedEarly ? undefined : usageOf(await stream.usage);
    ctx.emit({
      type: 'workflow-step',
      stepId: 'stream',
      status: 'success',
      durationMs: totalMs,
      output: { tokenEvents, stoppedEarly },
    });
    ctx.setResultExtras({
      effective: {
        mode: ctx.mode,
        modelId: input.modelId,
        simulated: resolved.simulated,
        stopAfterTokens: input.stopAfterTokens,
      },
      ...(usage ? { usage } : {}),
      annotations: { firstTokenMs, tokenEvents },
    });
    return { text, tokenEvents, firstTokenMs, totalMs, finishReason, stoppedEarly, chunkTypes, ...(usage ? { usage } : {}) };
  },

  validate(out, input, { events }) {
    const tokens = events.filter((e) => e.type === 'token');
    const streamed = tokens.map((e) => (e.type === 'token' ? e.text : '')).join('');
    const lastTokenSeq = tokens.at(-1)?.seq ?? -1;
    const resultSeqBound = events.length; // the result event is appended after these
    const budgetOk = input.stopAfterTokens === 0 || (out.stoppedEarly && out.tokenEvents === input.stopAfterTokens);
    return summarizeChecks([
      {
        id: 'tokens-streamed',
        label: 'The answer arrived as several token events',
        passed: out.tokenEvents >= 2,
        message: `${out.tokenEvents} token events`,
      },
      {
        id: 'first-token-early',
        label: 'The first token arrived before the stream completed',
        passed: out.firstTokenMs !== null && out.firstTokenMs <= out.totalMs && lastTokenSeq < resultSeqBound,
        message: out.firstTokenMs !== null ? `first token ${out.firstTokenMs} ms · total ${out.totalMs} ms` : undefined,
      },
      { id: 'text-equals-tokens', label: 'Joining the token events reproduces the final text', passed: streamed === out.text },
      {
        id: 'clean-finish',
        label: input.stopAfterTokens > 0 ? 'The stream stopped at the token budget' : 'The stream finished normally',
        passed: input.stopAfterTokens > 0 ? budgetOk : out.finishReason === 'stop',
        message: `finishReason: ${out.finishReason}`,
      },
    ]);
  },
};
