import type { LabFixture } from '../fixtures.js';
import { lab31Definition } from './definition.js';

const example = lab31Definition.exampleInput;

export const lab31Fixtures: LabFixture[] = [
  {
    name: 'whole order to a strict schema: extras stripped, all checks pass',
    input: { ...example, boundaryFault: 'whole-order' },
    expect: { status: 'succeeded', validationPassed: true },
  },
  {
    name: 'loose schema: order fields leak into the subworkflow',
    input: { ...example, boundaryFault: 'loose-schema' },
    expect: { status: 'succeeded', validationPassed: false },
  },
  {
    name: 'malformed subworkflow output: caught at the boundary',
    input: { ...example, boundaryFault: 'bad-output' },
    expect: { status: 'succeeded', validationPassed: false },
  },
];
