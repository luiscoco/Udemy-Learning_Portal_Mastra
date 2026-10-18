import { noopLogger } from '@mastra/core/logger';
import { MCPClient } from '@mastra/mcp';
import { sanitizeMastraLog } from '../shared/agent-kit.js';

export const SERVER_KEY = 'course';

export type FailureCategory =
  'blocked-by-policy' | 'protocol-mismatch' | 'not-found' | 'rejected' | 'timeout' | 'unreachable' | 'unknown';

export const RETRIABLE: ReadonlySet<FailureCategory> = new Set(['timeout', 'unreachable']);

export const FAILURE_HELP: Record<FailureCategory, { message: string; hint: string }> = {
  'blocked-by-policy': {
    message: 'The client refused to contact this host: it is not in allowedHosts. No request was sent.',
    hint: 'Add the exact host and port to allowedHosts only if you trust the server.',
  },
  'protocol-mismatch': {
    message: 'The server does not speak the protocol revision the client asked for.',
    hint: 'Remove the protocolVersion pin so the client probes with server/discover, or pin a revision the server offers.',
  },
  'not-found': {
    message: 'The server answered 404: nothing handles MCP at this path.',
    hint: 'Check the endpoint path (this fixture serves /mcp).',
  },
  rejected: {
    message: 'The server rejected the request.',
    hint: 'Check authentication headers and the endpoint configuration.',
  },
  timeout: {
    message: 'The server did not answer within the timeout.',
    hint: 'The server may be overloaded or stuck; retry with backoff, then raise the timeout only if the server is known to be slow.',
  },
  unreachable: {
    message: 'Could not reach the server: nothing is listening at this address.',
    hint: 'Start the server, or check the host and port.',
  },
  unknown: {
    message: 'The connection failed for an unrecognised reason.',
    hint: 'Read the sanitized detail and the server logs.',
  },
};

export interface ErrorDetail {
  message: string;
  httpStatus?: number;
  code?: string | number;
}

/** Maps a listToolsWithErrors errorDetails entry to a failure category (order matters). */
export function classifyFailure(d: ErrorDetail): FailureCategory {
  const m = d.message;
  if (/allowedHosts/i.test(m)) return 'blocked-by-policy';
  if (d.httpStatus === 400 && /Unsupported protocol version/i.test(m)) return 'protocol-mismatch';
  if (d.httpStatus === 404) return 'not-found';
  if (d.httpStatus !== undefined && d.httpStatus >= 400 && d.httpStatus < 500) return 'rejected';
  if (/timed out/i.test(m)) return 'timeout';
  if (d.code === 'ERA_NEGOTIATION_FAILED' || /fetch failed|ECONNREFUSED/i.test(m)) return 'unreachable';
  return 'unknown';
}

/** First line, no stack frames, no local file paths, at most 240 characters. */
export function sanitizeDetail(message: string): string {
  return sanitizeMastraLog(message)
    .replace(/(?:[A-Za-z]:\\|\/(?:home|Users|usr|tmp|var|opt)\/)[^\s'"]*/g, '<path>')
    .slice(0, 240);
}

export interface ServerDefinition {
  url: string;
  allowedHosts: string[];
  protocolVersion?: 'legacy' | '2026-07-28';
}

export interface Connected {
  status: 'connected';
  protocolVersion: string | null;
  serverInfo: { name: string; version: string; description?: string } | null;
  instructions: string | null;
  tools: { key: string; name: string }[];
}
export interface Failed {
  status: 'failed';
  category: FailureCategory;
  retriable: boolean;
  message: string;
  hint: string;
  detail: string;
  httpStatus: number | null;
}
export type AttemptOutcome = Connected | Failed;
export interface Attempt {
  n: number;
  ms: number;
  outcome: AttemptOutcome;
  disconnected: boolean;
}

/** One connection attempt with a fresh client; the client is always disconnected. */
export async function connectOnce(
  id: string,
  def: ServerDefinition,
  timeoutMs: number,
): Promise<{ outcome: AttemptOutcome; disconnected: boolean }> {
  const client = new MCPClient({
    id,
    timeout: timeoutMs,
    servers: {
      [SERVER_KEY]: {
        url: new URL(def.url),
        allowedHosts: def.allowedHosts,
        timeout: timeoutMs,
        enableServerLogs: false,
        ...(def.protocolVersion ? { protocolVersion: def.protocolVersion } : {}),
      },
    },
  });
  client.__setLogger(noopLogger);
  let outcome: AttemptOutcome;
  try {
    const r = await client.listToolsWithErrors({ perServerTimeoutMs: timeoutMs });
    const err = r.errorDetails[SERVER_KEY] ?? (r.errors[SERVER_KEY] ? { message: r.errors[SERVER_KEY]! } : undefined);
    if (err) outcome = failed(err);
    else {
      const info = client.getServerInfo()[SERVER_KEY];
      outcome = {
        status: 'connected',
        protocolVersion: client.getServerProtocolVersions()[SERVER_KEY] ?? null,
        serverInfo: info
          ? { name: info.name, version: info.version, ...(info.description ? { description: info.description } : {}) }
          : null,
        instructions: client.getServerInstructions()[SERVER_KEY] ?? null,
        tools: Object.keys(r.tools)
          .sort()
          .map((key) => ({ key, name: key.slice(SERVER_KEY.length + 1) })),
      };
    }
  } catch (e) {
    outcome = failed({ message: e instanceof Error ? e.message : String(e) });
  }
  let disconnected = true;
  await client.disconnect().catch(() => (disconnected = false));
  return { outcome, disconnected };
}

function failed(d: ErrorDetail): Failed {
  const category = classifyFailure(d);
  return {
    status: 'failed',
    category,
    retriable: RETRIABLE.has(category),
    ...FAILURE_HELP[category],
    detail: sanitizeDetail(d.message),
    httpStatus: d.httpStatus ?? null,
  };
}

/** Retries only retriable failures, with a 100 ms × attempt backoff that honours the abort signal. */
export async function connectWithRetry(
  baseId: string,
  def: ServerDefinition,
  opts: { timeoutMs: number; maxAttempts: number; signal?: AbortSignal; onAttempt?: (a: Attempt) => void },
): Promise<Attempt[]> {
  const attempts: Attempt[] = [];
  for (let n = 1; n <= opts.maxAttempts; n++) {
    opts.signal?.throwIfAborted();
    const t0 = performance.now();
    const { outcome, disconnected } = await connectOnce(`${baseId}-${n}`, def, opts.timeoutMs);
    const attempt = { n, ms: Math.round(performance.now() - t0), outcome, disconnected };
    attempts.push(attempt);
    opts.onAttempt?.(attempt);
    if (outcome.status === 'connected' || !outcome.retriable || n === opts.maxAttempts) break;
    await sleep(100 * n, opts.signal);
  }
  return attempts;
}

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}
