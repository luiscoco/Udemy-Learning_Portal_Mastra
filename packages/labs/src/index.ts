import { LabRegistry, type AnyLabImplementation } from '@mlp/lab-engine';
import type { LabFixture } from './fixtures.js';
import type { LabServices } from './services.js';
import { lab00 } from './lab-00/run.js';
import { lab00Fixtures } from './lab-00/fixtures.js';
import { lab01 } from './lab-01/run.js';
import { lab01Fixtures } from './lab-01/fixtures.js';

export * from './services.js';
export { labSourceDir, labsPackageDir, dataDir } from './paths.js';
export type { LabFixture } from './fixtures.js';

export interface RegisteredLab {
  implementation: AnyLabImplementation<LabServices>;
  fixtures: LabFixture[];
}

const reg = (implementation: object, fixtures: LabFixture[]): RegisteredLab => ({
  implementation: implementation as unknown as AnyLabImplementation<LabServices>,
  fixtures,
});

/** Every implemented lab, in course order. Append new labs; never reorder or remove. */
export const allLabs: RegisteredLab[] = [reg(lab00, lab00Fixtures), reg(lab01, lab01Fixtures)];

export function createLabRegistry(): LabRegistry<LabServices> {
  return new LabRegistry<LabServices>(allLabs.map((l) => l.implementation));
}
