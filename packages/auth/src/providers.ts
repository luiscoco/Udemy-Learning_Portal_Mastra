import { createHash, timingSafeEqual } from 'node:crypto';

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
