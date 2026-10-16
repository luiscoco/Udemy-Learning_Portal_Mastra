import { LabRegistry, type AnyLabImplementation } from '@mlp/lab-engine';
import type { LabFixture } from './fixtures.js';
import type { LabServices } from './services.js';
import { lab00 } from './lab-00/run.js';
import { lab00Fixtures } from './lab-00/fixtures.js';
import { lab01 } from './lab-01/run.js';
import { lab01Fixtures } from './lab-01/fixtures.js';
import { lab02 } from './lab-02/run.js';
import { lab02Fixtures } from './lab-02/fixtures.js';
import { lab03 } from './lab-03/run.js';
import { lab03Fixtures } from './lab-03/fixtures.js';
import { lab04 } from './lab-04/run.js';
import { lab04Fixtures } from './lab-04/fixtures.js';
import { lab05 } from './lab-05/run.js';
import { lab05Fixtures } from './lab-05/fixtures.js';

export * from './services.js';
export { labSourceDir, labsPackageDir, dataDir, resolveLabSourcePath } from './paths.js';
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
export const allLabs: RegisteredLab[] = [reg(lab00, lab00Fixtures), reg(lab01, lab01Fixtures), reg(lab02, lab02Fixtures), reg(lab03, lab03Fixtures), reg(lab04, lab04Fixtures), reg(lab05, lab05Fixtures)];

export function createLabRegistry(): LabRegistry<LabServices> {
  return new LabRegistry<LabServices>(allLabs.map((l) => l.implementation));
}
