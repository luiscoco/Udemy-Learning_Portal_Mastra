# Solution — a safe external API tool

```ts
import { z } from 'zod';
import { createTool } from '@mastra/core/tools';

const ALLOWED = new Set(['api.open-meteo.com']);
const Response = z.object({ current: z.object({ temperature_2m: z.number(), wind_speed_10m: z.number() }) });

type Fetch = (url: URL, init: RequestInit) => Promise<Response>;

export function weatherTool(fetchImpl: Fetch = fetch) {
  return createTool({
    id: 'get-weather',
    description: 'Current weather for Madrid or Lisbon.',
    inputSchema: z.object({ city: z.enum(['Madrid', 'Lisbon']) }),
    execute: async ({ city }) => {
      const coords = city === 'Madrid' ? [40.42, -3.7] : [38.72, -9.14];
      const url = new URL(`https://api.open-meteo.com/v1/forecast?latitude=${coords[0]}&longitude=${coords[1]}&current=temperature_2m,wind_speed_10m`);
      if (!ALLOWED.has(url.host)) return { ok: false, code: 'NOT_ALLOWED' };
      try {
        const res = await fetchImpl(url, { signal: AbortSignal.timeout(3000), redirect: 'error' });
        if (res.status === 429) return { ok: false, code: 'RATE_LIMITED', retryAfter: res.headers.get('retry-after') };
        if (!res.ok) return { ok: false, code: 'UPSTREAM_ERROR', status: res.status };
        const parsed = Response.safeParse(await res.json().catch(() => null));
        if (!parsed.success) return { ok: false, code: 'BAD_RESPONSE' };
        return { ok: true, city, temperatureC: parsed.data.current.temperature_2m };
      } catch {
        return { ok: false, code: 'TIMEOUT_OR_NETWORK' };
      }
    },
  });
}
```

Test the 429 path with a fake fetch:

```ts
const tool = weatherTool(async () => new Response('{}', { status: 429, headers: { 'retry-after': '30' } }));
expect(await tool.execute!({ city: 'Madrid' }, {} as never)).toMatchObject({ ok: false, code: 'RATE_LIMITED' });
```

**Cache challenge:** keep a `Map<city, { at, value }>` inside the tool module (server memory), check it before the limiter, and expire entries older than 60 s; with the mock transport, assert the second call records no HTTP request.
