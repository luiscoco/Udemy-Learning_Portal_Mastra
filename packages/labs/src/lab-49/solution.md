# Solution: a narrow MCP façade over Mastra tools

```ts
import http from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { MCPServer } from '@mastra/mcp';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { formatCurrencyTool } from './tools'; // read-only

const server = new MCPServer({ id: 'facade', name: 'Facade', version: '1.0.0', tools: { format_currency: formatCurrencyTool } });
const token = randomBytes(24).toString('base64url');
const ok = (h = '') => {
  const a = Buffer.from(h);
  const b = Buffer.from(`Bearer ${token}`);
  return a.length === b.length && timingSafeEqual(a, b);
};
http
  .createServer((req, res) => {
    if (!ok(req.headers.authorization)) return void res.writeHead(401).end();
    void server.startHTTP({ url: new URL(req.url!, 'http://127.0.0.1:4200'), httpPath: '/mcp', req, res });
  })
  .listen(4200, '127.0.0.1');

// Any MCP client, here the official SDK:
const client = new Client({ name: 'external', version: '1.0.0' }, { versionNegotiation: { mode: 'auto' } });
await client.connect(
  new StreamableHTTPClientTransport(new URL('http://127.0.0.1:4200/mcp'), { requestInit: { headers: { authorization: `Bearer ${token}` } } }),
);
console.log((await client.listTools()).tools.map((t) => t.name)); // ['format_currency']
console.log(await client.callTool({ name: 'format_currency', arguments: { amountCents: 1999, currency: 'EUR' } }));
await client.close();
```

**Rules:** publish only what outside clients need. Never register side-effect or personal-data tools; an unregistered tool answers "Unknown tool". In production, use OAuth (`MCPServer` OAuth middleware) and rate limits, not a shared token.
