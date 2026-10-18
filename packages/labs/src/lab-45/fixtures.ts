import type { LabFixture } from '../fixtures.js';
import { lab45Definition } from './definition.js';

const example = lab45Definition.exampleInput;

export const lab45Fixtures: LabFixture[] = [
  {
    name: 'keyword-only retrieval misses the paraphrased items: the hit-rate gate fails',
    input: { ...example, retrieval: 'keyword-only' },
    expect: { status: 'succeeded', validationPassed: false, output: { aggregates: { 'retrieval-hit-rate': { sum: 4, n: 6 } } } },
  },
  {
    name: 'a sloppy generator drops faithfulness below its gate',
    input: { ...example, offlineBehaviour: 'sloppy' },
    expect: { status: 'succeeded', validationPassed: false, output: { aggregates: { 'answer-faithfulness': { sum: 1, n: 7 } } } },
  },
  {
    name: 'vector-only retrieval also passes on this dataset',
    input: { ...example, retrieval: 'vector-only' },
    expect: { status: 'succeeded', validationPassed: true },
  },
];
