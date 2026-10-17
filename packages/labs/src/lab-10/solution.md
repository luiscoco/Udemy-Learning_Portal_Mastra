# Solution — a retry helper, and Mastra's built-in options

```ts
const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function withRetry<T>(fn: (signal: AbortSignal) => Promise<T>, { attempts = 3, baseMs = 250, budgetMs = 10_000 } = {}) {
  const started = Date.now();
  for (let n = 1; ; n++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5_000); // per-attempt timeout
    try {
      return await fn(ctrl.signal);
    } catch (err) {
      const e = err as { statusCode?: number; responseHeaders?: Record<string, string> };
      const retryable = ctrl.signal.aborted || RETRYABLE.has(e.statusCode ?? 0);
      const retryAfter = Number(e.responseHeaders?.['retry-after'] ?? 0) * 1000;
      const wait = Math.max(baseMs * 2 ** (n - 1), retryAfter);
      if (!retryable || n >= attempts || Date.now() - started + wait > budgetMs) throw err;
      await sleep(wait);
    } finally {
      clearTimeout(timer);
    }
  }
}

// usage (idempotent: just generating text)
const text = await withRetry((signal) => agent.generate('Summarise…', { abortSignal: signal }).then((r) => r.text));
```

**Built-in alternatives (native Mastra):**

```ts
new Agent({ id: 'a', name: 'A', instructions: '…', model: 'openai/gpt-5-mini', maxRetries: 2 });

new Agent({
  id: 'b',
  name: 'B',
  instructions: '…',
  model: [
    { model: 'openai/gpt-5-mini', maxRetries: 1 },   // primary
    { model: 'anthropic/claude-haiku-4-5' },          // used if the primary keeps failing
  ],
});
```

**Jitter challenge:** `wait = Math.random() * expDelay` spreads retries from many clients so they do not all hit the provider at the same moment. Pass a `random` function into the helper and use a seeded one in tests.
