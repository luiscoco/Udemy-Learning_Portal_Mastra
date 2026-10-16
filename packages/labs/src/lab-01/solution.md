# Solution — compare with `npm create mastra@latest` and add a second agent

**Shared root files:** `package.json` (with `"type": "module"` and `mastra dev/build/start` scripts), `tsconfig.json`, `.env.example`, `.gitignore`, and `src/mastra/index.ts` exporting `mastra`.

**Typical differences:** the official starter can also add example tools, workflows, scorers, memory/storage (`@mastra/libsql`) and observability config, depending on the options you pick.

**Second agent** — `src/mastra/agents/reviewer-agent.ts`:

```ts
import { Agent } from '@mastra/core/agent';

export const reviewerAgent = new Agent({
  id: 'reviewer-agent',
  name: 'Reviewer',
  instructions: 'You review answers for accuracy and tone.',
  model: 'openai/gpt-5-mini',
});
```

Register it in `src/mastra/index.ts`:

```ts
import { reviewerAgent } from './agents/reviewer-agent';

export const mastra = new Mastra({
  agents: { assistantAgent, reviewerAgent },
});
```

Then `npx tsc --noEmit` should print nothing (0 errors).
