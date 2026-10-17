import type { LabFixture } from '../fixtures.js';

export const lab08Fixtures: LabFixture[] = [
  {
    name: 'token budget stops the stream after five tokens',
    input: { prompt: 'Explain streaming.', modelId: 'anthropic/claude-haiku-4-5', tokenDelayMs: 0, stopAfterTokens: 5 },
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: { tokenEvents: 5, stoppedEarly: true, finishReason: 'budget' },
    },
  },
];
