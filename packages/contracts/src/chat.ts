import { z } from 'zod';

/** One message of a chat thread (L67). `stopped` = a partial reply kept after Stop; `failed` = no reply. */
export const ChatMessageSchema = z.object({
  id: z.string().max(100),
  role: z.enum(['user', 'assistant']),
  text: z.string().max(20_000),
  status: z.enum(['complete', 'stopped', 'failed']),
  createdAt: z.string().max(40),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

/** A chat lab's transcript at output.chat: the current thread, the learner's threads and the last turn. */
export const ChatTranscriptSchema = z.object({
  threadId: z.string().max(60),
  threads: z.array(z.object({ id: z.string().max(60), title: z.string().max(200), updatedAt: z.string().max(40) })).max(50),
  messages: z.array(ChatMessageSchema).max(500),
  turn: z
    .object({
      status: z.enum(['complete', 'failed']),
      retried: z.boolean(),
      tokens: z.number().int().nonnegative(),
      replyId: z.string().max(100).optional(),
    })
    .optional(),
});
export type ChatTranscript = z.infer<typeof ChatTranscriptSchema>;
