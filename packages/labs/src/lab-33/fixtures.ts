import type { LabFixture } from '../fixtures.js';
import { lab33Definition } from './definition.js';

const example = lab33Definition.exampleInput;

export const lab33Fixtures: LabFixture[] = [
  {
    name: 'no idempotency key: the retry after a lost acknowledgement pays twice',
    input: { ...example, idempotency: 'none' },
    expect: { status: 'succeeded', validationPassed: false },
  },
  {
    name: 'two lost acknowledgements: still one payment after three attempts',
    input: { ...example, ackFailures: 2 },
    expect: { status: 'succeeded', validationPassed: true },
  },
  {
    name: 'start only: every request waits at the gate, no payment',
    input: { ...example, action: 'start' },
    expect: { status: 'succeeded', validationPassed: true },
  },
];
