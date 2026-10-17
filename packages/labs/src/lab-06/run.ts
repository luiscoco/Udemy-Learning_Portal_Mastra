import { z } from 'zod';
import { Agent } from '@mastra/core/agent';
import { summarizeChecks, type LabDefinition } from '@mlp/contracts';
import type { LabImplementation } from '@mlp/lab-engine';
import { DEFAULT_LIVE_MODELS } from '@mlp/mastra-runtime';
import type { LabServices } from '../services.js';
import { usageOf, withLabLogger } from '../shared/agent-kit.js';
import { simulatedAnswer } from '../shared/simulated.js';
import { lab06Definition } from './definition.js';

export const INSTRUCTIONS = 'You are a helpful, concise assistant. Answer in plain language.';

export const Lab06InputSchema = z.object({
  prompt: z.string().trim().min(1, 'The prompt must not be empty').max(2000, 'Keep the prompt under 2000 characters'),
  modelId: z.enum(DEFAULT_LIVE_MODELS),
  failureMode: z.enum(['none', 'provider-error', 'empty-response']).default('none'),
  fallbackText: z.string().trim().min(1).max(300),
});
export type Lab06Input = z.infer<typeof Lab06InputSchema>;

export interface Lab06Output {
  text: string;
  usedFallback: boolean;
  fallbackReason: 'provider-error' | 'empty-response' | null;
  metadata: {
    requestId: string;
    correlationId: string;
    mastraRunId: string | null;
    modelId: string;
    simulated: boolean;
    finishReason: string | null;
    responseId: string | null;
    durationMs: number;
    promptChars: number;
  };
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
}

export const lab06: LabImplementation<Lab06Input, Lab06Output, LabServices> = {
  definition: lab06Definition as LabDefinition,
  inputSchema: Lab06InputSchema,

  async run(ctx, input) {
    const injected = ctx.mode === 'offline' ? input.failureMode : 'none';
    if (ctx.mode === 'live' && input.failureMode !== 'none') {
      ctx.log('warn', 'Fault injection only works offline; running a normal live request.');
    }
    const resolved = ctx.services.models.resolve({
      mode: ctx.mode,
      modelId: input.modelId,
      offline: (view) =>
        injected === 'provider-error'
          ? {
              error: Object.assign(new Error('Simulated upstream 503 Service Unavailable (offline fault injection)'), {
                statusCode: 503,
              }),
            }
          : injected === 'empty-response'
            ? { text: '' }
            : { text: simulatedAnswer({ modelId: input.modelId, system: view.system, user: view.lastUser }) },
    });
    const agent = withLabLogger(
      ctx,
      new Agent({ id: 'text-agent', name: 'Text Agent', instructions: INSTRUCTIONS, model: resolved.model }),
    );

    ctx.emit({
      type: 'workflow-step',
      stepId: 'validate-prompt',
      status: 'success',
      output: { promptChars: input.prompt.length },
    });
    ctx.emit({ type: 'workflow-step', stepId: 'generate', status: 'running', input: { modelId: input.modelId } });
    const started = Date.now();
    let text = '';
    let fallbackReason: Lab06Output['fallbackReason'] = null;
    let finishReason: string | null = null;
    let responseId: string | null = null;
    let mastraRunId: string | null = null;
    let usage: Lab06Output['usage'];
    try {
      const res = await agent.generate(input.prompt, { abortSignal: ctx.signal });
      text = res.text;
      finishReason = res.finishReason ?? null;
      responseId = res.response?.id ?? null;
      mastraRunId = res.runId ?? null;
      usage = usageOf(res.usage);
      if (!text.trim()) {
        fallbackReason = 'empty-response';
        ctx.log('warn', 'The model returned an empty answer; showing the fallback message.');
      }
    } catch (err) {
      ctx.throwIfAborted(); // cancellation and timeouts are not "fallback" cases
      fallbackReason = 'provider-error';
      // Log a generic, secret-free description; the raw provider error never reaches the learner.
      const status = (err as { statusCode?: number }).statusCode;
      ctx.log('warn', `The model call failed${status ? ` (HTTP ${status})` : ''}; showing the fallback message.`);
    }
    const durationMs = Date.now() - started;
    ctx.emit({
      type: 'workflow-step',
      stepId: 'generate',
      status: fallbackReason === 'provider-error' ? 'failed' : 'success',
      durationMs,
    });
    if (fallbackReason) {
      ctx.emit({ type: 'workflow-step', stepId: 'fallback', status: 'success', output: { reason: fallbackReason } });
      text = input.fallbackText;
    }

    const metadata = {
      requestId: ctx.requestId,
      correlationId: ctx.correlationId,
      mastraRunId,
      modelId: input.modelId,
      simulated: resolved.simulated,
      finishReason,
      responseId,
      durationMs,
      promptChars: input.prompt.length,
    };
    ctx.setResultExtras({
      effective: { mode: ctx.mode, modelId: input.modelId, simulated: resolved.simulated },
      ...(usage ? { usage } : {}),
    });
    return { text, usedFallback: fallbackReason !== null, fallbackReason, metadata, ...(usage ? { usage } : {}) };
  },

  validate(out, input, { mode }) {
    const expectFallback = mode === 'offline' && input.failureMode !== 'none';
    return summarizeChecks([
      { id: 'response-displayed', label: 'A non-empty answer is shown to the learner', passed: out.text.trim().length > 0 },
      {
        id: 'metadata-recorded',
        label: 'Request metadata recorded (request id, correlation id, model, duration)',
        passed: Boolean(
          out.metadata.requestId && out.metadata.correlationId && out.metadata.modelId && out.metadata.durationMs >= 0,
        ),
        message: `request ${out.metadata.requestId.slice(0, 8)}… · ${out.metadata.modelId} · ${out.metadata.durationMs} ms`,
      },
      {
        id: 'fallback-correct',
        label: expectFallback ? 'The safe fallback replaced the failed answer' : 'No fallback was needed',
        passed: out.usedFallback === expectFallback,
        message: out.fallbackReason ? `fallback reason: ${out.fallbackReason}` : undefined,
      },
      {
        id: 'no-raw-error',
        label: 'Raw provider errors are never shown to the learner',
        passed: !/503|Service Unavailable|stack|Error:/i.test(out.text),
      },
    ]);
  },
};
