import { z } from 'zod';
import { CitedAnswerSchema } from './cited-answer.js';

/** One turn of the agent workspace (L70) at output.workspace. */
export const WorkspaceTurnSchema = z.object({
  threadId: z.string().max(60),
  documents: z
    .array(
      z.object({
        docId: z.string().max(80),
        name: z.string().max(200),
        chars: z.number().int().nonnegative(),
        sample: z.boolean(),
        /** The start of the document text, for the preview dialog. */
        preview: z.string().max(4_000),
      }),
    )
    .max(100),
  messages: z
    .array(
      z.object({
        id: z.string().max(100),
        role: z.enum(['user', 'assistant']),
        text: z.string().max(20_000),
        createdAt: z.string().max(40),
      }),
    )
    .max(500),
  citedAnswer: CitedAnswerSchema.optional(),
  tasks: z
    .array(z.object({ n: z.number().int().min(1), title: z.string().max(200), status: z.enum(['waiting', 'running', 'done']) }))
    .max(20),
  seeded: z.object({ added: z.number().int().nonnegative(), existing: z.number().int().nonnegative() }).optional(),
});
export type WorkspaceTurn = z.infer<typeof WorkspaceTurnSchema>;
