import type { LabFixture } from '../fixtures.js';

export const lab13Fixtures: LabFixture[] = [
  {
    name: 'JPY formatting and an unknown SKU',
    input: { question: 'Price of CAP-0100 and ZZZ-9999?', currency: 'JPY', modelId: 'openai/gpt-5-mini' },
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: { skus: ['CAP-0100', 'ZZZ-9999'], answer: 'CAP-0100 (Baseball cap): 3 in stock, ¥2,268. ZZZ-9999: not found.' },
    },
  },
];
