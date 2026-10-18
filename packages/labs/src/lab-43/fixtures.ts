import type { LabFixture } from '../fixtures.js';
import { lab43Definition } from './definition.js';

const example = lab43Definition.exampleInput;

export const lab43Fixtures: LabFixture[] = [
  {
    name: 'no reranker: the first stage keeps err-7001 above err-5003',
    input: { ...example, scorer: 'none' },
    expect: { status: 'succeeded', validationPassed: false },
  },
  {
    name: 'keyword scorer (local fallback) gives the same corrected ranking',
    input: { ...example, scorer: 'keyword' },
    expect: { status: 'succeeded', validationPassed: true },
  },
  {
    name: 'chatty scorer replies are flagged and neutralised',
    input: { ...example, chattyScorer: true },
    expect: { status: 'succeeded', validationPassed: false },
  },
];
