import type { LabFixture } from '../fixtures.js';
import { lab71Definition } from './definition.js';

const base = lab71Definition.exampleInput;

export const lab71Fixtures: LabFixture[] = [
  {
    name: 'fresh database to v3',
    input: base,
    expect: { status: 'succeeded', validationPassed: true, output: { migration: { from: 0, versionAfter: 3 } } },
  },
  {
    name: 'failing migration 3 rolls back, then the retry succeeds',
    input: { ...base, failMigration: true },
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: { migration: { versionAfter: 3, rollback: { version: 2, quizColumn: false } } },
    },
  },
  {
    name: 'v1 only: no documents table',
    input: { ...base, targetVersion: 1 },
    expect: { status: 'succeeded', validationPassed: true, output: { written: { document: 'skipped' } } },
  },
];
