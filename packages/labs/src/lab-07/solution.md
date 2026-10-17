# Solution — `compareInstructions`

```ts
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { Agent } from '@mastra/core/agent';

type Variant = { label: string; instructions: string };

const MODEL = 'openai/gpt-5-mini';
const settings = { maxSteps: 1 };

const hash = (v: Variant) =>
  createHash('sha256').update(JSON.stringify({ ...v, model: MODEL, settings })).digest('hex').slice(0, 12);

export async function compareInstructions(prompt: string, variants: Variant[]) {
  const results = [];
  for (const v of variants) {
    // Same model and settings for every variant; only the instructions change.
    const agent = new Agent({ id: `variant-${results.length}`, name: v.label, instructions: v.instructions, model: MODEL });
    const res = await agent.generate(prompt, settings);
    results.push({ label: v.label, configHash: hash(v), text: res.text });
  }
  await writeFile(`comparison-${Date.now()}.json`, JSON.stringify({ prompt, model: MODEL, settings, results }, null, 2));
  return results;
}
```

**Challenge (variant C):** `You are a friendly support agent. Use bullet points.` — friendliness comes from "friendly", the format from "bullet points".
