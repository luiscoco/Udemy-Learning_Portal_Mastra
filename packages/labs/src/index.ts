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
import { lab16 } from './lab-16/run.js';
import { lab16Fixtures } from './lab-16/fixtures.js';
import { lab17 } from './lab-17/run.js';
import { lab17Fixtures } from './lab-17/fixtures.js';
import { lab18 } from './lab-18/run.js';
import { lab18Fixtures } from './lab-18/fixtures.js';
import { lab19 } from './lab-19/run.js';
import { lab19Fixtures } from './lab-19/fixtures.js';
import { lab20 } from './lab-20/run.js';
import { lab20Fixtures } from './lab-20/fixtures.js';
import { lab21 } from './lab-21/run.js';
import { lab21Fixtures } from './lab-21/fixtures.js';
import { lab22 } from './lab-22/run.js';
import { lab22Fixtures } from './lab-22/fixtures.js';
import { lab23 } from './lab-23/run.js';
import { lab23Fixtures } from './lab-23/fixtures.js';
import { lab24 } from './lab-24/run.js';
import { lab24Fixtures } from './lab-24/fixtures.js';
import { lab25 } from './lab-25/run.js';
import { lab25Fixtures } from './lab-25/fixtures.js';
import { lab26 } from './lab-26/run.js';
import { lab26Fixtures } from './lab-26/fixtures.js';
import { lab27 } from './lab-27/run.js';
import { lab27Fixtures } from './lab-27/fixtures.js';
import { lab28 } from './lab-28/run.js';
import { lab28Fixtures } from './lab-28/fixtures.js';
import { lab29 } from './lab-29/run.js';
import { lab29Fixtures } from './lab-29/fixtures.js';
import { lab30 } from './lab-30/run.js';
import { lab30Fixtures } from './lab-30/fixtures.js';
import { lab31 } from './lab-31/run.js';
import { lab31Fixtures } from './lab-31/fixtures.js';
import { lab32 } from './lab-32/run.js';
import { lab32Fixtures } from './lab-32/fixtures.js';
import { lab33 } from './lab-33/run.js';
import { lab33Fixtures } from './lab-33/fixtures.js';
import { lab34 } from './lab-34/run.js';
import { lab34Fixtures } from './lab-34/fixtures.js';
import { lab35 } from './lab-35/run.js';
import { lab35Fixtures } from './lab-35/fixtures.js';
import { lab36 } from './lab-36/run.js';
import { lab36Fixtures } from './lab-36/fixtures.js';
import { lab37 } from './lab-37/run.js';
import { lab37Fixtures } from './lab-37/fixtures.js';
import { lab38 } from './lab-38/run.js';
import { lab38Fixtures } from './lab-38/fixtures.js';
import { lab39 } from './lab-39/run.js';
import { lab39Fixtures } from './lab-39/fixtures.js';
import { lab40 } from './lab-40/run.js';
import { lab40Fixtures } from './lab-40/fixtures.js';
import { lab41 } from './lab-41/run.js';
import { lab41Fixtures } from './lab-41/fixtures.js';
import { lab42 } from './lab-42/run.js';
import { lab42Fixtures } from './lab-42/fixtures.js';
import { lab43 } from './lab-43/run.js';
import { lab43Fixtures } from './lab-43/fixtures.js';
import { lab44 } from './lab-44/run.js';
import { lab44Fixtures } from './lab-44/fixtures.js';

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
  reg(lab16, lab16Fixtures),
  reg(lab17, lab17Fixtures),
  reg(lab18, lab18Fixtures),
  reg(lab19, lab19Fixtures),
  reg(lab20, lab20Fixtures),
  reg(lab21, lab21Fixtures),
  reg(lab22, lab22Fixtures),
  reg(lab23, lab23Fixtures),
  reg(lab24, lab24Fixtures),
  reg(lab25, lab25Fixtures),
  reg(lab26, lab26Fixtures),
  reg(lab27, lab27Fixtures),
  reg(lab28, lab28Fixtures),
  reg(lab29, lab29Fixtures),
  reg(lab30, lab30Fixtures),
  reg(lab31, lab31Fixtures),
  reg(lab32, lab32Fixtures),
  reg(lab33, lab33Fixtures),
  reg(lab34, lab34Fixtures),
  reg(lab35, lab35Fixtures),
  reg(lab36, lab36Fixtures),
  reg(lab37, lab37Fixtures),
  reg(lab38, lab38Fixtures),
  reg(lab39, lab39Fixtures),
  reg(lab40, lab40Fixtures),
  reg(lab41, lab41Fixtures),
  reg(lab42, lab42Fixtures),
  reg(lab43, lab43Fixtures),
  reg(lab44, lab44Fixtures),
];

export function createLabRegistry(): LabRegistry<LabServices> {
  return new LabRegistry<LabServices>(allLabs.map((l) => l.implementation));
}
