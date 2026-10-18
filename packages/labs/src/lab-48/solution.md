# Solution: probe capabilities, then use resources and prompts with fallbacks

```ts
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { MCPClient } from '@mastra/mcp';

const url = 'http://127.0.0.1:4111/mcp';

// 1. Protocol layer: what does the server advertise?
const probe = new Client({ name: 'probe', version: '1.0.0' }, { versionNegotiation: { mode: 'auto' } });
await probe.connect(new StreamableHTTPClientTransport(new URL(url)));
const caps = probe.getServerCapabilities() ?? {};
await probe.close();

// 2. Adapter layer: Mastra's MCPClient
const mcp = new MCPClient({ servers: { course: { url: new URL(url), allowedHosts: ['127.0.0.1:4111'] } } });
try {
  if (caps.resources) {
    const { contents } = await mcp.resources.read('course', 'course://syllabus');
    console.log('from the server:', contents[0]?.text);
  } else {
    // resources.list() would return [] here: an empty list is not proof of support
    const tools = await mcp.listTools();
    console.log('fallback (course_info tool):', await tools.course_course_info.execute!({}, {}));
  }

  if (caps.prompts) {
    const { messages } = await mcp.prompts.get({ serverName: 'course', name: 'explain-lab', args: { number: '23' } });
    console.log(messages);
  } else {
    console.log('local fallback, not from the server:', 'Explain lab 23 to a beginner…');
  }
} finally {
  await mcp.disconnect();
}
```

**Not exposed by `MCPClient`:** completions (`probe.complete()` exists in the SDK), roots and sampling. A Mastra `MCPServer` only reads URIs that `listResources` returns.
