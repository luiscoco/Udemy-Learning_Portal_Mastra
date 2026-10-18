# Solution: a supervisor with a budget

```ts
import { Agent } from '@mastra/core/agent';

const supervisor = new Agent({
  id: 'supervisor',
  name: 'Supervisor',
  model: 'openai/gpt-5-mini',
  instructions: 'Delegate research, then planning, then analysis; then answer with three sections.',
  agents: { researcher, planner, analyst }, // tools agent-researcher, agent-planner, agent-analyst
});

const limits = { maxDelegations: 4, perWorker: 1, tokenBudget: 20_000 };
const used = { total: 0, perWorker: {} as Record<string, number>, tokens: 0, seen: new Set<string>() };
const audit: unknown[] = [];

const stream = await supervisor.stream(task, {
  maxSteps: 6, // the supervisor's iteration cap
  delegation: {
    hookErrorStrategy: 'throw', // a broken guard fails closed
    messageFilter: () => [], // workers see only their prompt
    onDelegationStart: ({ primitiveId: w, prompt, toolCallId }) => {
      const key = `${w}|${prompt.toLowerCase().replace(/\W+/g, ' ').trim()}`;
      const reason = used.seen.has(key) ? 'duplicate'
        : used.total >= limits.maxDelegations ? 'total-cap'
        : (used.perWorker[w] ?? 0) >= limits.perWorker ? 'per-worker-cap'
        : used.tokens >= limits.tokenBudget ? 'token-budget' : null;
      audit.push({ toolCallId, w, prompt, reason, budget: { ...used, seen: undefined } });
      if (reason) return { proceed: false, rejectionReason: reason };
      used.total++; used.perWorker[w] = (used.perWorker[w] ?? 0) + 1; used.seen.add(key); // reserve now
      return { modifiedMaxSteps: 3 };
    },
    onDelegationComplete: ({ result, toolCallId }) => {
      used.tokens += result.usage?.totalTokens ?? 0;
      audit.push({ toolCallId, tokens: result.usage?.totalTokens });
      return { resultText: `${result.text}\n[Budget left: ${limits.maxDelegations - used.total} delegations]` };
    },
  },
});
// If stream.text is empty after maxSteps, report the run as stopped with the partial results.
```
