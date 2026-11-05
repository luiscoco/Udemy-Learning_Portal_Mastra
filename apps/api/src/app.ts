import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import express, { type ErrorRequestHandler, type Express, type Router } from 'express';
import {
  DEFAULT_REQUEST_BYTES,
  HealthResponseSchema,
  maxRequestBytes,
  PROGRESS_IMPORT_BYTES,
  PROGRESS_WRITE_BYTES,
  ReadinessResponseSchema,
  redactSecrets,
  type HealthResponse,
} from '@mlp/contracts';
import { ReadinessProbe } from '@mlp/deploy';
import { catalog } from '@mlp/lab-catalog';
import { LabError, LabRunner, toCanonicalError, type LabRegistry } from '@mlp/lab-engine';
import { createLabRegistry, createLabServices, dataDir, type LabServices } from '@mlp/labs';
import { getMastraVersion } from '@mlp/mastra-runtime';
import { createAuth, type Auth } from './auth.js';
import { secretValues, type AppConfig } from './config.js';
import { errorBody, statusFor } from './errors.js';
import type { Logger } from './logger.js';
import { requestIds } from './request-id.js';
import { labsRouter } from './routes/labs.js';
import { runsRouter } from './routes/runs.js';
import { progressRouter } from './routes/progress.js';
import { ProgressRepository } from './progress-store.js';
import { SqliteRunJournal } from './run-journal.js';
import { RunRateLimiter } from './run-rate-limit.js';

export const SERVICE_NAME = 'mastra-learning-platform-api';
export const SERVICE_VERSION = '0.1.0';

export interface AppDeps {
  config: AppConfig;
  /** Root for lab stores (tests pass a temporary one). Defaults to <dataDir>/memory. */
  memoryDir?: string;
  /** Data directory the readiness probe checks (tests pass a temporary one). Defaults to MLP_DATA_DIR or .data. */
  dataDir?: string;
  logger: Logger;
  startedAt?: number;
  registry?: LabRegistry<LabServices>;
  runner?: LabRunner<LabServices>;
  /** Monotonic admission clock; tests advance it without changing execution deadlines. */
  rateLimitNow?: () => number;
}

export interface ApiApp {
  app: Express;
  /** Every mounted router with its base path (the route audit lists their routes). */
  mounts: { base: string; router: Router }[];
  auth: Auth;
  runner: LabRunner<LabServices>;
  registry: LabRegistry<LabServices>;
  readiness: ReadinessProbe;
  /** Marks the instance as draining: /api/ready answers 503 so load balancers stop sending traffic. */
  drain(): void;
}

export function createApp({ config, logger, startedAt = Date.now(), ...deps }: AppDeps): ApiApp {
  // Validate the auth boundary before allocating runtime services.
  const auth = createAuth(config, logger, deps.dataDir ?? config.MLP_DATA_DIR ?? dataDir());
  const secrets = secretValues(config);
  const registry = deps.registry ?? createLabRegistry();
  const baseServices = createLabServices({ serverMode: config.MASTRA_MODE, env: process.env, memoryDir: deps.memoryDir });
  if (deps.runner && config.RUN_STORE === 'sqlite')
    throw new LabError('NOT_CONFIGURED', 'Persistent execution storage requires the API-owned runner.');
  const persistence =
    config.RUN_STORE === 'sqlite'
      ? new SqliteRunJournal(deps.dataDir ?? config.MLP_DATA_DIR ?? dataDir(), { secret: config.RUN_STORE_SECRET! })
      : undefined;
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
      persistence,
    });
  const mastraVersion = getMastraVersion();
  const pinned = { '@mastra/core': mastraVersion, zod: '4.6.7', node: process.version };

  let draining = false;
  const readiness = new ReadinessProbe({
    config,
    dataDir: deps.dataDir ?? config.MLP_DATA_DIR ?? dataDir(),
    acceptingRuns: () => !draining,
  });

  const app = express();
  app.disable('x-powered-by');
  // Behind a TLS-terminating proxy, req.protocol / req.ip come from X-Forwarded-* only when trusted.
  app.set('trust proxy', config.TRUST_PROXY);
  app.use(requestIds);
  if (config.LOG_REQUESTS) {
    app.use((req, res, next) => {
      const started = performance.now();
      // Captured before routing: mounted routers rewrite req.path to their own prefix.
      const path = req.path.slice(0, 200);
      res.on('finish', () => {
        // The path only: query strings may carry tokens (SSE resume) and never reach the logs.
        logger.info('request', {
          requestId: req.requestId,
          method: req.method,
          path,
          status: res.statusCode,
          durationMs: Math.round(performance.now() - started),
        });
      });
      next();
    });
  }
  // Request bodies are capped at 64 KB, except a lab's run request, which may also carry the files its
  // definition declares (file fields): the limit is derived from those declared limits, per lab.
  const defaultJson = express.json({ limit: DEFAULT_REQUEST_BYTES });
  const progressImportJson = express.json({ limit: PROGRESS_IMPORT_BYTES });
  const progressWriteJson = express.json({ limit: PROGRESS_WRITE_BYTES });
  const labJson = new Map<number, ReturnType<typeof express.json>>();
  app.use((req, res, next) => {
    if (req.method === 'POST' && req.path.startsWith('/api/progress/'))
      return (req.path === '/api/progress/import' ? progressImportJson : progressWriteJson)(req, res, next);
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
  mount(
    '/api/progress',
    progressRouter(
      new ProgressRepository((subject) => baseServices.forTenant(subject).memory.file('platform-progress')),
      registry,
    ),
  );

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

  app.get('/api/ready', async (_req, res) => {
    const body = ReadinessResponseSchema.parse(await readiness.check());
    res.setHeader('Cache-Control', 'no-store');
    res.status(body.status === 'ready' ? 200 : 503).json(body);
  });

  app.get('/api/catalog', (_req, res) => {
    res.json(catalog);
  });

  const limits = new RunRateLimiter(
    {
      windowMs: config.RUN_RATE_WINDOW_MS,
      start: { user: config.RUN_START_RATE_USER_MAX, ip: config.RUN_START_RATE_IP_MAX },
      control: { user: config.RUN_CONTROL_RATE_USER_MAX, ip: config.RUN_CONTROL_RATE_IP_MAX },
    },
    deps.rateLimitNow,
  );
  mount('/api/labs', labsRouter({ config, registry, runner, pinned, limits }));
  mount('/api/runs', runsRouter({ runner, heartbeatMs: config.SSE_HEARTBEAT_MS, limits }));

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

  return {
    app,
    auth,
    mounts,
    runner,
    registry,
    readiness,
    drain: () => {
      draining = true;
    },
  };
}
