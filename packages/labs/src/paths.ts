import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);

/** Absolute directory of the @mlp/labs package (works from source and from the API bundle). */
export function labsPackageDir(): string {
  return dirname(require.resolve('@mlp/labs/package.json'));
}

/** Absolute directory of a lab's reference source. */
export function labSourceDir(labId: string): string {
  if (!/^lab-\d{2}$/.test(labId)) throw new Error(`Invalid lab id ${labId}`);
  return join(labsPackageDir(), 'src', labId);
}

/** Server-side scratch directory for lab artefacts (gitignored). Override with MLP_DATA_DIR. */
export function dataDir(): string {
  return process.env.MLP_DATA_DIR ?? join(labsPackageDir(), '..', '..', '.data');
}
