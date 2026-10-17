import type { LabFixture } from '../fixtures.js';

export const lab00Fixtures: LabFixture[] = [
  {
    name: 'happy path echoes and passes all checks',
    input: { message: 'Hello Mastra learners', delayMs: 0 },
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: { echo: 'Echo: Hello Mastra learners', wordCount: 3, characterCount: 21, reversed: 'srenrael artsaM olleH' },
      eventTypes: [
        'log',
        'workflow-step',
        'tool-start',
        'tool-finish',
        'workflow-step',
        'workflow-step',
        'token',
        'token',
        'token',
        'token',
        'workflow-step',
        'result',
        'complete',
      ],
    },
  },
  {
    name: 'fault injection fails with a retryable provider error',
    input: { message: 'boom', delayMs: 0, simulateFailure: true },
    expect: { status: 'failed', errorCode: 'PROVIDER_ERROR' },
  },
];
