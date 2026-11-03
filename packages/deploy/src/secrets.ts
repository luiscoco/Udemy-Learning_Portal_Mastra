import { readFileSync } from 'node:fs';
import { ConfigError, SECRET_KEYS, type SecretKey } from './schema.js';

export type SecretSource = 'env' | 'file' | 'unset';

const MAX_SECRET_BYTES = 16_384;

/**
 * Resolves <KEY>_FILE variables (Docker / Kubernetes secrets mounted as files) into <KEY>. Setting both forms,
 * or pointing at a missing, empty or oversized file, is an error. Messages name keys and paths' existence only,
 * never file contents.
 */
export function resolveSecretFiles(
  env: Record<string, string | undefined>,
  readFile: (path: string) => string = (p) => readFileSync(p, 'utf8'),
): { env: Record<string, string | undefined>; sources: Record<SecretKey, SecretSource> } {
  const out: Record<string, string | undefined> = { ...env };
  const sources = {} as Record<SecretKey, SecretSource>;
  const problems: { key: string; message: string }[] = [];
  for (const key of SECRET_KEYS) {
    const fileVar = `${key}_FILE`;
    const path = env[fileVar]?.trim();
    const direct = env[key]?.trim();
    delete out[fileVar];
    if (!path) {
      sources[key] = direct ? 'env' : 'unset';
      continue;
    }
    if (direct) {
      problems.push({ key, message: `set either ${key} or ${fileVar}, not both` });
      sources[key] = 'env';
      continue;
    }
    let content: string;
    try {
      content = readFile(path);
    } catch {
      problems.push({ key: fileVar, message: `${fileVar} points to a file that cannot be read` });
      sources[key] = 'unset';
      continue;
    }
    const value = content.trim();
    if (!value) problems.push({ key: fileVar, message: `${fileVar} points to an empty file` });
    else if (Buffer.byteLength(value) > MAX_SECRET_BYTES)
      problems.push({ key: fileVar, message: `${fileVar} is larger than 16 KB` });
    else {
      out[key] = value;
      sources[key] = 'file';
      continue;
    }
    sources[key] = 'unset';
  }
  if (problems.length > 0)
    throw new ConfigError(
      problems.map((p) => p.key),
      `Invalid secrets (${problems.map((p) => p.message).join('; ')})`,
    );
  return { env: out, sources };
}
