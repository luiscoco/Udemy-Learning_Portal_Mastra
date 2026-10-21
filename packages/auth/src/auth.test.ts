import { describe, expect, it } from 'vitest';
import {
  assertSafeAuthConfig,
  AuthConfigError,
  DevIdentityProvider,
  LoginRateLimiter,
  parseCookies,
  sameOriginOrAbsent,
  serializeCookie,
  SessionManager,
} from './index.js';

const SECRET = 'x'.repeat(40);

describe('DevIdentityProvider', () => {
  it('accepts allowlisted users and refuses unknown users and wrong passcodes alike', async () => {
    const open = new DevIdentityProvider({ users: ['learner', 'Alice'] });
    expect(await open.authenticate({ username: 'Alice ' })).toEqual({ sub: 'dev:alice', name: 'alice', provider: 'dev' });
    expect(await open.authenticate({ username: 'mallory' })).toBeNull();
    const locked = new DevIdentityProvider({ users: ['learner'], password: 'hunter22' });
    expect(locked.passwordRequired).toBe(true);
    expect(await locked.authenticate({ username: 'learner', password: 'hunter22' })).not.toBeNull();
    expect(await locked.authenticate({ username: 'learner', password: 'wrong' })).toBeNull();
    expect(await locked.authenticate({ username: 'learner' })).toBeNull();
    expect(() => new DevIdentityProvider({ users: ['Bad Name!'] })).toThrow('Invalid dev user name');
  });
});

describe('SessionManager', () => {
  it('signs opaque ids, refuses tampering, expiry and revocation', () => {
    let now = 1_000;
    const sm = new SessionManager({ secret: SECRET, ttlMs: 60_000, now: () => now });
    const { cookieValue, session } = sm.create({ sub: 'dev:learner', name: 'learner', provider: 'dev' });
    expect(cookieValue).toMatch(/^[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/);
    expect(sm.verify(cookieValue)?.principal.sub).toBe('dev:learner');
    const [sid, sig] = cookieValue.split('.') as [string, string];
    expect(sm.verify(`${sid}.${sig.slice(0, -1)}${sig.endsWith('A') ? 'B' : 'A'}`)).toBeNull();
    expect(sm.verify(`${sid}x.${sig}`)).toBeNull();
    expect(sm.verify(undefined)).toBeNull();
    expect(new SessionManager({ secret: 'y'.repeat(40), ttlMs: 60_000 }).verify(cookieValue)).toBeNull(); // other secret
    now += 60_000;
    expect(sm.verify(cookieValue)).toBeNull(); // expired
    const again = sm.create(session.principal);
    expect(sm.revoke(again.session.sid)).toBe(true);
    expect(sm.verify(again.cookieValue)).toBeNull(); // revoked
    expect(() => new SessionManager({ secret: 'short', ttlMs: 60_000 })).toThrow('at least 32');
  });
});

describe('HTTP helpers', () => {
  it('serialises a hardened cookie and parses cookie headers', () => {
    expect(serializeCookie('v', { maxAgeSeconds: 60, secure: false })).toBe(
      'mlp_session=v; Path=/api; HttpOnly; SameSite=Strict; Max-Age=60',
    );
    expect(serializeCookie('v', { maxAgeSeconds: 60, secure: true })).toMatch(/; Secure$/);
    expect(parseCookies('a=1; mlp_session=abc.def; a=2')).toEqual({ a: '1', mlp_session: 'abc.def' });
  });
  it('checks the origin of unsafe requests', () => {
    expect(sameOriginOrAbsent(undefined, '127.0.0.1:8787')).toBe(true);
    expect(sameOriginOrAbsent('http://127.0.0.1:8787', '127.0.0.1:8787')).toBe(true);
    expect(sameOriginOrAbsent('https://evil.example', '127.0.0.1:8787')).toBe(false);
    expect(sameOriginOrAbsent('not a url', '127.0.0.1:8787')).toBe(false);
    expect(sameOriginOrAbsent('', '127.0.0.1:8787')).toBe(false);
    expect(sameOriginOrAbsent('null', '127.0.0.1:8787')).toBe(false);
    expect(sameOriginOrAbsent('https://127.0.0.1:8787', '127.0.0.1:8787')).toBe(false);
    expect(sameOriginOrAbsent('https://example.com', 'example.com', 'https')).toBe(true);
  });
  it('rate-limits attempts per key in a fixed window', () => {
    let now = 0;
    const rl = new LoginRateLimiter({ max: 2, windowMs: 1_000, now: () => now });
    expect([rl.take('ip'), rl.take('ip'), rl.take('ip'), rl.take('other')]).toEqual([true, true, false, true]);
    now = 1_000;
    expect(rl.take('ip')).toBe(true);
  });
  it('fails closed on unsafe configurations', () => {
    const dev = new DevIdentityProvider({ users: ['learner'] });
    expect(() => assertSafeAuthConfig({ nodeEnv: 'production', host: '127.0.0.1', provider: dev })).toThrow(AuthConfigError);
    expect(() => assertSafeAuthConfig({ nodeEnv: 'development', host: '0.0.0.0', provider: dev })).toThrow('loopback');
    expect(() => assertSafeAuthConfig({ nodeEnv: 'development', host: '127.0.0.1', provider: dev })).not.toThrow();
    const prod = { id: 'oidc', production: true, authenticate: async () => null };
    expect(() => assertSafeAuthConfig({ nodeEnv: 'production', host: '0.0.0.0', provider: prod })).not.toThrow();
  });
});
