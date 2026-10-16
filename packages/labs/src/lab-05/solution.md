# Solution — list Studio agents from a script

`list-agents.mjs`:

```js
const base = process.argv[2] ?? 'http://localhost:4111';

try {
  const res = await fetch(`${base}/api/agents`, { signal: AbortSignal.timeout(3000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const agents = await res.json(); // { "<agent-id>": { id, name, provider, modelId, … } }
  for (const [id, a] of Object.entries(agents)) {
    console.log(`${id}  →  ${a.provider}/${a.modelId}  (${a.name})`);
  }
} catch (err) {
  if (err.cause?.code === 'ECONNREFUSED') {
    console.log(`Studio is not running at ${base}. Start it with "npx mastra dev" in your project.`);
  } else {
    console.log(`Could not reach Studio: ${err.message}`);
  }
  process.exitCode = 1;
}
```

Run: `node list-agents.mjs`.
