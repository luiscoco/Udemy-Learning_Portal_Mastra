import type { LabFixture } from '../fixtures.js';
import { lab61Definition } from './definition.js';

export const lab61Fixtures: LabFixture[] = [
  {
    name: 'passcode-protected development session',
    input: { ...lab61Definition.exampleInput, passcode: 'invented-demo-only-61', ttlMs: 1_000 },
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: { credentialsAbsent: true, statuses: { expired: 401, otherLearner: 404 } },
    },
  },
  {
    name: 'different learners and longer session',
    input: { username: 'student.one', otherUser: 'student.two', ttlMs: 60_000 },
    expect: { status: 'succeeded', validationPassed: true },
  },
];
