import type { LabFixture } from '../fixtures.js';
import { lab25Definition } from './definition.js';

const example = lab25Definition.exampleInput;

export const lab25Fixtures: LabFixture[] = [
  {
    name: 'explicitly labelled fallback',
    input: { ...example, implementation: 'fallback' },
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: { implementation: 'fallback', label: 'fallback (app-level, not Mastra observational memory)', observedMessages: 0 },
    },
  },
  {
    name: 'threshold not reached: no observations',
    input: { ...example, messageTokens: 5000 },
    expect: { status: 'succeeded', validationPassed: false, output: { implementation: 'native', observerCalls: 0 } },
  },
];
