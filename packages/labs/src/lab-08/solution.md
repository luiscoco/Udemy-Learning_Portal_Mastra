# Solution — an SSE streaming route

```ts
import express from 'express';
import { mastra } from './mastra';

const app = express();

app.get('/chat/stream', async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  if (!q) return res.status(422).json({ error: 'q is required' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.flushHeaders();

  const controller = new AbortController();
  res.on('close', () => controller.abort()); // tab closed → stop the model call

  const agent = mastra.getAgentById('assistant-agent');
  const stream = await agent.stream(q, { abortSignal: controller.signal });
  for await (const chunk of stream.fullStream) {
    if (chunk.type === 'text-delta') {
      res.write(`event: token\ndata: ${JSON.stringify(chunk.payload.text)}\n\n`);
    }
  }
  if (!controller.signal.aborted) res.write('event: done\ndata: {}\n\n');
  res.end();
});

app.listen(3000);
```

Test: `curl -N "http://localhost:3000/chat/stream?q=hello"`.

**Challenge:** keep `last` (timestamp of the previous delta), a running `sum` of gaps and a `count`; the average is `sum / count` — offline it is close to the configured delay.
