# Solution: request-scoped instructions

```ts
import { z } from 'zod';
import { Agent } from '@mastra/core/agent';
import { RequestContext } from '@mastra/core/request-context';

const ContextSchema = z.object({
  locale: z.enum(['en-US', 'es-ES']),
  tone: z.enum(['friendly', 'formal']),
});
type Ctx = z.infer<typeof ContextSchema>;

export const supportAgent = new Agent({
  id: 'support-agent',
  name: 'Support',
  model: 'openai/gpt-5-mini',
  requestContextSchema: ContextSchema, // rejected before any model call if invalid
  instructions: ({ requestContext }) => {
    const locale = requestContext.get('locale') as Ctx['locale'];
    const tone = requestContext.get('tone') as Ctx['tone'];
    return `Reply in ${locale}. Tone: ${tone}. Sign off as "— Support".`;
  },
});
```

Prove isolation with parallel calls:

```ts
it('keeps parallel requests independent', async () => {
  const ctx = (locale: string, tone: string) => new RequestContext([['locale', locale], ['tone', tone]]);
  const [en, es] = await Promise.all([
    supportAgent.generate('Where is my order?', { requestContext: ctx('en-US', 'friendly') }),
    supportAgent.generate('Where is my order?', { requestContext: ctx('es-ES', 'formal') }),
  ]);
  // With a scripted model that echoes its system prompt, assert each saw only its own settings.
  expect(en.text).toContain('en-US');
  expect(es.text).toContain('es-ES');
});
```

The anti-pattern to avoid:

```ts
let current: Ctx; // shared by every request
async function handle(settings: Ctx) {
  current = settings; // request B overwrites A here…
  return leakyAgent.generate('…'); // …before A's instructions are resolved
}
```

**Challenge:** add `channel: z.enum(['email', 'chat'])` to the schema and use it in the instructions function, for example `channel === 'chat' ? 'At most two sentences.' : ''`. Run an email and a chat context in `Promise.all` and assert each answer follows its own rule. An invalid channel fails with `AGENT_REQUEST_CONTEXT_VALIDATION_FAILED`.
