# Solution — `toTicket(message)`

```ts
import { z } from 'zod';
import { mastra } from './mastra';

const Ticket = z.object({
  title: z.string().min(3).max(80),
  priority: z.enum(['low', 'medium', 'high']),
  category: z.enum(['account', 'billing', 'technical', 'general']),
  customerEmail: z.email().nullable(),
  dueInHours: z.number().int().min(1).max(72).describe('How soon support should reply'),
});

type Result = { ok: true; ticket: z.infer<typeof Ticket> } | { ok: false; issues: string[] };

export async function toTicket(message: string): Promise<Result> {
  const agent = mastra.getAgentById('assistant-agent');
  try {
    const res = await agent.generate(message, { structuredOutput: { schema: Ticket, errorStrategy: 'strict' } });
    const parsed = Ticket.safeParse(res.object); // defence in depth
    return parsed.success ? { ok: true, ticket: parsed.data } : { ok: false, issues: parsed.error.issues.map((i) => i.message) };
  } catch (err) {
    return { ok: false, issues: [err instanceof Error ? err.message.split('\n')[0]! : 'Invalid structured output'] };
  }
}
```

**Strategy choice:** for an API that creates tickets automatically, `fallback` (a "needs triage" ticket) keeps the flow working; for a form that shows the extracted fields to a human, `strict` with a clear error is better so nobody trusts a guess.
