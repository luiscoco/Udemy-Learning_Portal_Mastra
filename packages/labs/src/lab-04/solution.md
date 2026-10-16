# Solution — model id from the environment, validated at startup

`src/mastra/agents/assistant-agent.ts`:

```ts
import { Agent } from '@mastra/core/agent';

const ALLOWED = ['openai/gpt-5-mini', 'openai/gpt-4o-mini', 'anthropic/claude-haiku-4-5', 'google/gemini-2.5-flash'] as const;
type AllowedModel = (typeof ALLOWED)[number];

function modelFromEnv(): AllowedModel {
  const id = process.env.AGENT_MODEL ?? 'openai/gpt-5-mini';
  if (!(ALLOWED as readonly string[]).includes(id)) {
    throw new Error(`AGENT_MODEL="${id}" is not an allowed model. Use one of: ${ALLOWED.join(', ')}`);
  }
  return id as AllowedModel;
}

export const assistantAgent = new Agent({
  id: 'assistant-agent',
  name: 'Assistant',
  instructions: 'You are a helpful assistant. Answer clearly and concisely.',
  model: modelFromEnv(),
});
```

Because the agent module runs when `src/mastra/index.ts` imports it, a wrong `AGENT_MODEL` stops `mastra dev` immediately with a clear message — instead of failing on the first user request.
