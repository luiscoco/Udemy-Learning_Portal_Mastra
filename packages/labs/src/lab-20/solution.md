# Solution: preflight rejection and typed normalization

```ts
import { RegexFilterProcessor, UnicodeNormalizer, type Processor } from '@mastra/core/processors';

const policy: Processor<'support-policy'> = {
  id: 'support-policy',
  processInput: ({ messages, abort }) => {
    const text = JSON.stringify(messages);
    if (/ignore (all )?previous instructions/i.test(text))
      abort('The request tries to override the assistant’s instructions.', { metadata: { category: 'prompt-injection' } });
    return messages;
  },
};

export const triageAgent = new Agent({
  id: 'triage',
  name: 'Triage',
  instructions: '…',
  model: 'openai/gpt-5-mini',
  inputProcessors: [
    new UnicodeNormalizer({ stripControlChars: true, collapseWhitespace: true, trim: true }),
    policy,
    new RegexFilterProcessor({ presets: ['secrets'], rules: [{ name: 'openai-key', pattern: /sk-(?:proj-)?[A-Za-z0-9_-]{20,}/ }], strategy: 'block' }),
  ],
  outputProcessors: [new RegexFilterProcessor({ presets: ['pii'], strategy: 'redact' })],
});
```

In the API handler:

```ts
const res = await triageAgent.generate(body.text, { structuredOutput: { schema: RawTriageSchema } });
if (res.tripwire) {
  return reply.status(422).json({ error: { code: 'REJECTED', reason: res.tripwire.reason } });
}
const { value } = normalizeTriage(res.object!); // strict TriageSchema.parse inside
return reply.json(value);
```

**Challenge:** add `new PromptInjectionDetector({ model, threshold: 0.8, strategy: 'block' })` after the cheap processors, in live mode only. It makes one extra model call per request that passed the heuristics, so its cost is bounded by the number of accepted requests. To test it offline, give it a scripted model that returns the detector's JSON verdict. Assert the heuristic rejections still show `modelCalls: 0`.
