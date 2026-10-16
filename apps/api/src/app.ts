import express, { type ErrorRequestHandler, type Express } from 'express';
import { HealthResponseSchema, redactSecrets, type HealthResponse } from '@mlp/contracts';
import { catalog } from '@mlp/lab-catalog';
import { LabError, LabRunner, toCanonicalError, type LabRegistry } from '@mlp/lab-engine';
import { createLabRegistry, createLabServices, type LabServices } from '@mlp/labs';
import { getMastraVersion } from '@mlp/mastra-runtime';
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
  logger: Logger;
  startedAt?: number;
  registry?: LabRegistry<LabServices>;
  runner?: LabRunner<LabServices>;
}

export interface ApiApp {
  app: Express;
  runner: LabRunner<LabServices>;
  registry: LabRegistry<LabServices>;
}

export function createApp({ config, logger, startedAt = Date.now(), ...deps }: AppDeps): ApiApp {
  const secrets = secretValues(config);
  const registry = deps.registry ?? createLabRegistry();
  const runner =
    deps.runner ??
    new LabRunner<LabServices>({
      registry,
      services: createLabServices({ serverMode: config.MASTRA_MODE, env: process.env }),
      liveEnabled: config.MASTRA_MODE === 'live',
      maxConcurrentRuns: config.MAX_CONCURRENT_RUNS,
      serverMaxTimeoutMs: config.RUN_MAX_TIMEOUT_MS,
      disconnectGraceMs: config.SSE_DISCONNECT_GRACE_MS,
      secrets,
      logger,
    });
  const mastraVersion = getMastraVersion();
  const pinned = { '@mastra/core': mastraVersion, zod: '4.6.7', node: process.version };

  const app = express();
  app.disable('x-powered-by');
  app.use(requestIds);
  app.use(express.json({ limit: '64kb' }));

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

  app.use('/api/labs', labsRouter({ config, registry, runner, pinned }));
  app.use('/api/runs', runsRouter({ runner, heartbeatMs: config.SSE_HEARTBEAT_MS }));

  app.use('/api', (req, _res, next) => {
    next(new LabError('NOT_FOUND', `No API route for ${req.method} ${req.originalUrl}`));
  });

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
        res.status(413).json(errorBody('BAD_REQUEST', 'Request body too large (max 64 KB)', { requestId }));
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

  return { app, runner, registry };
}
