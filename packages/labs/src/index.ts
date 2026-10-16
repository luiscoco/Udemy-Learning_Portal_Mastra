import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { LabRegistry, type AnyLabImplementation } from '@mlp/lab-engine';
import type { LabFixture } from './fixtures.js';
import type { LabServices } from './services.js';
import { lab00 } from './lab-00/run.js';
import { lab00Fixtures } from './lab-00/fixtures.js';

export * from './services.js';
export type { LabFixture } from './fixtures.js';

export interface RegisteredLab {
  implementation: AnyLabImplementation<LabServices>;
  fixtures: LabFixture[];
}

/** Every implemented lab, in course order. Append new labs; never reorder or remove. */
export const allLabs: RegisteredLab[] = [{ implementation: lab00 as AnyLabImplementation<LabServices>, fixtures: lab00Fixtures }];

export function createLabRegistry(): LabRegistry<LabServices> {
  return new LabRegistry<LabServices>(allLabs.map((l) => l.implementation));
}

const require = createRequire(import.meta.url);

/** Absolute directory of a lab's reference source (works from source and from the API bundle). */
export function labSourceDir(labId: string): string {
  if (!/^lab-\d{2}$/.test(labId)) throw new Error(`Invalid lab id ${labId}`);
  return join(dirname(require.resolve('@mlp/labs/package.json')), 'src', labId);
}
