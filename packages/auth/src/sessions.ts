import { createHmac, randomBytes } from 'node:crypto';
import type { Principal } from './providers.js';
import { safeEqual } from './providers.js';

export interface Session {
  sid: string;
  principal: Principal;
  createdAt: number;
  expiresAt: number;
}

export interface SessionManagerOptions {
  /** HMAC key, at least 32 characters. */
  secret: string;
  ttlMs: number;
  /** Injectable clock (tests, lab 61). */
  now?: () => number;
  maxSessions?: number;
}

const b64url = (b: Buffer) => b.toString('base64url');

const signId = (secret: string, sid: string) => b64url(createHmac('sha256', secret).update(sid).digest());

/** Shared opaque cookie format for synchronous teaching sessions and persistent API sessions. */
export function createSessionCookie(secret: string): { sid: string; cookieValue: string } {
  const sid = b64url(randomBytes(32));
  return { sid, cookieValue: `${sid}.${signId(secret, sid)}` };
}

export function sessionIdFromCookie(secret: string, value: string | undefined): string | null {
  if (!value || !/^[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/.test(value)) return null;
  const [sid, signature] = value.split('.') as [string, string];
  return safeEqual(signature, signId(secret, sid)) ? sid : null;
}

/**
 * Server-side sessions behind a signed opaque id. The cookie carries `<sid>.<HMAC(sid)>` only: no claims,
 * nothing to decode. A forged or altered value fails the constant-time signature check; an expired or
 * revoked session is gone from the store. The store is in memory (one process; lost on restart).
 */
export class SessionManager {
  readonly #secret: string;
  readonly #ttlMs: number;
  readonly #now: () => number;
  readonly #max: number;
  readonly #sessions = new Map<string, Session>();

  constructor(opts: SessionManagerOptions) {
    if (opts.secret.length < 32) throw new Error('Session secret must be at least 32 characters');
    if (!Number.isSafeInteger(opts.ttlMs) || opts.ttlMs < 1_000) throw new Error('Session TTL must be at least 1 s');
    if (opts.maxSessions !== undefined && (!Number.isSafeInteger(opts.maxSessions) || opts.maxSessions < 1))
      throw new Error('maxSessions must be a positive integer');
    this.#secret = opts.secret;
    this.#ttlMs = opts.ttlMs;
    this.#now = opts.now ?? Date.now;
    this.#max = opts.maxSessions ?? 10_000;
  }

  get ttlMs(): number {
    return this.#ttlMs;
  }

  #purge(): void {
    const now = this.#now();
    for (const [sid, s] of this.#sessions) if (s.expiresAt <= now) this.#sessions.delete(sid);
    // Bound memory: drop the oldest sessions beyond the cap.
    while (this.#sessions.size >= this.#max) this.#sessions.delete(this.#sessions.keys().next().value!);
  }

  create(principal: Principal): { cookieValue: string; session: Session } {
    this.#purge();
    const { sid, cookieValue } = createSessionCookie(this.#secret);
    const now = this.#now();
    const session: Session = { sid, principal, createdAt: now, expiresAt: now + this.#ttlMs };
    this.#sessions.set(sid, session);
    return { cookieValue, session };
  }

  /** The live session for a cookie value, or null when it is malformed, forged, expired or revoked. */
  verify(cookieValue: string | undefined): Session | null {
    const sid = sessionIdFromCookie(this.#secret, cookieValue);
    if (!sid) return null;
    const s = this.#sessions.get(sid);
    if (!s) return null;
    if (s.expiresAt <= this.#now()) {
      this.#sessions.delete(sid);
      return null;
    }
    return s;
  }

  revoke(sid: string): boolean {
    return this.#sessions.delete(sid);
  }

  get size(): number {
    return this.#sessions.size;
  }
}

/** A random per-process secret, for when none is configured (sessions then end with the process). */
export const randomSecret = () => b64url(randomBytes(48));
