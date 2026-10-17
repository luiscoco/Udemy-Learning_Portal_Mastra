import type { LabFixture } from '../fixtures.js';

export const lab11Fixtures: LabFixture[] = [
  {
    name: 'no discount, rounding half up on tax',
    input: {
      cart: { items: [{ name: 'Coffee', unitPriceCents: 333, quantity: 3 }], discountPct: 0, taxRatePct: 7.5 },
      question: 'Total?',
      modelId: 'anthropic/claude-haiku-4-5',
    },
    // 999 cents × 7.5% = 74.925 → 75; total 1074
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: {
        expected: { subtotalCents: 999, taxCents: 75, totalCents: 1074 },
        answer: 'The total is $10.74 (subtotal $9.99, discount $0.00, tax $0.75).',
      },
    },
  },
];
