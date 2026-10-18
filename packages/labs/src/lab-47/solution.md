# Solution: discover MCP tools and call one safely

```ts
import { MCPClient } from '@mastra/mcp';

const mcp = new MCPClient({ servers: { course: { url: new URL('http://127.0.0.1:4111/mcp'), allowedHosts: ['127.0.0.1:4111'] } } });
const ALLOW = new Set(['course_info', 'lab_title', 'search_labs']);

try {
  const { definitions, errorDetails } = await mcp.listToolDefinitionsWithErrors();
  if (errorDetails.course) throw new Error('discovery failed');
  const tools = definitions.course ?? {};
  for (const [name, d] of Object.entries(tools)) {
    const required = new Set(d.inputSchema.required ?? []);
    const params = Object.entries(d.inputSchema.properties ?? {}).map(([p, s]: [string, any]) => `${p}${required.has(p) ? '*' : ''}: ${s.type}`);
    console.log(name, d.annotations, params.join(', '));
  }

  const name = 'search_labs';
  const def = tools[name];
  if (!def) throw new Error(`unknown tool ${name}`); // never guess
  if (!ALLOW.has(name) || def.annotations?.readOnlyHint !== true) throw new Error(`${name} is not permitted`);
  const tool = await mcp.toolFromDefinition({ serverName: 'course', definition: def });
  const result = await tool.execute!({ query: 'mcp' }, {});
  if (result?.error) console.warn('invalid arguments', result.validationErrors); // validated on the client, never sent
  else console.log(result);
} finally {
  await mcp.disconnect();
}
```

**Challenge:** a per-tool argument rule (`lab_title` only for labs 1–50), checked before the call, with a test that the server counter stays at 0.
