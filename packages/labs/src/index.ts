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
import { lab06 } from './lab-06/run.js';
import { lab06Fixtures } from './lab-06/fixtures.js';
import { lab07 } from './lab-07/run.js';
import { lab07Fixtures } from './lab-07/fixtures.js';
import { lab08 } from './lab-08/run.js';
import { lab08Fixtures } from './lab-08/fixtures.js';
import { lab09 } from './lab-09/run.js';
import { lab09Fixtures } from './lab-09/fixtures.js';
import { lab10 } from './lab-10/run.js';
import { lab10Fixtures } from './lab-10/fixtures.js';
import { lab11 } from './lab-11/run.js';
import { lab11Fixtures } from './lab-11/fixtures.js';
import { lab12 } from './lab-12/run.js';
import { lab12Fixtures } from './lab-12/fixtures.js';
import { lab13 } from './lab-13/run.js';
import { lab13Fixtures } from './lab-13/fixtures.js';
import { lab14 } from './lab-14/run.js';
import { lab14Fixtures } from './lab-14/fixtures.js';
import { lab15 } from './lab-15/run.js';
import { lab15Fixtures } from './lab-15/fixtures.js';

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
export const allLabs: RegisteredLab[] = [
  reg(lab00, lab00Fixtures),
  reg(lab01, lab01Fixtures),
  reg(lab02, lab02Fixtures),
  reg(lab03, lab03Fixtures),
  reg(lab04, lab04Fixtures),
  reg(lab05, lab05Fixtures),
  reg(lab06, lab06Fixtures),
  reg(lab07, lab07Fixtures),
  reg(lab08, lab08Fixtures),
  reg(lab09, lab09Fixtures),
  reg(lab10, lab10Fixtures),
  reg(lab11, lab11Fixtures),
  reg(lab12, lab12Fixtures),
  reg(lab13, lab13Fixtures),
  reg(lab14, lab14Fixtures),
  reg(lab15, lab15Fixtures),
];

export function createLabRegistry(): LabRegistry<LabServices> {
  return new LabRegistry<LabServices>(allLabs.map((l) => l.implementation));
}
