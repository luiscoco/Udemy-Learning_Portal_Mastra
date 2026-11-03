import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// The configuration schema, secrets-from-files and deployment rules live in @mlp/deploy (L72), shared with
// the Configuration doctor lab. Re-exported here so the API keeps one import path.
export {
  ConfigError,
  ConfigSchema,
  describeConfig,
  loadDeployConfig,
  parseConfig,
  secretValues,
  type AppConfig,
} from '@mlp/deploy';

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
