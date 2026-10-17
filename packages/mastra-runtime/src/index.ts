import { createRequire } from 'node:module';

export * from './scripted-model.js';
export * from './models.js';
export * from './memory-store.js';
export * from './vector-tools.js';

const require = createRequire(import.meta.url);

/**
 * Returns the installed @mastra/core version by reading its package.json.
 * Server-only: this package must never be imported by apps/web.
 */
export function getMastraVersion(): string {
  try {
    const pkg = require('@mastra/core/package.json') as { version?: string };
    return pkg.version ?? 'unknown';
  } catch {
    return 'not installed';
  }
}
