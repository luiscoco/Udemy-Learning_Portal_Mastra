import type { LabFixture } from '../fixtures.js';
import { lab42Definition } from './definition.js';

const example = lab42Definition.exampleInput;

export const lab42Fixtures: LabFixture[] = [
  {
    name: 'keyword-only misses the paraphrased questions',
    input: { ...example, method: 'keyword-only' },
    expect: { status: 'succeeded', validationPassed: false },
  },
  {
    name: 'vector-only misses the exact error code',
    input: { ...example, method: 'vector-only' },
    expect: { status: 'succeeded', validationPassed: false },
  },
  {
    name: 'weighted blend with alpha 0.5 also gets every question right',
    input: { ...example, method: 'weighted' },
    expect: { status: 'succeeded', validationPassed: true },
  },
];
