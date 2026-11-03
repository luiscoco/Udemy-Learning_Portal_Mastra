import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

/** Who is making a request, as established by an identity provider. */
export interface Principal {
  /** Stable subject id (the learner). */
  sub: string;
  name: string;
  /** The provider that authenticated this principal. */
  provider: string;
}

export interface Credentials {
  username: string;
  password?: string;
}

/**
 * The authentication boundary. A production deployment implements this with a real identity provider
 * (OIDC / SSO) and marks it `production: true`; the server refuses to start in production with any
 * provider that is not.
 */
export interface IdentityProvider {
  readonly id: string;
  /** Whether this provider may be used with NODE_ENV=production. */
  readonly production: boolean;
  /** Returns the principal, or null for unknown users and wrong credentials alike (no user enumeration). */
  authenticate(credentials: Credentials): Promise<Principal | null>;
}

/** Constant-time string comparison (hashes first, so lengths do not leak through timing). */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a, 'utf8').digest();
  const hb = createHash('sha256').update(b, 'utf8').digest();
  return timingSafeEqual(ha, hb);
}

export const USERNAME = /^[a-z0-9._-]{1,64}$/;

/**
 * Development login: an allowlist of user names, optionally with one shared passcode. It is not a
 * production identity provider (no real accounts, no MFA), so it declares `production: false`.
 */
export class DevIdentityProvider implements IdentityProvider {
  readonly id = 'dev';
  readonly production = false;
  readonly #users: ReadonlySet<string>;
  readonly #password: string | undefined;

  constructor(opts: { users: readonly string[]; password?: string }) {
    const users = opts.users.map((u) => u.trim().toLowerCase()).filter(Boolean);
    if (users.length === 0) throw new Error('DevIdentityProvider needs at least one user');
    for (const u of users) if (!USERNAME.test(u)) throw new Error(`Invalid dev user name "${u}"`);
    this.#users = new Set(users);
    this.#password = opts.password || undefined;
  }

  get passwordRequired(): boolean {
    return this.#password !== undefined;
  }

  async authenticate({ username, password }: Credentials): Promise<Principal | null> {
    const name = username.trim().toLowerCase();
    // Evaluate both conditions every time, so a wrong user and a wrong passcode cost the same.
    const known = this.#users.has(name);
    const passOk = this.#password === undefined ? true : safeEqual(password ?? '', this.#password);
    if (!known || !passOk) return null;
    return { sub: `dev:${name}`, name, provider: this.id };
  }
}

const SCRYPT = { N: 16_384, r: 8, p: 1, keylen: 32 } as const;
const ENTRY = /^([a-z0-9._-]{1,64}):scrypt\$(\d{4,7})\$(\d{1,2})\$(\d{1,2})\$([A-Za-z0-9_-]{16,64})\$([A-Za-z0-9_-]{40,90})$/;

function scryptAsync(password: string, salt: Buffer, o: { N: number; r: number; p: number; keylen: number }): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, o.keylen, { N: o.N, r: o.r, p: o.p, maxmem: 128 * o.N * o.r * 2 }, (err, key) =>
      err ? reject(err) : resolve(key),
    ),
  );
}

/** Creates one AUTH_USERS entry: `name:scrypt$N$r$p$salt$hash` (salt and hash base64url). */
export async function hashUserEntry(name: string, password: string): Promise<string> {
  const user = name.trim().toLowerCase();
  if (!USERNAME.test(user)) throw new Error('Invalid user name (use a-z, 0-9, ., _ or -, at most 64)');
  if (password.length < 12) throw new Error('Use a password of at least 12 characters');
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, SCRYPT);
  return `${user}:scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

interface StoredUser {
  N: number;
  r: number;
  p: number;
  salt: Buffer;
  hash: Buffer;
}

/**
 * Password login with scrypt-hashed users from configuration (AUTH_USERS, usually a mounted secret file).
 * Production-capable for small deployments: no plaintext passwords, constant-time comparison, and the same
 * work for unknown users as for known ones. Larger deployments should use an OIDC adapter (docs/AUTH.md).
 */
export class PasswordIdentityProvider implements IdentityProvider {
  readonly id = 'password';
  readonly production = true;
  readonly passwordRequired = true;
  readonly #users = new Map<string, StoredUser>();
  readonly #dummy: StoredUser = { ...SCRYPT, salt: Buffer.alloc(16, 1), hash: Buffer.alloc(32) };

  constructor(opts: { users: string }) {
    for (const raw of opts.users
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)) {
      const m = ENTRY.exec(raw);
      // Never echo the entry: it holds a password hash.
      if (!m)
        throw new Error(`AUTH_USERS has an invalid entry (#${this.#users.size + 1}); create entries with npm run auth:hash-user`);
      const N = Number(m[2]);
      if (N < 16_384 || (N & (N - 1)) !== 0) throw new Error('AUTH_USERS: scrypt N must be a power of two of at least 16384');
      this.#users.set(m[1]!, {
        N,
        r: Number(m[3]),
        p: Number(m[4]),
        salt: Buffer.from(m[5]!, 'base64url'),
        hash: Buffer.from(m[6]!, 'base64url'),
      });
    }
    if (this.#users.size === 0) throw new Error('AUTH_USERS has no users');
  }

  async authenticate({ username, password }: Credentials): Promise<Principal | null> {
    const name = username.trim().toLowerCase();
    const user = this.#users.get(name);
    const stored = user ?? this.#dummy;
    const key = await scryptAsync(password ?? '', stored.salt, {
      N: stored.N,
      r: stored.r,
      p: stored.p,
      keylen: stored.hash.length,
    });
    const ok = timingSafeEqual(key, stored.hash);
    if (!user || !ok) return null;
    return { sub: `password:${name}`, name, provider: this.id };
  }
}
