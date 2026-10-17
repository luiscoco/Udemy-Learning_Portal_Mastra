import { z } from 'zod';
import type { LabDefinitionInput } from '@mlp/contracts';
import { LabError } from './errors.js';
import type { LabImplementation } from './types.js';
import { sleep } from './util.js';

/** A minimal, schema-valid lab definition for engine and API tests. */
export function makeTestDefinition(overrides: Partial<LabDefinitionInput> = {}): LabDefinitionInput {
  return {
    id: 'lab-99',
    number: 99,
    title: 'Test Lab',
    moduleId: 'module-00',
    summary: 'Engine test lab.',
    concept: 'One. Two. Three. Four. Five.',
    objectives: ['a', 'b', 'c'],
    prerequisites: [],
    inputs: [{ kind: 'text', name: 'text', label: 'Text', maxLength: 100 }],
    exampleInput: { text: 'hello' },
    expectedOutput: { description: 'Echo', example: { echo: 'hello' } },
    guide: {
      procedure: ['Run it', 'Read it'],
      prediction: 'What happens?',
      hints: [
        { level: 1, text: 'h1' },
        { level: 2, text: 'h2' },
        { level: 3, text: 'h3' },
      ],
      commonMistakes: [{ mistake: 'm', fix: 'f' }],
      challenge: { prompt: 'c', successCriteria: ['s'] },
    },
    quiz: [
      { id: 'q1', prompt: 'p', choices: ['a', 'b'], correctIndex: 0, explanation: 'e' },
      { id: 'q2', prompt: 'p', choices: ['a', 'b'], correctIndex: 1, explanation: 'e' },
      { id: 'q3', prompt: 'p', choices: ['a', 'b'], correctIndex: 0, explanation: 'e' },
    ],
    sourceFiles: [{ path: 'run.ts', title: 'Run' }],
    exercise: { instructions: 'Do it' },
    checks: [{ id: 'echo', label: 'Echo matches' }],
    instructorOutline: {
      durationMinutes: 4,
      segments: [
        { title: 'Intro', minutes: 1, talkingPoints: ['x'] },
        { title: 'Demo', minutes: 3, talkingPoints: ['y'] },
      ],
    },
    execution: {
      modes: ['offline'],
      defaultTimeoutMs: 2_000,
      maxTimeoutMs: 5_000,
      budget: {},
      costNotice: 'Free',
    },
    ...overrides,
  };
}

export const TestInputSchema = z.object({
  text: z.string().min(1).max(100),
  delayMs: z.number().int().min(0).max(10_000).default(0),
  behavior: z.enum(['ok', 'lab-error', 'crash', 'ignore-abort', 'leak-secret', 'flood', 'approval']).default('ok'),
  secret: z.string().optional(),
});
export type TestInput = z.infer<typeof TestInputSchema>;

/** A configurable lab used to exercise every engine path. */
export function makeTestLab(defOverrides: Partial<LabDefinitionInput> = {}): LabImplementation<TestInput, { echo: string }> {
  return {
    // Registry parses and applies defaults.
    definition: makeTestDefinition(defOverrides) as LabImplementation['definition'],
    inputSchema: TestInputSchema,
    async run(ctx, input) {
      ctx.log('info', 'starting');
      ctx.emit({ type: 'token', text: input.text });
      switch (input.behavior) {
        case 'lab-error':
          throw new LabError('PROVIDER_ERROR', 'Simulated provider failure', { retryable: true });
        case 'crash':
          throw new Error('kaboom internal detail');
        case 'leak-secret':
          throw new LabError('PROVIDER_ERROR', `Auth failed for key ${input.secret}`);
        case 'ignore-abort':
          await new Promise((r) => setTimeout(r, input.delayMs)); // deliberately ignores ctx.signal
          break;
        case 'approval': {
          const outcome = await ctx.requestApproval({
            toolName: 'echo',
            args: { text: input.text },
            message: `Echo "${input.text}"?`,
          });
          await sleep(input.delayMs, ctx.signal);
          return { echo: outcome.decision === 'approve' ? input.text : `declined (${outcome.by})` };
        }
        case 'flood':
          for (let i = 0; i < 50; i++) ctx.emit({ type: 'token', text: String(i) });
          break;
        default:
          await sleep(input.delayMs, ctx.signal);
      }
      return { echo: input.text };
    },
    validate(output, input) {
      const passed = output.echo === input.text;
      return { passed, checks: [{ id: 'echo', label: 'Echo matches', passed }] };
    },
  };
}
