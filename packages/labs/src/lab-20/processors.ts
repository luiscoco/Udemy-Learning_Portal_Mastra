import { RegexFilterProcessor, UnicodeNormalizer, type InputProcessor } from '@mastra/core/processors';

export type RejectionCategory = 'too-long' | 'blocked-topic' | 'prompt-injection' | 'secret';

/** Raw provider keys. Mastra's `secrets` preset covers `api-key: …`, Bearer tokens and AWS keys, not these. */
export const SECRET_RULES = [
  { name: 'anthropic-key', pattern: /sk-ant-[A-Za-z0-9_-]{20,}/ },
  { name: 'openai-key', pattern: /sk-(?:proj-)?[A-Za-z0-9_-]{20,}/ },
  { name: 'google-key', pattern: /AIza[0-9A-Za-z_-]{30,}/ },
];

/** Masks secrets in text we keep for display (previews, logs), using the same rules as the filter. */
export function maskSecrets(text: string): string {
  return SECRET_RULES.reduce((t, r) => t.replace(new RegExp(r.pattern.source, 'g'), `[${r.name.toUpperCase()}]`), text);
}

const BLOCKED_TOPICS: { name: string; pattern: RegExp }[] = [
  { name: 'hacking', pattern: /\b(hack|hacking|crack|break into)\b.*\b(wifi|wi-fi|account|password|server|bank)\b/i },
  { name: 'weapons', pattern: /\b(build|make)\b.*\b(bomb|explosive|weapon)\b/i },
];

const INJECTION_PATTERNS: RegExp[] = [
  /\bignore (all |any )?(previous|prior|above) (instructions|rules)\b/i,
  /\b(print|reveal|show|repeat) (me )?(your|the) (system prompt|instructions)\b/i,
  /\byou are now\b.*\b(admin|developer|dan|unrestricted)\b/i,
];

const textOf = (messages: unknown) =>
  (messages as { content?: { parts?: { type?: string; text?: string }[] } }[])
    .flatMap((m) => m.content?.parts ?? [])
    .filter((p) => p.type === 'text')
    .map((p) => p.text ?? '')
    .join('\n');

/**
 * Deterministic preflight policy. Calls abort() with a category so the caller can explain the rejection.
 * Heuristics only: production systems add an LLM-based detector (Mastra's ModerationProcessor and
 * PromptInjectionDetector) behind these cheap checks.
 */
export function supportPolicy(maxChars: number): InputProcessor {
  return {
    id: 'support-policy',
    processInput: ({ messages, abort }) => {
      const text = textOf(messages);
      const reject = (category: RejectionCategory, reason: string): never =>
        abort(reason, { metadata: { processorId: 'support-policy', category } });
      if (text.length > maxChars) reject('too-long', `The request has ${text.length} characters; the limit is ${maxChars}.`);
      const topic = BLOCKED_TOPICS.find((t) => t.pattern.test(text));
      if (topic) reject('blocked-topic', `Requests about ${topic.name} are not supported by this assistant.`);
      if (INJECTION_PATTERNS.some((p) => p.test(text)))
        reject('prompt-injection', 'The request tries to override the assistant’s instructions.');
      return messages;
    },
  };
}

/** Records the exact text that passed every input check, i.e. what the model will receive. */
export function auditProcessor(seen: string[]): InputProcessor {
  return {
    id: 'audit',
    processInput: ({ messages }) => {
      seen.push(textOf(messages));
      return messages;
    },
  };
}

/** The pipeline, in order: normalize → policy → secrets → audit (input); PII redaction (output). */
export function buildPipeline(opts: { maxChars: number; redactPii: boolean; seen: string[] }) {
  return {
    inputProcessors: [
      new UnicodeNormalizer({ stripControlChars: true, collapseWhitespace: true, trim: true }),
      supportPolicy(opts.maxChars),
      new RegexFilterProcessor({ presets: ['secrets'], rules: SECRET_RULES, strategy: 'block' }),
      auditProcessor(opts.seen),
    ],
    outputProcessors: opts.redactPii ? [new RegexFilterProcessor({ presets: ['pii'], strategy: 'redact' })] : [],
  };
}
