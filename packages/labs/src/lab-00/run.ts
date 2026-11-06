import { withLiveCheckpoint } from '../shared/live-checkpoint.js';
import { z } from 'zod';
import { summarizeChecks, type LabDefinition } from '@mlp/contracts';
import { LabError, sleep, type LabImplementation } from '@mlp/lab-engine';
import { lab00Definition } from './definition.js';

export const Lab00InputSchema = z.object({
  message: z.string().trim().min(1, 'Message must not be empty').max(200),
  delayMs: z.number().int().min(0).max(1000).default(150),
  simulateFailure: z.boolean().default(false),
});
export type Lab00Input = z.infer<typeof Lab00InputSchema>;

export const Lab00OutputSchema = z.object({
  echo: z.string(),
  wordCount: z.number().int().nonnegative(),
  characterCount: z.number().int().nonnegative(),
  reversed: z.string(),
});
export type Lab00Output = z.infer<typeof Lab00OutputSchema>;

/** The pretend "tool": pure and deterministic. */
export function countWords(text: string): { words: number; characters: number } {
  const words = text.split(/\s+/).filter(Boolean).length;
  return { words, characters: text.length };
}

const baseLab00: LabImplementation<Lab00Input, Lab00Output> = {
  definition: lab00Definition as LabDefinition,
  inputSchema: Lab00InputSchema,
  outputSchema: Lab00OutputSchema,

  async run(ctx, input) {
    ctx.log('info', 'Dummy Lab 00 started (offline, no model calls)', { delayMs: input.delayMs });

    // Step 1: analyze the message with a deterministic "tool".
    ctx.emit({ type: 'workflow-step', stepId: 'analyze', status: 'running', input: { message: input.message } });
    const started = Date.now();
    ctx.emit({ type: 'tool-start', toolCallId: 'call-1', toolName: 'wordCounter', args: { text: input.message } });
    const counts = countWords(input.message);
    await sleep(Math.min(input.delayMs, 200), ctx.signal);
    ctx.emit({
      type: 'tool-finish',
      toolCallId: 'call-1',
      toolName: 'wordCounter',
      status: 'success',
      result: counts,
      durationMs: Date.now() - started,
    });
    ctx.emit({ type: 'workflow-step', stepId: 'analyze', status: 'success', output: counts });

    if (input.simulateFailure) {
      ctx.log('warn', 'Fault injection enabled: simulating an upstream provider failure');
      throw new LabError('PROVIDER_ERROR', 'Simulated provider failure (fault injection). Safe to retry.', { retryable: true });
    }

    // Step 2: stream the echo one word at a time, honouring cancellation.
    ctx.emit({ type: 'workflow-step', stepId: 'respond', status: 'running' });
    const echo = `Echo: ${input.message}`;
    const words = echo.split(/\s+/).filter(Boolean);
    for (const [i, word] of words.entries()) {
      ctx.throwIfAborted();
      ctx.emit({ type: 'token', text: i === 0 ? word : ` ${word}` });
      await sleep(input.delayMs, ctx.signal);
    }
    ctx.emit({ type: 'workflow-step', stepId: 'respond', status: 'success' });

    ctx.setResultExtras({ effective: { mode: ctx.mode, model: 'none (deterministic)' }, annotations: { budgetToolCalls: 1 } });
    return {
      echo,
      wordCount: counts.words,
      characterCount: counts.characters,
      reversed: [...input.message].reverse().join(''),
    };
  },

  validate(output, input, { events }) {
    const expectedEcho = `Echo: ${input.message}`;
    const tokens = events.filter((e) => e.type === 'token');
    const toolFinish = events.find((e) => e.type === 'tool-finish' && e.toolName === 'wordCounter');
    const stepsOk = ['analyze', 'respond'].every((id) =>
      events.some((e) => e.type === 'workflow-step' && e.stepId === id && e.status === 'success'),
    );
    const expectedWords = countWords(input.message).words;
    return summarizeChecks([
      {
        id: 'echo-matches',
        label: 'Echo equals "Echo: " + your message',
        passed: output.echo === expectedEcho,
      },
      {
        id: 'word-count',
        label: 'wordCounter tool counted the words correctly',
        passed:
          output.wordCount === expectedWords &&
          toolFinish?.type === 'tool-finish' &&
          (toolFinish.result as { words?: number } | undefined)?.words === expectedWords,
        message: `Expected ${expectedWords} words`,
      },
      {
        id: 'tokens-streamed',
        label: 'One token event was streamed per echo word',
        passed: tokens.length === expectedEcho.split(/\s+/).filter(Boolean).length,
        message: `${tokens.length} token events`,
      },
      { id: 'steps-completed', label: 'Both workflow steps finished with success', passed: stepsOk },
    ]);
  },
};

export const lab00 = withLiveCheckpoint(baseLab00);
