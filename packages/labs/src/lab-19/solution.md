# Solution: capability-aware execution options

```ts
import { getModelReasoningOptions, modelSupportsTemperature } from '@mastra/core/llm';

export function resolveOptions(modelId: string, req: { temperature?: number; effort?: string; maxSteps: number }) {
  const omitted: string[] = [];
  const modelSettings: Record<string, unknown> = { maxOutputTokens: 600, timeout: { stepMs: 20_000 } };
  if (req.temperature !== undefined) {
    if (modelSupportsTemperature(modelId) === true) modelSettings.temperature = req.temperature;
    else omitted.push('temperature');
  }
  const effort = (getModelReasoningOptions(modelId) ?? []).find((o) => o.type === 'effort') as { values: string[] } | undefined;
  const providerOptions = req.effort && effort?.values.includes(req.effort) ? { openai: { reasoningEffort: req.effort } } : undefined;
  return { maxSteps: req.maxSteps, modelSettings, providerOptions, omitted };
}

const options = resolveOptions('openai/gpt-5-mini', { temperature: 0.7, effort: 'low', maxSteps: 4 });
logger.info('effective options', options);
const res = await agent.generate(prompt, options);
if (res.finishReason !== 'stop') logger.warn('limit reached', { finishReason: res.finishReason });
```

Test:

```ts
it('never sends temperature to gpt-5-mini', () => {
  expect(resolveOptions('openai/gpt-5-mini', { temperature: 0.7, maxSteps: 4 })).toMatchObject({ omitted: ['temperature'] });
  expect(resolveOptions('openai/gpt-5-mini', { temperature: 0.7, maxSteps: 4 }).modelSettings).not.toHaveProperty('temperature');
});
```

**Challenge:** for `anthropic/claude-haiku-4-5`, `getModelReasoningOptions` returns `{ type: 'budget_tokens', min: 1024 }`. Expose it as `providerOptions: { anthropic: { thinking: { type: 'enabled', budgetTokens } } }`. Keep `maxOutputTokens` greater than `budgetTokens`. Record the pair as one decision in the effective options, together with any setting the provider rejects while thinking is on. Verify that against the provider docs for your version.
