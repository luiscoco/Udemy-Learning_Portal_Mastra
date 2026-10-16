import express, { type ErrorRequestHandler, type Express } from 'express';
import { HealthResponseSchema, type HealthResponse } from '@mlp/contracts';
import { catalog } from '@mlp/lab-catalog';
import { getMastraVersion } from '@mlp/mastra-runtime';
import type { AppConfig } from './config.js';
import { HttpError, errorBody } from './errors.js';
import type { Logger } from './logger.js';

export const SERVICE_NAME = 'mastra-learning-platform-api';
export const SERVICE_VERSION = '0.1.0';

export interface AppDeps {
  config: AppConfig;
  logger: Logger;
  startedAt?: number;
}

export function createApp({ config, logger, startedAt = Date.now() }: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '64kb' }));

  app.get('/api/health', (_req, res) => {
    const body: HealthResponse = {
      status: 'ok',
      service: SERVICE_NAME,
      version: SERVICE_VERSION,
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      mode: config.MASTRA_MODE,
      mastraVersion: getMastraVersion(),
      timestamp: new Date().toISOString(),
    };
    res.json(HealthResponseSchema.parse(body));
  });

  app.get('/api/catalog', (_req, res) => {
    res.json(catalog);
  });

  app.use('/api', (req, _res, next) => {
    next(new HttpError('NOT_FOUND', `No API route for ${req.method} ${req.originalUrl}`));
  });

  const onError: ErrorRequestHandler = (err: unknown, _req, res, _next) => {
    if (err instanceof HttpError) {
      res.status(err.status).json(errorBody(err.code, err.message, err.details ? { details: err.details } : {}));
      return;
    }
    // express.json() parse failures
    if (typeof err === 'object' && err && 'type' in err && (err as { type: string }).type === 'entity.parse.failed') {
      res.status(400).json(errorBody('BAD_REQUEST', 'Request body is not valid JSON'));
      return;
    }
    if (typeof err === 'object' && err && 'type' in err && (err as { type: string }).type === 'entity.too.large') {
      res.status(413).json(errorBody('BAD_REQUEST', 'Request body too large'));
      return;
    }
    logger.error('unhandled error', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json(errorBody('INTERNAL', 'Internal server error'));
  };
  app.use(onError);

  return app;
}
