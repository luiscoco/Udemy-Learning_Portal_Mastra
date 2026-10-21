import type { IdentityProvider } from './providers.js';

export const SESSION_COOKIE = 'mlp_session';

/** Parses a Cookie header into name → value (first occurrence wins; values are not decoded further). */
export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const name = part.slice(0, eq).trim();
    if (name && !(name in out)) out[name] = part.slice(eq + 1).trim();
  }
  return out;
}

/**
 * The session cookie: HttpOnly (no script access), SameSite=Strict (not sent on cross-site requests),
 * Path=/api (only the API sees it), Secure when served over HTTPS / in production.
 */
export function serializeCookie(value: string, opts: { maxAgeSeconds: number; secure: boolean }): string {
  return [
    `${SESSION_COOKIE}=${value}`,
    'Path=/api',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${Math.max(0, Math.floor(opts.maxAgeSeconds))}`,
    ...(opts.secure ? ['Secure'] : []),
  ].join('; ');
}
export const clearCookie = (secure: boolean) => serializeCookie('', { maxAgeSeconds: 0, secure });

/**
 * CSRF defence for cookie-authenticated unsafe requests, on top of SameSite=Strict: a browser sends Origin
 * on cross-origin POSTs, so a present Origin must match the request's Host.
 */
export function sameOriginOrAbsent(origin: string | undefined, host: string | undefined, protocol = 'http'): boolean {
  if (origin === undefined) return true;
  try {
    return !!host && new URL(origin).origin === `${protocol}://${host}`;
  } catch {
    return false;
  }
}

/** Fixed-window attempt limiter (per key, e.g. client IP). */
export class LoginRateLimiter {
  readonly #hits = new Map<string, { count: number; windowStart: number }>();
  constructor(readonly opts: { max: number; windowMs: number; now?: () => number }) {}

  /** Records an attempt; false when the key is over the limit for the current window. */
  take(key: string): boolean {
    const now = (this.opts.now ?? Date.now)();
    const h = this.#hits.get(key);
    if (!h || now - h.windowStart >= this.opts.windowMs) {
      this.#hits.set(key, { count: 1, windowStart: now });
      if (this.#hits.size > 10_000) this.#hits.delete(this.#hits.keys().next().value!);
      return true;
    }
    h.count++;
    return h.count <= this.opts.max;
  }
}

export class AuthConfigError extends Error {
  override name = 'AuthConfigError';
}

const LOOPBACK = new Set(['127.0.0.1', '::1', 'localhost']);

/**
 * Fail closed at startup: a provider that is not production-grade is refused in production, and dev login
 * is only served on a loopback host.
 */
export function assertSafeAuthConfig(opts: { nodeEnv: string; host: string; provider: IdentityProvider }): void {
  if (opts.nodeEnv === 'production' && !opts.provider.production)
    throw new AuthConfigError(
      `The "${opts.provider.id}" identity provider is for development only and is refused in production. Configure a production IdentityProvider (see docs/AUTH.md).`,
    );
  if (!opts.provider.production && !LOOPBACK.has(opts.host))
    throw new AuthConfigError(
      `Development login is only allowed on a loopback host (127.0.0.1, ::1, localhost); HOST is "${opts.host}".`,
    );
}
