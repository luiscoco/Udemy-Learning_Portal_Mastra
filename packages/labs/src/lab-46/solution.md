# Solution: connect an MCP server and handle failures

```ts
import { MCPClient } from '@mastra/mcp';

const mcp = new MCPClient({
  id: 'course-client',
  timeout: 1500,
  servers: {
    course: {
      url: new URL('http://127.0.0.1:4111/mcp'),
      allowedHosts: ['127.0.0.1:4111'], // the client contacts nothing else
      // protocolVersion: 'legacy',       // pin only for servers known not to have upgraded
    },
    // A stdio server instead (spawns a subprocess with a curated environment):
    // local: { command: 'node', args: ['server.js'], inheritDefaultEnv: false, env: {} },
  },
});

const RETRIABLE = new Set(['timeout', 'unreachable']);
try {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const { tools, errorDetails } = await mcp.listToolsWithErrors({ perServerTimeoutMs: 1500 });
    const err = errorDetails.course;
    if (!err) {
      console.log(mcp.getServerProtocolVersions().course, mcp.getServerInfo().course, Object.keys(tools));
      break;
    }
    const category = classify(err); // httpStatus 404 → not-found, "timed out" → timeout, …
    console.warn(category, err.message.split('\n')[0]); // never show the stack
    if (!RETRIABLE.has(category)) break;
    await new Promise((r) => setTimeout(r, 100 * attempt));
  }
} finally {
  await mcp.disconnect();
}
```

Serve a Mastra `MCPServer` for local testing with `server.startHTTP({ url, httpPath: '/mcp', req, res })` from a Node `http` server, as in `fixture-server.ts`.

**Challenge:** exponential backoff with jitter, capped by the run deadline. Non-retriable failures still make exactly one attempt.
