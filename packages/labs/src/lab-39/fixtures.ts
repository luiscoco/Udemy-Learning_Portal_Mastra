import type { LabFixture } from '../fixtures.js';
import { lab39Definition } from './definition.js';

const example = lab39Definition.exampleInput;

export const lab39Fixtures: LabFixture[] = [
  {
    name: 'small recursive chunks: a heading-only chunk wins the refund question',
    input: { ...example, chunking: 'recursive-200' },
    expect: { status: 'succeeded', validationPassed: false },
  },
  {
    name: 'empty index: explicit empty-index results, no error',
    input: { ...example, indexSource: 'empty' },
    expect: { status: 'succeeded', validationPassed: true },
  },
  {
    name: 'no threshold: the unrelated question returns weak hits',
    input: { ...example, minScore: -1 },
    expect: { status: 'succeeded', validationPassed: false },
  },
];
