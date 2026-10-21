import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import express, { type ErrorRequestHandler, type Express, type Router } from 'express';
import { DEFAULT_REQUEST_BYTES, HealthResponseSchema, maxRequestBytes, redactSecrets, type HealthResponse } from '@mlp/contracts';
import { catalog } from '@mlp/lab-catalog';
import { LabError, LabRunner, toCanonicalError, type LabRegistry } from '@mlp/lab-engine';
import { createLabRegistry, createLabServices, type LabServices } from '@mlp/labs';
import { getMastraVersion } from '@mlp/mastra-runtime';
import { createAuth, type Auth } from './auth.js';
import { secretValues, type AppConfig } from './config.js';
import { errorBody, statusFor } from './errors.js';
import type { Logger } from './logger.js';
import { requestIds } from './request-id.js';
import { labsRouter } from './routes/labs.js';
import { runsRouter } from './routes/runs.js';

export const SERVICE_NAME = 'mastra-learning-platform-api';
export const SERVICE_VERSION = '0.1.0';

export interface AppDeps {
  config: AppConfig;
  /** Root for lab stores (tests pass a temporary one). Defaults to <dataDir>/memory. */
  memoryDir?: string;
  logger: Logger;
  startedAt?: number;
  registry?: LabRegistry<LabServices>;
  runner?: LabRunner<LabServices>;
}

export interface ApiApp {
  app: Express;
  /** Every mounted router with its base path (the route audit lists their routes). */
  mounts: { base: string; router: Router }[];
  auth: Auth;
  runner: LabRunner<LabServices>;
  registry: LabRegistry<LabServices>;
}

export function createApp({ config, logger, startedAt = Date.now(), ...deps }: AppDeps): ApiApp {
  // Validate the auth boundary before allocating runtime services.
  const auth = createAuth(config, logger);
  const secrets = secretValues(config);
  const registry = deps.registry ?? createLabRegistry();
  const baseServices = createLabServices({ serverMode: config.MASTRA_MODE, env: process.env, memoryDir: deps.memoryDir });
  const runner =
    deps.runner ??
    new LabRunner<LabServices>({
      registry,
      services: baseServices,
      // Tenant isolation (L62): every run works in its owner's storage partition.
      servicesFor: (ownerId) => baseServices.forTenant(ownerId),
      liveEnabled: config.MASTRA_MODE === 'live',
      maxConcurrentRuns: config.MAX_CONCURRENT_RUNS,
      serverMaxTimeoutMs: config.RUN_MAX_TIMEOUT_MS,
      disconnectGraceMs: config.SSE_DISCONNECT_GRACE_MS,
      approvalTimeoutMs: config.APPROVAL_TIMEOUT_MS,
      maxPendingApprovals: config.MAX_PENDING_APPROVALS,
      secrets,
      logger,
    });
  const mastraVersion = getMastraVersion();
  const pinned = { '@mastra/core': mastraVersion, zod: '4.6.7', node: process.version };

  const app = express();
  app.disable('x-powered-by');
  app.use(requestIds);
  // Request bodies are capped at 64 KB, except a lab's run request, which may also carry the files its
  // definition declares (file fields): the limit is derived from those declared limits, per lab.
  const defaultJson = express.json({ limit: DEFAULT_REQUEST_BYTES });
  const labJson = new Map<number, ReturnType<typeof express.json>>();
  app.use((req, res, next) => {
    const m = req.method === 'POST' ? /^\/api\/labs\/([a-z0-9-]{1,40})\/runs$/.exec(req.path) : null;
    const lab = m ? registry.get(m[1]!) : undefined;
    const limit = lab ? maxRequestBytes(lab.definition) : DEFAULT_REQUEST_BYTES;
    if (limit === DEFAULT_REQUEST_BYTES) return defaultJson(req, res, next);
    let parser = labJson.get(limit);
    if (!parser) labJson.set(limit, (parser = express.json({ limit })));
    return parser(req, res, next);
  });

  app.use(auth.middleware);
  const mounts: ApiApp['mounts'] = [];
  const mount = (base: string, router: Router) => {
    mounts.push({ base, router });
    app.use(base, router);
  };
  mount('/api/auth', auth.router);

  app.get('/api/health', (_req, res) => {
    const body: HealthResponse = {
      status: 'ok',
      service: SERVICE_NAME,
      version: SERVICE_VERSION,
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      mode: config.MASTRA_MODE,
      mastraVersion,
      timestamp: new Date().toISOString(),
    };
    res.json(HealthResponseSchema.parse(body));
  });

  app.get('/api/catalog', (_req, res) => {
    res.json(catalog);
  });

  mount('/api/labs', labsRouter({ config, registry, runner, pinned }));
  mount('/api/runs', runsRouter({ runner, heartbeatMs: config.SSE_HEARTBEAT_MS }));

  app.use('/api', (req, _res, next) => {
    next(new LabError('NOT_FOUND', `No API route for ${req.method} ${req.originalUrl}`));
  });

  // Production topology: serve the built web app from the same origin (no dev proxy needed).
  if (config.WEB_DIST_DIR) {
    const dist = resolve(config.WEB_DIST_DIR);
    const indexHtml = join(dist, 'index.html');
    if (!existsSync(indexHtml)) throw new Error(`WEB_DIST_DIR has no index.html: ${dist} (run npm run build)`);
    app.use(express.static(dist, { index: false, maxAge: '1h' }));
    // SPA fallback: client-side routes like /labs/lab-03 load index.html.
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(indexHtml));
  }

  const onError: ErrorRequestHandler = (err: unknown, req, res, _next) => {
    const requestId = req.requestId;
    if (res.headersSent) {
      res.end();
      return;
    }
    if (typeof err === 'object' && err && 'type' in err) {
      const type = (err as { type: string }).type;
      if (type === 'entity.parse.failed') {
        res.status(400).json(errorBody('BAD_REQUEST', 'Request body is not valid JSON', { requestId }));
        return;
      }
      if (type === 'entity.too.large') {
        const limit = (err as { limit?: number }).limit ?? DEFAULT_REQUEST_BYTES;
        res
          .status(413)
          .json(errorBody('BAD_REQUEST', `Request body too large (max ${Math.round(limit / 1024)} KB)`, { requestId }));
        return;
      }
    }
    const canonical = toCanonicalError(err, secrets);
    if (canonical.code === 'INTERNAL') {
      logger.error('unhandled error', {
        requestId,
        error: redactSecrets(err instanceof Error ? err.message : String(err), secrets),
      });
    }
    res.status(statusFor(canonical.code)).json(
      errorBody(canonical.code, canonical.message, {
        requestId,
        ...(canonical.retryable ? { retryable: true } : {}),
        ...(canonical.details ? { details: canonical.details } : {}),
      }),
    );
  };
  app.use(onError);

  return { app, auth, mounts, runner, registry };
}
