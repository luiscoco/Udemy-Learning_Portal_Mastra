import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { maskSecret } from '@mlp/contracts';

const optionalSecret = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined));

export const ConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'silent']).default('info'),
  /** offline = deterministic mock models only; live = real providers allowed when keys exist. */
  MASTRA_MODE: z.enum(['offline', 'live']).default('offline'),
  CORS_ORIGIN: z.string().optional(),
  MAX_CONCURRENT_RUNS: z.coerce.number().int().min(1).max(100).default(4),
  RUN_MAX_TIMEOUT_MS: z.coerce.number().int().min(1000).max(300_000).default(120_000),
  SSE_DISCONNECT_GRACE_MS: z.coerce.number().int().min(0).max(60_000).default(5_000),
  /** How long a run waits for a human approval before auto-declining. */
  /** Max runs that may wait for a human approval at once (they do not use MAX_CONCURRENT_RUNS slots). */
  MAX_PENDING_APPROVALS: z.coerce.number().int().min(1).max(200).default(20),
  APPROVAL_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(1_800_000).default(300_000),
  SSE_HEARTBEAT_MS: z.coerce.number().int().min(1000).max(60_000).default(15_000),
  /** When set, the API also serves the built web app (apps/web/dist) on the same origin. */
  WEB_DIST_DIR: z.string().min(1).optional(),
  /** Identity provider. Only the development provider exists; production needs a real one (docs/AUTH.md). */
  AUTH_PROVIDER: z.enum(['dev']).default('dev'),
  /** Comma-separated user names the development login accepts. */
  AUTH_DEV_USERS: z.string().trim().min(1).default('learner'),
  /** Optional shared passcode for the development login. */
  AUTH_DEV_PASSWORD: optionalSecret,
  /** HMAC key for session ids (at least 32 characters); a random per-process key when unset. */
  AUTH_SESSION_SECRET: optionalSecret.refine((v) => v === undefined || v.length >= 32, 'must be at least 32 characters'),
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

/** Loads .env from the working directory or the repo root (Node built-in loader), without overriding real env vars. */
export function loadDotEnv(cwd = process.cwd()): string | undefined {
  for (const candidate of [resolve(cwd, '.env'), resolve(cwd, '../../.env')]) {
    if (existsSync(candidate)) {
      process.loadEnvFile(candidate);
      return candidate;
    }
  }
  return undefined;
}

export function secretValues(config: AppConfig): string[] {
  return [
    config.OPENAI_API_KEY,
    config.ANTHROPIC_API_KEY,
    config.GOOGLE_API_KEY,
    config.GOOGLE_GENERATIVE_AI_API_KEY,
    config.AUTH_SESSION_SECRET,
    config.AUTH_DEV_PASSWORD,
  ].filter((v): v is string => Boolean(v));
}

/** Safe-to-log view of the configuration. */
export function describeConfig(config: AppConfig): Record<string, string | number> {
  return {
    NODE_ENV: config.NODE_ENV,
    HOST: config.HOST,
    PORT: config.PORT,
    LOG_LEVEL: config.LOG_LEVEL,
    MASTRA_MODE: config.MASTRA_MODE,
    AUTH_PROVIDER: config.AUTH_PROVIDER,
    AUTH_DEV_USERS: config.AUTH_DEV_USERS,
    AUTH_DEV_PASSWORD: maskSecret(config.AUTH_DEV_PASSWORD),
    AUTH_SESSION_SECRET: maskSecret(config.AUTH_SESSION_SECRET),
    OPENAI_API_KEY: maskSecret(config.OPENAI_API_KEY),
    ANTHROPIC_API_KEY: maskSecret(config.ANTHROPIC_API_KEY),
    GOOGLE_API_KEY: maskSecret(config.GOOGLE_API_KEY),
    GOOGLE_GENERATIVE_AI_API_KEY: maskSecret(config.GOOGLE_GENERATIVE_AI_API_KEY),
  };
}
