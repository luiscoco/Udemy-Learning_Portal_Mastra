import { Router, type RequestHandler } from 'express';
import {
  assertSafeAuthConfig,
  clearCookie,
  DevIdentityProvider,
  LoginRateLimiter,
  parseCookies,
  randomSecret,
  sameOriginOrAbsent,
  serializeCookie,
  SESSION_COOKIE,
  SessionManager,
  type Principal,
  type Session,
} from '@mlp/auth';
import { LoginRequestSchema, type SessionResponse } from '@mlp/contracts';
import { LabError } from '@mlp/lab-engine';
import type { AppConfig } from './config.js';
import type { Logger } from './logger.js';

declare module 'express-serve-static-core' {
  interface Request {
    /** The authenticated learner, when the request carries a valid session cookie. */
    principal?: Principal;
    authSession?: Session;
  }
}

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export interface Auth {
  provider: DevIdentityProvider;
  sessions: SessionManager;
  /** Attaches req.principal from the session cookie and enforces same-origin unsafe requests. */
  middleware: RequestHandler;
  router: Router;
}

/** Throws UNAUTHORIZED unless the request is authenticated. */
export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.principal) throw new LabError('UNAUTHORIZED', 'Sign in to run labs.');
  next();
};

/**
 * Builds the auth boundary from the configuration. Refuses unsafe setups at startup (development login in
 * production or on a non-loopback host).
 */
export function createAuth(config: AppConfig, logger: Logger): Auth {
  const provider = new DevIdentityProvider({ users: config.AUTH_DEV_USERS.split(','), password: config.AUTH_DEV_PASSWORD });
  assertSafeAuthConfig({ nodeEnv: config.NODE_ENV, host: config.HOST, provider });
  const sessions = new SessionManager({
    secret: config.AUTH_SESSION_SECRET ?? randomSecret(),
    ttlMs: config.AUTH_SESSION_TTL_MS,
  });
  const limiter = new LoginRateLimiter({ max: config.AUTH_LOGIN_RATE_MAX, windowMs: 60_000 });
  const secure = config.NODE_ENV === 'production';

  const middleware: RequestHandler = (req, _res, next) => {
    if (UNSAFE.has(req.method) && !sameOriginOrAbsent(req.header('origin'), req.header('host'), req.protocol))
      throw new LabError('FORBIDDEN', 'Cross-origin requests are not allowed.');
    const session = sessions.verify(parseCookies(req.header('cookie'))[SESSION_COOKIE]);
    if (session) {
      req.principal = session.principal;
      req.authSession = session;
    }
    next();
  };

  const view = (session: Session | undefined): SessionResponse => ({
    authenticated: !!session,
    principal: session ? { ...session.principal } : null,
    provider: provider.id,
    login: { kind: 'dev', passwordRequired: provider.passwordRequired },
    expiresAt: session ? new Date(session.expiresAt).toISOString() : null,
  });

  const router = Router();
  router.get('/session', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(view(req.authSession));
  });
  router.post('/login', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!limiter.take(req.ip ?? 'unknown')) throw new LabError('TOO_MANY_REQUESTS', 'Too many sign-in attempts; wait a minute.');
    const body = LoginRequestSchema.safeParse(req.body ?? {});
    // One generic message for every failure: no hint whether the user or the passcode was wrong.
    const principal = body.success ? await provider.authenticate(body.data) : null;
    if (!principal) {
      logger.warn('sign-in refused', { requestId: req.requestId });
      throw new LabError('UNAUTHORIZED', 'Invalid user name or passcode.');
    }
    if (req.authSession) sessions.revoke(req.authSession.sid);
    const { cookieValue, session } = sessions.create(principal);
    res.setHeader('Set-Cookie', serializeCookie(cookieValue, { maxAgeSeconds: sessions.ttlMs / 1000, secure }));
    logger.info('signed in', { requestId: req.requestId, sub: principal.sub });
    res.json(view(session));
  });
  router.post('/logout', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.authSession) sessions.revoke(req.authSession.sid);
    res.setHeader('Set-Cookie', clearCookie(secure));
    res.json(view(undefined));
  });

  return { provider, sessions, middleware, router };
}
