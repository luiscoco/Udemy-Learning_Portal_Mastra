# Solution — a second agent and a lookup script

`src/mastra/agents/faq-agent.ts`:

```ts
import { Agent } from '@mastra/core/agent';

export const faqAgent = new Agent({
  id: 'faq-agent',
  name: 'FAQ Agent',
  instructions: 'You only answer questions about shipping. For anything else, say you can only help with shipping.',
  model: 'openai/gpt-5-mini',
});
```

`src/mastra/index.ts`:

```ts
import { Mastra } from '@mastra/core/mastra';
import { assistantAgent } from './agents/assistant-agent';
import { faqAgent } from './agents/faq-agent';

export const mastra = new Mastra({ agents: { assistantAgent, faqAgent } });
```

`src/ask.ts` (run with `npx tsx --env-file=.env src/ask.ts`):

```ts
import { mastra } from './mastra';

const agent = mastra.getAgentById('faq-agent');
const result = await agent.generate('How long does shipping to Canada take?');
console.log(result.text);
```
