import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import type { McpCall, McpTool } from '@mlp/contracts';
import { sanitizeDetail } from '../lab-46/connect.js';

export const EXTERNAL_CLIENT = 'MCP TypeScript SDK client 2.4.0 (not Mastra)';

const newClient = () => new Client({ name: 'external-mcp-client', version: '1.0.0' }, { versionNegotiation: { mode: 'auto' } });

/** Connects without credentials and reports how the server refused it. */
export async function tryWithoutToken(url: string) {
  const client = newClient();
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(url)), { timeout: 5_000 });
    return { rejected: false, httpStatus: null as number | null, code: null as string | null };
  } catch (e) {
    const err = e as { code?: unknown; data?: { status?: unknown } };
    return {
      rejected: true,
      httpStatus: typeof err.data?.status === 'number' ? err.data.status : null,
      code: typeof err.code === 'string' ? err.code : null,
    };
  } finally {
    await client.close().catch(() => undefined);
  }
}

/** Parses "- field: message" lines from a server-side validation failure. */
export function fieldErrorsFromText(text: string) {
  return [...text.matchAll(/^- ([^:\n]+): (.+)$/gm)]
    .slice(0, 20)
    .map((m) => ({ field: m[1]!.trim(), message: m[2]!.trim().slice(0, 300) }));
}

export interface ExternalSession {
  protocolVersion: string | null;
  serverInfo: { name: string; version: string } | null;
  tools: McpTool[];
  call: McpCall;
  closed: boolean;
}

/** The external client: authenticate, discover, call one tool, close. */
export async function discoverAndCall(
  url: string,
  token: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<ExternalSession> {
  const client = newClient();
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: { headers: { authorization: `Bearer ${token}` } },
  });
  let session: Omit<ExternalSession, 'closed'>;
  let closed: boolean;
  try {
    await client.connect(transport, { timeout: 5_000 });
    const listed = await client.listTools();
    const tools: McpTool[] = listed.tools.map((t) => ({
      key: t.name,
      name: t.name,
      title: t.title ?? t.annotations?.title ?? null,
      description: t.description ?? '',
      annotations: t.annotations ?? null,
      inputSchema: t.inputSchema as Record<string, unknown>,
      outputSchema: (t.outputSchema ?? null) as Record<string, unknown> | null,
      permission: { allowed: true, reason: 'published by the façade' },
    }));
    const t0 = performance.now();
    let r: Awaited<ReturnType<Client['callTool']>>;
    try {
      r = await client.callTool({ name: toolName, arguments: args });
    } catch (err) {
      const protocol = err as { code?: unknown; message?: unknown };
      // SDK 2.4 propagates the server's unknown-tool protocol error instead of an isError result.
      if (
        protocol.code !== -32602 ||
        typeof protocol.message !== 'string' ||
        !/^Unknown tool:/i.test(protocol.message) ||
        tools.some((t) => t.name === toolName)
      )
        throw err;
      r = { isError: true, content: [{ type: 'text', text: `Unknown tool: ${toolName}` }] };
    }
    const durationMs = Math.round(performance.now() - t0);
    const text = (r.content as { type: string; text?: string }[] | undefined)?.find((c) => c.type === 'text')?.text ?? '';
    const base = { toolName, args, suggestions: [], durationMs };
    let call: McpCall;
    if (!r.isError) {
      let result: unknown = r.structuredContent;
      if (result === undefined) {
        try {
          result = JSON.parse(text);
        } catch {
          result = text;
        }
      }
      call = { ...base, status: 'success', reason: null, message: 'served by the façade', fieldErrors: [], result };
    } else if (/^Unknown tool/i.test(text)) {
      call = {
        ...base,
        status: 'rejected',
        reason: 'unknown-tool',
        message: sanitizeDetail(text),
        fieldErrors: [],
        result: null,
      };
    } else if (/input validation failed/i.test(text)) {
      call = {
        ...base,
        status: 'rejected',
        reason: 'invalid-arguments',
        message: sanitizeDetail(text),
        fieldErrors: fieldErrorsFromText(text),
        result: null,
      };
    } else {
      call = { ...base, status: 'error', reason: 'tool-error', message: sanitizeDetail(text), fieldErrors: [], result: null };
    }
    const v = client.getServerVersion();
    session = {
      protocolVersion: client.getNegotiatedProtocolVersion() ?? null,
      serverInfo: v ? { name: v.name, version: v.version } : null,
      tools,
      call,
    };
  } finally {
    closed = await client.close().then(
      () => true,
      () => false,
    );
  }
  return { ...session, closed };
}
