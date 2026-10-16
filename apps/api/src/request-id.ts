import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

const SAFE_ID = /^[\w.-]{1,64}$/;

declare module 'express-serve-static-core' {
  interface Request {
    requestId: string;
    correlationId: string;
  }
}

/** Accepts safe incoming x-request-id / x-correlation-id headers or generates new ones; echoes both. */
export const requestIds: RequestHandler = (req, res, next) => {
  const incoming = req.header('x-request-id');
  const requestId = incoming && SAFE_ID.test(incoming) ? incoming : randomUUID();
  const corr = req.header('x-correlation-id');
  const correlationId = corr && SAFE_ID.test(corr) ? corr : requestId;
  req.requestId = requestId;
  req.correlationId = correlationId;
  res.setHeader('x-request-id', requestId);
  res.setHeader('x-correlation-id', correlationId);
  next();
};
