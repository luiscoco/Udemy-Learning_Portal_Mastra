import type { RequestHandler } from 'express';
import { LabError } from '@mlp/lab-engine';
import { sameOriginOrAbsent } from '@mlp/auth';
import type { AppConfig } from './config.js';

export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'none'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "media-src 'self' blob: data:",
  "worker-src 'self' blob:",
].join('; ');
const METHODS = new Set(['GET', 'POST', 'OPTIONS']);
const HEADERS = new Set([
  'content-type',
  'x-run-token',
  'x-run-subject',
  'x-progress-subject',
  'last-event-id',
  'x-request-id',
  'x-correlation-id',
]);

/** Headers apply even to parser/auth errors; preflights never execute protected route actions. */
export function httpSecurity(config: AppConfig): RequestHandler {
  return (req, res, next) => {
    res.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), geolocation=(), microphone=(self)');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    const probe = req.method === 'GET' && ['/api/health', '/api/ready'].includes(req.path);
    if (config.HTTP_REQUIRE_HTTPS && !req.secure && !probe)
      throw new LabError('FORBIDDEN', 'HTTPS is required. Use the configured secure application address.');

    if (req.path === '/api' || req.path.startsWith('/api/')) {
      const origin = req.header('origin');
      res.vary('Origin');
      if (origin && !sameOriginOrAbsent(origin, req.header('host'), req.protocol, config.CORS_ORIGIN))
        throw new LabError('FORBIDDEN', 'Cross-origin requests are not allowed.');
      if (req.method === 'OPTIONS' && origin && req.header('access-control-request-method')) {
        const method = req.header('access-control-request-method')!;
        const requested = (req.header('access-control-request-headers') ?? '')
          .split(',')
          .map((h) => h.trim().toLowerCase())
          .filter(Boolean);
        if (!METHODS.has(method) || requested.length > HEADERS.size || requested.some((h) => !HEADERS.has(h)))
          throw new LabError('FORBIDDEN', 'Preflight method or headers are not allowed.');
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', [...HEADERS].join(', '));
        res.setHeader('Cache-Control', 'no-store');
        res.status(204).end();
        return;
      }
      if (origin && config.CORS_ORIGIN === origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
      }
    }
    next();
  };
}
