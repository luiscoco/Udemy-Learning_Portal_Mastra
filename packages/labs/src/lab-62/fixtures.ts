import type { LabFixture } from '../fixtures.js';
import { lab62Definition } from './definition.js';

export const lab62Fixtures: LabFixture[] = [
  {
    name: 'shared store leaks, partitions isolate',
    input: lab62Definition.exampleInput,
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: { partitioned: { bSawThreads: [] }, hostile: { underTenants: true }, run: { readableByB: false } },
    },
  },
  {
    name: 'other learners and an absolute-path owner id',
    input: {
      learnerA: 'student.one',
      learnerB: 'student.two',
      note: 'Invented private note',
      hostileOwner: 'C:\\Windows\\..\\..',
    },
    expect: { status: 'succeeded', validationPassed: true },
  },
];
