import type { LabFixture } from '../fixtures.js';

export const lab03Fixtures: LabFixture[] = [
  {
    name: 'key differs from id; both lookups return the same agent',
    input: {
      agentKey: 'helper',
      agentId: 'support-agent',
      agentName: 'Helper',
      instructions: 'You answer questions about store opening hours.',
      modelId: 'anthropic/claude-haiku-4-5',
      prompt: 'When do you open?',
    },
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: {
        registeredKeys: ['helper'],
        lookup: { byKey: { id: 'support-agent' }, byId: { id: 'support-agent' }, sameInstance: true },
        model: { id: 'anthropic/claude-haiku-4-5', simulated: true },
        text: 'Hi, I\'m Helper. You asked: "When do you open?". Following my instructions ("You answer questions about store opening hours."), this is a deterministic offline answer from the simulated model.',
      },
    },
  },
  {
    name: 'unknown model id fails with an actionable validation error',
    input: {
      agentKey: 'helper',
      agentId: 'helper',
      agentName: 'Helper',
      instructions: 'You answer questions.',
      modelId: 'openai/gpt-99-ultra',
      prompt: 'Hi',
    },
    expect: { status: 'failed', errorCode: 'VALIDATION_FAILED' },
  },
];
