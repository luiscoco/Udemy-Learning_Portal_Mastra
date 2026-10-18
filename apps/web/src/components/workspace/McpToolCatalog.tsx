import { McpCatalogSchema, mcpParameters, type McpCatalog, type McpTool } from '@mlp/contracts';
import { Badge, Card } from '../ui/primitives';

/** Parses a lab result's `mcpCatalog`; anything that does not match the contract renders nothing. */
export function mcpCatalogOf(output: unknown): McpCatalog | null {
  if (!output || typeof output !== 'object' || !('mcpCatalog' in output)) return null;
  const parsed = McpCatalogSchema.safeParse((output as { mcpCatalog: unknown }).mcpCatalog);
  return parsed.success ? parsed.data : null;
}

const json = (v: unknown) => JSON.stringify(v, null, 2);

function ToolCard({ tool }: { tool: McpTool }) {
  const params = mcpParameters(tool.inputSchema);
  const a = tool.annotations;
  const headingId = `mcp-tool-${tool.key}`;
  return (
    <article className="flex min-w-0 flex-col gap-2 rounded-xl border border-border p-3" aria-labelledby={headingId}>
      <div className="flex flex-wrap items-center gap-2">
        <h4 id={headingId} className="font-mono text-sm font-semibold text-fg [overflow-wrap:anywhere]">
          {tool.name}
        </h4>
        {tool.title ? <span className="text-sm text-fg-muted">{tool.title}</span> : null}
        {a?.readOnlyHint ? <Badge tone="success">Read-only</Badge> : null}
        {a?.destructiveHint ? <Badge tone="danger">Destructive</Badge> : null}
        {!a ? <Badge>No annotations</Badge> : null}
        <Badge tone={tool.permission.allowed ? 'accent' : 'warning'}>
          {tool.permission.allowed ? 'Permitted' : 'Not permitted'}
        </Badge>
      </div>
      <p className="text-sm text-fg [overflow-wrap:anywhere]">{tool.description}</p>
      {!tool.permission.allowed ? (
        <p className="text-xs text-fg-muted [overflow-wrap:anywhere]">{tool.permission.reason}</p>
      ) : null}
      <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={`Parameters of ${tool.name} (scrollable)`}>
        <table className="w-full min-w-[28rem] text-left text-sm">
          <caption className="sr-only">Parameters of {tool.name}</caption>
          <thead className="text-xs text-fg-muted">
            <tr>
              <th scope="col" className="py-1 pr-3 font-medium">
                Parameter
              </th>
              <th scope="col" className="py-1 pr-3 font-medium">
                Type
              </th>
              <th scope="col" className="py-1 pr-3 font-medium">
                Required
              </th>
              <th scope="col" className="py-1 pr-3 font-medium">
                Constraints
              </th>
              <th scope="col" className="py-1 font-medium">
                Description
              </th>
            </tr>
          </thead>
          <tbody>
            {params.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-1 text-fg-muted">
                  No parameters
                </td>
              </tr>
            ) : (
              params.map((p) => (
                <tr key={p.name} className="border-t border-border align-top">
                  <td className="py-1 pr-3 font-mono">{p.name}</td>
                  <td className="py-1 pr-3 [overflow-wrap:anywhere]">{p.type}</td>
                  <td className="py-1 pr-3">{p.required ? 'yes' : 'no'}</td>
                  <td className="py-1 pr-3 [overflow-wrap:anywhere]">{p.constraints.join(', ') || '—'}</td>
                  <td className="py-1 [overflow-wrap:anywhere]">{p.description || '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-accent">JSON Schema of {tool.name}</summary>
        <pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-surface-muted p-2 text-xs" tabIndex={0}>
          {json({ input: tool.inputSchema, output: tool.outputSchema })}
        </pre>
      </details>
    </article>
  );
}

/** Discovered MCP tools with their schemas and the client's call (all rendered as text, never as HTML). */
export function McpToolCatalog({ data }: { data: McpCatalog }) {
  const call = data.call;
  return (
    <Card className="flex min-w-0 flex-col gap-4 p-4" data-testid="mcp-catalog">
      <p className="text-sm text-fg-muted [overflow-wrap:anywhere]">
        {data.server.name} {data.server.version} ({data.server.key})
        {data.server.protocolVersion ? `, protocol ${data.server.protocolVersion}` : ''}: {data.tools.length} tool(s)
      </p>
      <div className="flex flex-col gap-3" role="list" aria-label="Discovered tools">
        {data.tools.map((t) => (
          <div role="listitem" key={t.key}>
            <ToolCard tool={t} />
          </div>
        ))}
      </div>
      {call ? (
        <section aria-label="Tool call" className="flex min-w-0 flex-col gap-2" data-testid="mcp-call">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-semibold text-fg">
              Call: <span className="font-mono">{call.toolName}</span>
            </h4>
            <Badge tone={call.status === 'success' ? 'success' : call.status === 'rejected' ? 'warning' : 'danger'}>
              {call.status === 'success'
                ? 'Succeeded'
                : call.status === 'rejected'
                  ? `Rejected: ${call.reason}`
                  : `Error: ${call.reason}`}
            </Badge>
          </div>
          <p className="text-sm [overflow-wrap:anywhere]">{call.message}</p>
          {call.suggestions.length > 0 ? (
            <p className="text-sm">
              Did you mean: <span className="font-mono">{call.suggestions.join(', ')}</span>?
            </p>
          ) : null}
          {call.fieldErrors.length > 0 ? (
            <ul className="list-disc pl-5 text-sm text-danger" aria-label="Argument errors">
              {call.fieldErrors.map((f, i) => (
                <li key={i} className="[overflow-wrap:anywhere]">
                  <span className="font-mono">{f.field}</span>: {f.message}
                </li>
              ))}
            </ul>
          ) : null}
          <div className="grid min-w-0 gap-2 md:grid-cols-2">
            <div className="min-w-0">
              <h5 className="text-xs font-medium text-fg-muted">Arguments</h5>
              <pre className="max-h-60 overflow-auto rounded-lg bg-surface-muted p-2 text-xs" tabIndex={0}>
                {json(call.args)}
              </pre>
            </div>
            {call.status === 'success' ? (
              <div className="min-w-0">
                <h5 className="text-xs font-medium text-fg-muted">Result</h5>
                <pre
                  className="max-h-60 overflow-auto rounded-lg bg-surface-muted p-2 text-xs"
                  tabIndex={0}
                  data-testid="mcp-call-result"
                >
                  {json(call.result)}
                </pre>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}
    </Card>
  );
}
