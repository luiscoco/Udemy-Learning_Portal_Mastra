import type { LabFixture } from '../fixtures.js';
import { lab34Definition } from './definition.js';

const example = lab34Definition.exampleInput;

export const lab34Fixtures: LabFixture[] = [
  {
    name: 'crash recovery without an idempotency key duplicates the interrupted charge',
    input: { ...example, idempotency: 'none' },
    expect: { status: 'succeeded', validationPassed: false, output: { chargeCounts: { 'INV-1': 1, 'INV-2': 1, 'INV-3': 2, 'INV-4': 1 } } },
  },
  {
    name: 'crash right after the first invoice: only that step and the rest re-run',
    input: { ...example, crashAfter: 'INV-1' },
    expect: { status: 'succeeded', validationPassed: true, output: { chargeCounts: { 'INV-1': 1, 'INV-2': 1, 'INV-3': 1, 'INV-4': 1 } } },
  },
  {
    name: 'no crash: retries alone complete the batch',
    input: { ...example, crashAfter: 'none' },
    expect: { status: 'succeeded', validationPassed: true },
  },
];
