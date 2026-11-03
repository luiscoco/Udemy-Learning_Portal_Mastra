import { z } from 'zod';

/** One voice-assistant turn (L69) at output.voice: what was heard, what was used, and how the reply came back. */
export const VoiceTurnSchema = z.object({
  source: z.enum(['audio', 'text', 'none']),
  transcript: z
    .object({ text: z.string().max(4_000), provider: z.string().max(40), audioSeconds: z.number().nonnegative().optional() })
    .optional(),
  typedText: z.string().max(1_000).optional(),
  /** The text the assistant actually answered; null when it had to ask for typed input. */
  usedText: z.string().max(4_000).nullable(),
  identifiers: z.array(z.object({ heard: z.string().max(100), normalized: z.string().max(40), confirmed: z.boolean() })).max(10),
  services: z.object({
    provider: z.enum(['offline', 'openai']),
    stt: z.enum(['used', 'unavailable', 'failed', 'not-needed']),
    tts: z.enum(['used', 'unavailable', 'failed', 'not-requested']),
    reason: z.string().max(300).optional(),
  }),
  fallback: z.object({ used: z.boolean(), reason: z.string().max(300).optional() }),
  answer: z.string().max(4_000).nullable(),
  needsText: z.boolean(),
  audio: z
    .object({
      mimeType: z.enum(['audio/mpeg', 'audio/wav']),
      base64: z.string().max(2_000_000),
      bytes: z.number().int().nonnegative(),
    })
    .optional(),
  usage: z.object({
    speechCharacters: z.number().int().nonnegative(),
    transcribedSeconds: z.number().nonnegative().optional(),
    modelTokens: z.number().int().nonnegative().optional(),
  }),
  notices: z.array(z.string().max(400)).max(10),
});
export type VoiceTurn = z.infer<typeof VoiceTurnSchema>;
