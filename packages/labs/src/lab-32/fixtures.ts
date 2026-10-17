import type { LabFixture } from '../fixtures.js';
import { lab32Definition } from './definition.js';

const example = lab32Definition.exampleInput;

export const lab32Fixtures: LabFixture[] = [
  {
    name: 'rerun anti-pattern: side effects before the checkpoint happen twice',
    input: { ...example, checkpointStyle: 'rerun' },
    expect: { status: 'succeeded', validationPassed: false, output: { sideEffectCounts: { 'account-created': 2, 'fee-charged': 2, 'request-drafted': 2 } } },
  },
  {
    name: 'start only: suspended and persisted',
    input: { ...example, action: 'start' },
    expect: { status: 'succeeded', validationPassed: true },
  },
  {
    name: 'inspect an unknown run id: UNKNOWN_RUN, no throw',
    input: { ...example, action: 'inspect', workflowRunId: '00000000-0000-4000-8000-000000000000' },
    expect: { status: 'succeeded', validationPassed: false },
  },
];
