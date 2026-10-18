import type { MCPClient } from '@mastra/mcp';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import type { McpCapabilityRow } from '@mlp/contracts';
import { sanitizeDetail, SERVER_KEY } from '../lab-46/connect.js';

export interface ProtocolProbe {
  protocolVersion: string | null;
  serverInfo: { name: string; version: string } | null;
  advertised: Record<string, unknown>;
  /** What the SDK's complete() returned or why it failed. */
  completion: string;
  /** What the SDK's setLoggingLevel() returned or why it failed. */
  logging: string;
  closed: boolean;
}

/** Protocol layer: the official MCP SDK client reads what the server advertises, then closes. */
export async function probeProtocol(url: string, timeoutMs: number): Promise<ProtocolProbe> {
  const client = new Client({ name: 'mlp-capability-probe', version: '1.0.0' }, { versionNegotiation: { mode: 'auto' } });
  const transport = new StreamableHTTPClientTransport(new URL(url));
  const attempt = async (f: () => Promise<unknown>) => {
    try {
      return `ok: ${JSON.stringify(await f()).slice(0, 120)}`;
    } catch (e) {
      return sanitizeDetail(e instanceof Error ? e.message : String(e)).replace(/^Error POSTing to endpoint: /, '');
    }
  };
  let result: Omit<ProtocolProbe, 'closed'>;
  let closed: boolean;
  try {
    await client.connect(transport, { timeout: timeoutMs });
    const v = client.getServerVersion();
    result = {
      protocolVersion: client.getNegotiatedProtocolVersion() ?? null,
      serverInfo: v ? { name: v.name, version: v.version } : null,
      advertised: (client.getServerCapabilities() ?? {}) as Record<string, unknown>,
      completion: await attempt(() =>
        client.complete({ ref: { type: 'ref/prompt', name: 'explain-lab' }, argument: { name: 'number', value: '4' } }),
      ),
      logging: await attempt(() => client.setLoggingLevel('info')),
    };
  } finally {
    closed = await client.close().then(
      () => true,
      () => false,
    );
  }
  return { ...result, closed };
}

export interface AdapterObservations {
  tools: number;
  resources: number;
  templates: number;
  prompts: number;
  subscription: string;
}

/** Adapter layer: what Mastra's MCPClient reports for the same server. */
export async function observeAdapter(mcp: MCPClient, advertised: Record<string, unknown>): Promise<AdapterObservations> {
  const [tools, resources, templates, prompts] = await Promise.all([
    mcp.listToolsWithErrors(),
    mcp.resources.listWithErrors(),
    mcp.resources.templatesWithErrors(),
    mcp.prompts.listWithErrors(),
  ]);
  const subscribe = (advertised.resources as { subscribe?: boolean } | undefined)?.subscribe === true;
  let subscription = 'not attempted: the server does not advertise resource subscriptions';
  if (subscribe) {
    try {
      await mcp.resources.subscribe(SERVER_KEY, 'course://syllabus');
      await mcp.resources.unsubscribe(SERVER_KEY, 'course://syllabus');
      subscription = 'subscribe and unsubscribe course://syllabus succeeded';
    } catch (e) {
      subscription = `failed: ${sanitizeDetail(e instanceof Error ? e.message : String(e))}`;
    }
  }
  return {
    tools: Object.keys(tools.tools).length,
    resources: resources.resources[SERVER_KEY]?.length ?? 0,
    templates: templates.templates[SERVER_KEY]?.length ?? 0,
    prompts: prompts.prompts[SERVER_KEY]?.length ?? 0,
    subscription,
  };
}

const adv = (advertised: Record<string, unknown>, key: string) =>
  (key in advertised ? 'advertised' : 'not-advertised') as McpCapabilityRow['server'];

/** One row per feature, separating protocol, server, Mastra adapter and observation. */
export function capabilityRows(p: ProtocolProbe, o: AdapterObservations): McpCapabilityRow[] {
  const a = p.advertised;
  const res = adv(a, 'resources');
  const prm = adv(a, 'prompts');
  const subscribeAdvertised = (a.resources as { subscribe?: boolean } | undefined)?.subscribe === true;
  const masked = (n: number, what: string) =>
    `MCPClient returned an empty list (${n}) although the server does not advertise ${what}`;
  return [
    {
      feature: 'Tools',
      protocol: 'tools/list, tools/call',
      server: adv(a, 'tools'),
      mastra: 'supported',
      observed: `${o.tools} tool(s) listed`,
      note: 'listTools / listToolDefinitions (lab 47).',
    },
    {
      feature: 'Resources',
      protocol: 'resources/list, resources/read',
      server: res,
      mastra: 'limited',
      observed: res === 'advertised' ? `${o.resources} resource(s) listed` : masked(o.resources, 'resources'),
      note: 'A missing capability looks like an empty list: check the advertised capabilities before relying on it.',
    },
    {
      feature: 'Resource templates',
      protocol: 'resources/templates/list (RFC 6570 URI templates)',
      server: res,
      mastra: 'limited',
      observed: res === 'advertised' ? `${o.templates} template(s) listed` : masked(o.templates, 'resources'),
      note: 'Mastra’s MCPServer only reads URIs returned by listResources, so a URI built from a template is rejected unless it is also listed.',
    },
    {
      feature: 'Resource subscriptions',
      protocol: 'subscriptions/listen with a resource filter',
      server: subscribeAdvertised ? 'advertised' : 'not-advertised',
      mastra: 'supported',
      observed: o.subscription,
      note: 'resources.subscribe / unsubscribe / onUpdated keep one listen stream per server.',
    },
    {
      feature: 'Prompts',
      protocol: 'prompts/list, prompts/get',
      server: prm,
      mastra: 'limited',
      observed: prm === 'advertised' ? `${o.prompts} prompt(s) listed` : masked(o.prompts, 'prompts'),
      note: 'Same as resources: a missing capability is reported as an empty list.',
    },
    {
      feature: 'Completions',
      protocol: 'completion/complete (SDK Client.complete)',
      server: adv(a, 'completions'),
      mastra: 'not-exposed',
      observed: `SDK complete(): ${p.completion}`,
      note: 'MCPClient has no completion API, and Mastra’s MCPServer does not implement it.',
    },
    {
      feature: 'Logging',
      protocol: 'per-request log level in _meta (2026-07-28); logging/setLevel is pre-2026',
      server: adv(a, 'logging'),
      mastra: 'limited',
      observed: `SDK setLoggingLevel(): ${p.logging}`,
      note: 'MCPClient asks for per-request server logs (enableServerLogs, serverLogLevel) and forwards them to its logger.',
    },
    {
      feature: 'Roots (client feature)',
      protocol: 'roots/list, answered by the client',
      server: 'n/a',
      mastra: 'not-exposed',
      observed: 'not exercised: the Mastra docs state MCPClient does not support roots',
      note: 'Client features are offered by the client, not advertised by the server.',
    },
    {
      feature: 'Sampling (client feature)',
      protocol: 'sampling/createMessage, answered by the client',
      server: 'n/a',
      mastra: 'not-exposed',
      observed: 'not exercised: the Mastra docs state MCPClient does not support sampling',
      note: 'A server that needs the client’s model cannot use it through MCPClient.',
    },
    {
      feature: 'Elicitation (client feature)',
      protocol: 'input_required results on 2026-07-28 (elicitation/create before)',
      server: 'n/a',
      mastra: 'supported',
      observed: 'not exercised in this lab',
      note: 'Answered by an inputRequests handler on the server definition.',
    },
  ];
}
