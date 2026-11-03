# Solution: one agent, several MCP servers

```ts
import { Agent } from '@mastra/core/agent';
import { MCPClient } from '@mastra/mcp';

const mcp = new MCPClient({
  servers: {
    calc: { url: new URL('http://127.0.0.1:4301/mcp'), allowedHosts: ['127.0.0.1:4301'] },
    data: { url: new URL('http://127.0.0.1:4302/mcp'), allowedHosts: ['127.0.0.1:4302'] },
  },
});

try {
  // Per-server discovery: a server that is down is reported, not fatal.
  const { toolsets, errors } = await mcp.listToolsetsWithErrors({ perServerTimeoutMs: 5000 });
  for (const [server, message] of Object.entries(errors)) console.warn(`${server} unavailable:`, message.split('\n')[0]);

  // Namespace policy: server_tool keys, so calc.info and data.info cannot collide.
  const tools = Object.fromEntries(
    Object.entries(toolsets).flatMap(([server, ts]) => Object.entries(ts).map(([name, tool]) => [`${server}_${name}`, tool])),
  );

  const agent = new Agent({
    id: 'multi-server',
    name: 'Multi-server agent',
    instructions: 'Use calculator tools for arithmetic and data tools for labs. If a tool is missing, say what is unavailable.',
    model: 'openai/gpt-5-mini',
    tools,
  });
  console.log((await agent.generate('What is 18% of 240, and what is the title of lab 47?')).text);
} finally {
  await mcp.disconnect();
}
```

**Policies:** namespace (recommended). With flat names, first-wins silently hides the later server's tool, and reject drops the shared name. Check namespaced keys for clashes (`a_b` + `c` vs `a` + `b_c`). Verify routing with server-side evidence.
