import type { LabFixture } from '../fixtures.js';
import { lab58Definition } from './definition.js';

const example = lab58Definition.exampleInput;

export const lab58Fixtures: LabFixture[] = [
  {
    name: 'revision 1: three scenarios with the original assertions',
    input: { ...example, revision: '1' },
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: { requestedVersion: 3, evalReport: { summary: { total: 3 } } },
    },
  },
  {
    name: 'revision 2 equals the latest version',
    input: { ...example, revision: '2' },
    expect: { status: 'succeeded', validationPassed: true, output: { requestedVersion: 5, seed: { reseedApplied: 0 } } },
  },
];
