import type { LabFixture } from '../fixtures.js';

const modelId = 'openai/gpt-5-mini';
const sessions = [
  { role: 'admin', locale: 'en-US' },
  { role: 'customer', locale: 'de-DE' },
  { role: 'support', locale: 'ja-JP' },
];

export const lab18Fixtures: LabFixture[] = [
  {
    name: 'formatted-output cache leaks the admin view into later sessions',
    input: { question: 'What is the status of my order ORD-3001?', sessions, cacheStrategy: 'cache-formatted-output', modelId },
    expect: {
      status: 'succeeded',
      validationPassed: false,
      output: {
        sessions: [
          { role: 'admin', toolOutput: { role: 'admin' } },
          { role: 'customer', cache: 'hit', toolOutput: { role: 'admin', email: 'jonas.weber@example.com' } },
          { role: 'support', cache: 'hit', toolOutput: { role: 'admin' } },
        ],
      },
    },
  },
  {
    name: 'second order, customer-only sessions in two locales',
    input: {
      question: 'Where is ORD-3002?',
      sessions: [
        { role: 'customer', locale: 'fr-FR' },
        { role: 'customer', locale: 'es-ES' },
      ],
      cacheStrategy: 'cache-raw-data',
      modelId,
    },
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: {
        orderId: 'ORD-3002',
        sessions: [
          { toolOutput: { status: 'En préparation', email: 'a•••@example.jp' } },
          { toolOutput: { status: 'En preparación' } },
        ],
      },
    },
  },
];
