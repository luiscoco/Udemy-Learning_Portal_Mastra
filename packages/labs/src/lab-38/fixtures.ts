import type { LabFixture } from '../fixtures.js';
import { lab38Definition } from './definition.js';

const example = lab38Definition.exampleInput;

export const lab38Fixtures: LabFixture[] = [
  {
    name: 'random ids duplicate every record on re-upsert',
    input: { ...example, store: 'in-memory', idStrategy: 'random' },
    expect: { status: 'succeeded', validationPassed: false, output: { index: { countAfterFirst: 13, countAfterSecond: 26 } } },
  },
  {
    name: 'small batches: one embedding call per 4 chunks',
    input: { ...example, store: 'in-memory', batchSize: 4 },
    expect: { status: 'succeeded', validationPassed: true },
  },
  {
    name: 'in-memory store gives the same deterministic records',
    input: { ...example, store: 'in-memory' },
    expect: { status: 'succeeded', validationPassed: true, output: { selfQuery: { checked: 13, topHit: 13 } } },
  },
];
