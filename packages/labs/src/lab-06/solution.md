# Solution — `answer(prompt)` with validation, metadata and fallback

```ts
import { mastra } from './mastra';

const FALLBACK = "Sorry, I couldn't answer right now. Please try again in a moment.";

export async function answer(rawPrompt: string, signal?: AbortSignal) {
  const prompt = rawPrompt.trim();
  if (!prompt) throw new Error('Prompt must not be empty'); // map to HTTP 422 in your API

  const agent = mastra.getAgentById('assistant-agent');
  const started = Date.now();
  try {
    const res = await agent.generate(prompt, { abortSignal: signal });
    console.info('answer', {
      model: res.response?.modelId,
      finishReason: res.finishReason,
      usage: res.usage,
      durationMs: Date.now() - started,
    });
    return res.text.trim() ? res.text : FALLBACK;
  } catch (err) {
    if (signal?.aborted) throw err; // cancellation is not a failure to hide
    console.warn('model call failed', { status: (err as { statusCode?: number }).statusCode, durationMs: Date.now() - started });
    return FALLBACK;
  }
}
```

**Challenge answer:** a cancelled request is the user's own decision, so the UI should show "cancelled", not pretend an answer was attempted. Re-throwing when `signal.aborted` keeps the two cases apart.
