import type { LabFixture } from '../fixtures.js';

const fallbackText = "Sorry, I couldn't answer right now. Please try again in a moment.";

export const lab06Fixtures: LabFixture[] = [
  {
    name: 'provider error is replaced by the safe fallback',
    input: { prompt: 'Hello', modelId: 'openai/gpt-5-mini', failureMode: 'provider-error', fallbackText },
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: { text: fallbackText, usedFallback: true, fallbackReason: 'provider-error' },
    },
  },
  {
    name: 'empty answer is replaced by the safe fallback',
    input: { prompt: 'Hello', modelId: 'google/gemini-2.5-flash', failureMode: 'empty-response', fallbackText },
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: { text: fallbackText, usedFallback: true, fallbackReason: 'empty-response' },
    },
  },
];
