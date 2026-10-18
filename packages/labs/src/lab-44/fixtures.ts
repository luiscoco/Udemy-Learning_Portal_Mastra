import type { LabFixture } from '../fixtures.js';
import { lab44Definition } from './definition.js';

const example = lab44Definition.exampleInput;

export const lab44Fixtures: LabFixture[] = [
  {
    name: 'sloppy model, guard on: invented and misquoted claims are blocked, valid ones shown',
    input: { ...example, offlineBehaviour: 'sloppy' },
    expect: { status: 'succeeded', validationPassed: true },
  },
  {
    name: 'sloppy model, guard off: unmatched citations reach the reader',
    input: { ...example, offlineBehaviour: 'sloppy', guard: 'off' },
    expect: { status: 'succeeded', validationPassed: false },
  },
  {
    name: 'an unanswerable question alone gives an honest fallback',
    input: { ...example, questions: [{ question: 'Do you offer a student discount?', expect: { sources: [] } }] },
    expect: { status: 'succeeded', validationPassed: true, output: { citedAnswer: { claims: [], fallback: true } } },
  },
];
