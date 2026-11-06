import { z } from 'zod';
import { maskSecret } from '@mlp/contracts';

const optionalSecret = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined));

const bool = (def: 'true' | 'false') =>
  z
    .enum(['true', 'false', '1', '0'])
    .default(def)
    .transform((v) => v === 'true' || v === '1');

const optionalOrigin = z
  .string()
  .trim()
  .optional()
  .transform((v) => v || undefined)
  .refine((value) => {
    if (value === undefined) return true;
    try {
      const url = new URL(value);
      return ['http:', 'https:'].includes(url.protocol) && url.origin === value;
    } catch {
      return false;
    }
  }, 'use one canonical http(s) origin without a path, credentials, query or wildcard');

/** Express "trust proxy": false, true (every hop), a hop count, or "loopback". */
const trustProxy = z
  .string()
  .trim()
  .default('false')
  .refine((v) => /^(false|true|loopback|[1-5])$/.test(v), 'use false, true, loopback or a hop count 1-5')
  .transform((v): boolean | number | 'loopback' =>
    v === 'true' ? true : v === 'false' ? false : v === 'loopback' ? 'loopback' : Number(v),
  );

/** Every key whose value is a secret. Each may also be supplied as <KEY>_FILE (a mounted secret file). */
export const SECRET_KEYS = [
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'GOOGLE_API_KEY',
  'GOOGLE_GENERATIVE_AI_API_KEY',
  'AUTH_SESSION_SECRET',
  'AUTH_DEV_PASSWORD',
  'AUDIT_HMAC_KEY',
  'AUTH_USERS',
  'RUN_STORE_SECRET',
] as const;
export type SecretKey = (typeof SECRET_KEYS)[number];

export const ConfigSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().min(1).default('127.0.0.1'),
    PORT: z.coerce.number().int().min(1).max(65535).default(8787),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'silent']).default('info'),
    /** One JSON access-log line per request (request id, method, path without query, status, duration). */
    LOG_REQUESTS: bool('true'),
    /** offline = deterministic mock models only; live = real providers allowed when keys exist. */
    MASTRA_MODE: z.enum(['offline', 'live']).default('offline'),
    CORS_ORIGIN: optionalOrigin,
    /** Local HTTP stays compatible; enable only after configuring the actual HTTPS proxy. */
    HTTP_REQUIRE_HTTPS: bool('false'),
    /** Set when a TLS-terminating proxy or load balancer sits in front (same-origin checks, secure cookies). */
    TRUST_PROXY: trustProxy,
    /** Where every durable store lives (a mounted volume in containers). Defaults to <repo>/.data. */
    MLP_DATA_DIR: z
      .string()
      .trim()
      .optional()
      .transform((v) => v || undefined),
    MAX_CONCURRENT_RUNS: z.coerce.number().int().min(1).max(100).default(4),
    RUN_RATE_WINDOW_MS: z.coerce.number().int().min(1000).max(3_600_000).default(60_000),
    RUN_START_RATE_USER_MAX: z.coerce.number().int().min(1).max(100_000).default(30),
    RUN_START_RATE_IP_MAX: z.coerce.number().int().min(1).max(100_000).default(120),
    RUN_CONTROL_RATE_USER_MAX: z.coerce.number().int().min(1).max(100_000).default(60),
    RUN_CONTROL_RATE_IP_MAX: z.coerce.number().int().min(1).max(100_000).default(240),
    RUN_STORE: z.enum(['memory', 'sqlite']).default('memory'),
    RUN_STORE_SECRET: optionalSecret.refine((v) => v === undefined || v.length >= 32, 'must be at least 32 characters'),
    RUN_MAX_TIMEOUT_MS: z.coerce.number().int().min(1000).max(300_000).default(120_000),
    SSE_DISCONNECT_GRACE_MS: z.coerce.number().int().min(0).max(60_000).default(5_000),
    /** Max runs that may wait for a human approval at once (they do not use MAX_CONCURRENT_RUNS slots). */
    MAX_PENDING_APPROVALS: z.coerce.number().int().min(1).max(200).default(20),
    /** How long a run waits for a human approval before auto-declining. */
    APPROVAL_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(1_800_000).default(300_000),
    SSE_HEARTBEAT_MS: z.coerce.number().int().min(1000).max(60_000).default(15_000),
    /** When set, the API also serves the built web app (apps/web/dist) on the same origin. */
    WEB_DIST_DIR: z.string().min(1).optional(),
    /** Identity provider: "dev" (local development only) or "password" (scrypt-hashed users, production-capable). */
    AUTH_PROVIDER: z.enum(['dev', 'password']).default('dev'),
    /** Automatically enter one local learner when no passcode is configured. */
    AUTH_LOCAL_AUTO_LOGIN: bool('true'),
    /** Comma-separated user names the development login accepts. */
    AUTH_DEV_USERS: z.string().trim().min(1).default('learner'),
    /** Optional shared passcode for the development login. */
    AUTH_DEV_PASSWORD: optionalSecret,
    /** Password login users: comma-separated "name:scrypt$N$r$p$salt$hash" entries (npm run auth:hash-user). */
    AUTH_USERS: optionalSecret,
    /** HMAC key for session ids (at least 32 characters); a random per-process key when unset. */
    AUTH_SESSION_SECRET: optionalSecret.refine((v) => v === undefined || v.length >= 32, 'must be at least 32 characters'),
    /** Persistent API sessions require a stable signing secret and a persistent data volume. */
    AUTH_SESSION_STORE: z.enum(['memory', 'sqlite']).default('memory'),
    /** Keys the L64 audit chains; without it a random key is generated once into .data/secrets. */
    AUDIT_HMAC_KEY: optionalSecret.refine((v) => v === undefined || v.length >= 32, 'must be at least 32 characters'),
    AUTH_SESSION_TTL_MS: z.coerce
      .number()
      .int()
      .min(60_000)
      .max(7 * 24 * 3_600_000)
      .default(8 * 3_600_000),
    /** Login attempts per client IP per minute. */
    AUTH_LOGIN_RATE_MAX: z.coerce.number().int().min(1).max(1_000).default(10),
    OPENAI_API_KEY: optionalSecret,
    ANTHROPIC_API_KEY: optionalSecret,
    GOOGLE_API_KEY: optionalSecret,
    GOOGLE_GENERATIVE_AI_API_KEY: optionalSecret,
  })
  .superRefine((config, ctx) => {
    if (config.HTTP_REQUIRE_HTTPS && config.TRUST_PROXY === true)
      ctx.addIssue({
        code: 'custom',
        path: ['TRUST_PROXY'],
        message: 'use an explicit proxy hop count or loopback when HTTPS is required',
      });
    if (config.HTTP_REQUIRE_HTTPS && config.CORS_ORIGIN?.startsWith('http:'))
      ctx.addIssue({ code: 'custom', path: ['CORS_ORIGIN'], message: 'must use HTTPS when HTTP_REQUIRE_HTTPS=true' });
    if (config.RUN_STORE === 'sqlite' && !config.RUN_STORE_SECRET)
      ctx.addIssue({
        code: 'custom',
        path: ['RUN_STORE_SECRET'],
        message: 'is required when RUN_STORE=sqlite (or use RUN_STORE_SECRET_FILE)',
      });
    if (config.AUTH_SESSION_STORE === 'sqlite' && !config.AUTH_SESSION_SECRET)
      ctx.addIssue({
        code: 'custom',
        path: ['AUTH_SESSION_SECRET'],
        message: 'is required when AUTH_SESSION_STORE=sqlite (or use AUTH_SESSION_SECRET_FILE)',
      });
  });

