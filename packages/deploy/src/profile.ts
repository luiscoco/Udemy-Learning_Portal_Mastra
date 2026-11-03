import { isAbsolute } from 'node:path';
import { ConfigError, parseConfig, type AppConfig, type SecretKey } from './schema.js';
import { resolveSecretFiles, type SecretSource } from './secrets.js';

export interface ConfigFinding {
  key: string;
  message: string;
}

const PROVIDER_KEYS = ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GOOGLE_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY'] as const;
const required = (key: string) => `${key} is required in production (set ${key} or ${key}_FILE)`;

/**
 * Deployment rules on top of the schema. `problems` refuse start-up; `warnings` are accepted but logged
 * (typical development shortcuts that would hurt in production).
 */
export function deploymentProblems(config: AppConfig): { problems: ConfigFinding[]; warnings: ConfigFinding[] } {
  const problems: ConfigFinding[] = [];
  const warnings: ConfigFinding[] = [];
  const prod = config.NODE_ENV === 'production';
  const add = (list: ConfigFinding[], key: string, message: string) => list.push({ key, message });

  if (prod) {
    if (config.AUTH_PROVIDER !== 'password')
      add(problems, 'AUTH_PROVIDER', 'the development login is refused in production: set AUTH_PROVIDER=password and AUTH_USERS');
    if (config.AUTH_PROVIDER === 'password' && !config.AUTH_USERS) add(problems, 'AUTH_USERS', required('AUTH_USERS'));
    if (!config.AUTH_SESSION_SECRET) add(problems, 'AUTH_SESSION_SECRET', required('AUTH_SESSION_SECRET'));
    if (!config.AUDIT_HMAC_KEY) add(problems, 'AUDIT_HMAC_KEY', required('AUDIT_HMAC_KEY'));
    if (!config.MLP_DATA_DIR)
      add(problems, 'MLP_DATA_DIR', 'MLP_DATA_DIR is required in production (an absolute path on a persistent volume)');
    else if (!isAbsolute(config.MLP_DATA_DIR)) add(problems, 'MLP_DATA_DIR', 'MLP_DATA_DIR must be an absolute path');
    if (config.AUTH_DEV_PASSWORD) add(warnings, 'AUTH_DEV_PASSWORD', 'AUTH_DEV_PASSWORD is ignored by the password provider');
  } else {
    if (config.AUTH_PROVIDER === 'password' && !config.AUTH_USERS)
      add(problems, 'AUTH_USERS', 'AUTH_PROVIDER=password needs AUTH_USERS');
    if (!config.AUTH_SESSION_SECRET)
      add(warnings, 'AUTH_SESSION_SECRET', 'unset: a random per-process key is used, so sessions end on every restart');
    if (!config.AUDIT_HMAC_KEY) add(warnings, 'AUDIT_HMAC_KEY', 'unset: a key is generated once into the data directory');
  }
  if (config.MASTRA_MODE === 'live' && !PROVIDER_KEYS.some((k) => config[k]))
    add(
      prod ? problems : warnings,
      'MASTRA_MODE',
      'MASTRA_MODE=live needs at least one provider key (OPENAI_API_KEY, ANTHROPIC_API_KEY or GOOGLE_API_KEY)',
    );
  if (config.HOST !== '127.0.0.1' && config.HOST !== 'localhost' && config.HOST !== '::1' && config.TRUST_PROXY === false && prod)
    add(
      warnings,
      'TRUST_PROXY',
      'HOST is public and TRUST_PROXY=false: behind a TLS proxy, set TRUST_PROXY so origins and secure cookies are right',
    );
  return { problems, warnings };
}

export interface DeployConfig {
  config: AppConfig;
  sources: Record<SecretKey, SecretSource>;
  warnings: ConfigFinding[];
}

/**
 * Secrets from files, schema validation and deployment rules, in that order. Throws one ConfigError that lists
 * every problem by key (never a value); the server prints it and exits.
 */
export function loadDeployConfig(
  env: Record<string, string | undefined>,
  opts: { readFile?: (path: string) => string } = {},
): DeployConfig {
  const { env: resolved, sources } = resolveSecretFiles(env, opts.readFile);
  const config = parseConfig(resolved);
  const { problems, warnings } = deploymentProblems(config);
  if (problems.length > 0)
    throw new ConfigError(
      [...new Set(problems.map((p) => p.key))],
      `Refusing to start (NODE_ENV=${config.NODE_ENV}): ${problems.map((p) => p.message).join('; ')}`,
    );
  return { config, sources, warnings };
}
