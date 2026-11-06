import { McpCapabilitiesSchema, type McpCapabilities, type McpCapabilityRow } from '@mlp/contracts';
import { Badge, Card } from '../ui/primitives';
import { CodeBlock } from './CodeBlock';

/** Parses a lab result's `mcpCapabilities`; anything that does not match the contract renders nothing. */
export function mcpCapabilitiesOf(output: unknown): McpCapabilities | null {
  if (!output || typeof output !== 'object' || !('mcpCapabilities' in output)) return null;
  const parsed = McpCapabilitiesSchema.safeParse((output as { mcpCapabilities: unknown }).mcpCapabilities);
  return parsed.success ? parsed.data : null;
}

const SERVER_TEXT: Record<McpCapabilityRow['server'], string> = {
  advertised: 'Advertised',
  'not-advertised': 'Not advertised',
  'n/a': 'n/a (client feature)',
};
const MASTRA_TEXT: Record<McpCapabilityRow['mastra'], string> = {
  supported: 'Supported',
  limited: 'Limited',
  'not-exposed': 'Not exposed',
};
const MASTRA_TONE = { supported: 'success', limited: 'warning', 'not-exposed': 'danger' } as const;

/** Capability matrix (protocol, server, Mastra adapter, observed) and the operation result, rendered as text. */
export function McpCapabilityMatrix({ data }: { data: McpCapabilities }) {
  const op = data.operation;
  return (
    <Card className="flex min-w-0 flex-col gap-4 p-4" data-testid="mcp-capabilities">
      <p className="text-sm text-fg-muted [overflow-wrap:anywhere]">
        {data.server.name} {data.server.version}
        {data.server.protocolVersion ? `, protocol ${data.server.protocolVersion}` : ''}. Advertised:{' '}
        <span className="font-mono">{Object.keys(data.advertised).join(', ') || 'nothing'}</span>
      </p>
      <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Capability matrix (scrollable)">
        <table className="w-full min-w-[44rem] text-left text-sm">
          <caption className="sr-only">MCP capability matrix</caption>
          <thead className="text-xs text-fg-muted">
            <tr>
              <th scope="col" className="py-1 pr-3 font-medium">
                Feature
              </th>
              <th scope="col" className="py-1 pr-3 font-medium">
                Protocol
              </th>
              <th scope="col" className="py-1 pr-3 font-medium">
                Server
              </th>
              <th scope="col" className="py-1 pr-3 font-medium">
                Mastra adapter
              </th>
              <th scope="col" className="py-1 font-medium">
                Observed
              </th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.feature} className="border-t border-border align-top">
                <th scope="row" className="py-1.5 pr-3 font-medium">
                  {r.feature}
                </th>
                <td className="py-1.5 pr-3 [overflow-wrap:anywhere]">{r.protocol}</td>
                <td className="py-1.5 pr-3">{SERVER_TEXT[r.server]}</td>
                <td className="py-1.5 pr-3">
                  <Badge tone={MASTRA_TONE[r.mastra]}>{MASTRA_TEXT[r.mastra]}</Badge>
                </td>
                <td className="py-1.5 [overflow-wrap:anywhere]">
                  {r.observed}
                  {r.note ? <span className="mt-0.5 block text-xs text-fg-muted">{r.note}</span> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {op ? (
        <section aria-label="Operation result" className="flex min-w-0 flex-col gap-2" data-testid="mcp-operation">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-semibold text-fg [overflow-wrap:anywhere]">
              {op.kind === 'read-resource' ? 'Resource' : 'Prompt'}: <span className="font-mono">{op.target}</span>
            </h4>
            <Badge tone={op.status === 'server' ? 'success' : op.status === 'fallback' ? 'warning' : 'danger'}>
              {op.status === 'server'
                ? `From the server (${op.via})`
                : op.status === 'fallback'
                  ? `Fallback: ${op.via}`
                  : `Error: ${op.error?.code}`}
            </Badge>
          </div>
          {op.fallbackReason ? <p className="text-sm [overflow-wrap:anywhere]">{op.fallbackReason}</p> : null}
          {op.error ? <p className="text-sm text-danger [overflow-wrap:anywhere]">{op.error.message}</p> : null}
          {op.content ? (
            <div data-testid="mcp-operation-content">
              <CodeBlock code={op.content} language="text" label="MCP operation content" lineNumbers={false} />
            </div>
          ) : null}
        </section>
      ) : null}
    </Card>
  );
}
