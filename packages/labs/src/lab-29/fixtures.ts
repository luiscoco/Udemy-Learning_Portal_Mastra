import type { LabFixture } from '../fixtures.js';
import { lab29Definition } from './definition.js';

const example = lab29Definition.exampleInput;

export const lab29Fixtures: LabFixture[] = [
  {
    name: 'overlapping thresholds: severity 4 runs three branches (AMBIGUOUS_ROUTE)',
    input: { ...example, predicateStyle: 'overlapping' },
    expect: { status: 'succeeded', validationPassed: false },
  },
  {
    name: 'no fallback: the unassessable ticket is UNROUTED',
    input: { ...example, fallback: false },
    expect: { status: 'succeeded', validationPassed: false },
  },
  {
    name: 'pre-assessed severity 1 goes to the standard queue',
    input: { ...example, tickets: [{ ticketId: 'T-7', text: 'Typo on the pricing page.', severity: 1, expectRoute: 'standard-queue' }] },
    expect: { status: 'succeeded', validationPassed: true },
  },
];