export type AppConfig = z.infer<typeof ConfigSchema>;

export class ConfigError extends Error {
  constructor(
    public readonly keys: string[],
    message: string,
  ) {
    super(message);
    this.name = 'ConfigError';
  }
}

/** Parses an env-like record. Error messages name keys only, never values. */
export function parseConfig(env: Record<string, string | undefined>): AppConfig {
  const result = ConfigSchema.safeParse(env);
  if (!result.success) {
    const keys = [...new Set(result.error.issues.map((i) => String(i.path[0] ?? '(root)')))];
    const detail = result.error.issues.map((i) => `${String(i.path[0] ?? '(root)')}: ${i.message}`).join('; ');
    throw new ConfigError(keys, `Invalid configuration (${detail})`);
  }
  return result.data;
}

export function secretValues(config: AppConfig): string[] {
  return SECRET_KEYS.map((k) => config[k]).filter((v): v is string => Boolean(v));
}

/** Number of entries in AUTH_USERS (the hashes themselves are never shown). */
const userCount = (v: string | undefined) => (v ? `${v.split(',').filter((x) => x.trim()).length} user(s)` : '(unset)');

/** Safe-to-log view of the configuration. */
export function describeConfig(config: AppConfig): Record<string, string | number | boolean> {
  return {
    NODE_ENV: config.NODE_ENV,
    HOST: config.HOST,
    PORT: config.PORT,
    LOG_LEVEL: config.LOG_LEVEL,
    LOG_REQUESTS: config.LOG_REQUESTS,
    MASTRA_MODE: config.MASTRA_MODE,
    RUN_STORE: config.RUN_STORE,
    RUN_RATE_WINDOW_MS: config.RUN_RATE_WINDOW_MS,
    RUN_START_RATE_USER_MAX: config.RUN_START_RATE_USER_MAX,
    RUN_START_RATE_IP_MAX: config.RUN_START_RATE_IP_MAX,
    RUN_CONTROL_RATE_USER_MAX: config.RUN_CONTROL_RATE_USER_MAX,
    RUN_CONTROL_RATE_IP_MAX: config.RUN_CONTROL_RATE_IP_MAX,
    RUN_STORE_SECRET: maskSecret(config.RUN_STORE_SECRET),
    TRUST_PROXY: String(config.TRUST_PROXY),
    HTTP_REQUIRE_HTTPS: config.HTTP_REQUIRE_HTTPS,
    CORS_ORIGIN: config.CORS_ORIGIN ?? '(same origin)',
    MLP_DATA_DIR: config.MLP_DATA_DIR ?? '(default .data)',
    AUTH_PROVIDER: config.AUTH_PROVIDER,
    AUTH_LOCAL_AUTO_LOGIN: config.AUTH_LOCAL_AUTO_LOGIN,
    AUTH_DEV_USERS: config.AUTH_DEV_USERS,
    AUTH_DEV_PASSWORD: maskSecret(config.AUTH_DEV_PASSWORD),
    AUTH_USERS: userCount(config.AUTH_USERS),
    AUTH_SESSION_SECRET: maskSecret(config.AUTH_SESSION_SECRET),
    AUTH_SESSION_STORE: config.AUTH_SESSION_STORE,
    AUDIT_HMAC_KEY: maskSecret(config.AUDIT_HMAC_KEY),
    OPENAI_API_KEY: maskSecret(config.OPENAI_API_KEY),
    ANTHROPIC_API_KEY: maskSecret(config.ANTHROPIC_API_KEY),
    GOOGLE_API_KEY: maskSecret(config.GOOGLE_API_KEY),
    GOOGLE_GENERATIVE_AI_API_KEY: maskSecret(config.GOOGLE_GENERATIVE_AI_API_KEY),
  };
}
